/**
 * Copy-paste Chrome DevTools evaluate functions for the mission theater.
 *
 * Use with chrome-devtools MCP `evaluate_script` (function declaration
 * string) or CDP `Runtime.evaluate` wrapped as `({fn})()`. Raw protocol
 * method names live in {@link CDP_METHODS}.
 */

/** Dev-server origin + base path. Bare `http://localhost:5173/` will not load. */
export const THEATER_ORIGIN = "http://localhost:5173/tothemoon";

/** CDP / browser-protocol methods agents actually need here. */
export const CDP_METHODS = {
  navigate: "Page.navigate",
  reload: "Page.reload",
  screenshot: "Page.captureScreenshot",
  evaluate: "Runtime.evaluate",
  console: "Runtime.consoleAPICalled",
  keyDown: "Input.dispatchKeyEvent",
  metrics: "Page.getLayoutMetrics",
  webglErrors: "Log.enable",
} as const;

export const EVAL_SNAPSHOT =
  "() => window.__theater?.snapshot() ?? { ready: false, hash: location.hash, href: location.href }";

export const EVAL_WAIT_READY = `async () => {
  for (let i = 0; i < 40; i++) {
    const api = window.__theater;
    if (api?.ready) return api.snapshot();
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ready: false, timedOut: true, hash: location.hash, href: location.href };
}`;

export const EVAL_WEBGL =
  "() => window.__theater?.snapshot().webgl ?? { ok: false, lost: true }";

export const EVAL_HUD = `() => ({
  clock: document.getElementById("mission-clock-value")?.textContent ?? null,
  phase: document.getElementById("phase")?.textContent ?? null,
  cam: document.getElementById("tel-cam-mode")?.textContent ?? null,
  altitude: document.getElementById("tel-altitude")?.textContent ?? null,
  speed: document.getElementById("tel-speed")?.textContent ?? null,
  autoCam: document.getElementById("tel-auto-cam")?.textContent ?? null,
  hash: location.hash,
  title: document.title,
})`;

/** Seek then wait two animation frames so applyState has run. */
export function evalSeek(raw: string | number): string {
  return `async () => {
    const api = window.__theater;
    if (!api?.ready) return { ready: false, error: "theater not started" };
    api.seek(${JSON.stringify(raw)});
    return api.afterFrame();
  }`;
}

export function evalSetCamera(mode: string, frame = false): string {
  const method = frame ? "frameCamera" : "setCamera";
  return `() => window.__theater?.${method}(${JSON.stringify(mode)}) ?? { ready: false }`;
}

export const EVAL_GET_CAMERA =
  "() => window.__theater?.getCamera() ?? { ready: false, cam: null }";

export function evalSetCameraPose(pose: object): string {
  return `() => window.__theater?.setCameraPose(${JSON.stringify(pose)}) ?? { ready: false }`;
}

export function evalSetSpeed(speed: number): string {
  return `() => window.__theater?.setSpeed(${JSON.stringify(speed)}) ?? { ready: false }`;
}

export const EVAL_PLAY = "() => window.__theater?.play() ?? { ready: false }";
export const EVAL_PAUSE = "() => window.__theater?.pause() ?? { ready: false }";
export const EVAL_TOGGLE = "() => window.__theater?.toggle() ?? { ready: false }";

/**
 * Full document load for a mission. Bumps `?agent=` so a hash-only change
 * cannot reuse a live theater from a different mission.
 */
export function theaterUrl(
  mission: "flight-13" | "to-the-moon",
  seek?: string,
  origin = THEATER_ORIGIN,
): string {
  const nonce = `agent=${Date.now().toString(36)}`;
  const hash = seek
    ? `#/mission/${mission}?t=${seek}`
    : `#/mission/${mission}`;
  return `${origin}/?${nonce}${hash}`;
}

/** Space / minus / equals / bookmark digits — match the live HUD keymap. */
export const THEATER_KEYS = {
  playPause: "Space",
  camPrev: "-",
  camNext: "=",
  autoCam: "g",
  metrics: "m",
  hideHud: "h",
  keymap: "k",
  bookmark1: "1",
  bookmark6: "6",
} as const;

/**
 * In-page debug handle for browser agents (`window.__theater`).
 *
 * Lets Chrome DevTools MCP / CDP `Runtime.evaluate` read clock, camera, and
 * WebGL state and drive seek / play / camera without scraping the HUD.
 * Installed as a stub from `main.ts` (menus) and replaced when a theater boots.
 */

import {
  parseSeekTime,
  replaceMissionSeekHash,
} from "../app/seekUrl";
import type { CameraMode } from "../camera/modes";
import type { CameraWorldPose, CameraWorldPoseInput } from "../camera/worldPose";
import type { MissionClock } from "../mission/clock";
import {
  physicsTToTransportU,
  transportUToPhysicsT,
} from "../mission/prelaunch";
import { formatWebcastMissionTime } from "../ui/hudFormat";
import type { PhaseId } from "../physics/missionTypes";

export type { CameraWorldPose, CameraWorldPoseInput } from "../camera/worldPose";

/** Mission id written into snapshots (matches catalog / hash path). */
export type TheaterBridgeMission = "flight-13" | "to-the-moon";

const CAMERA_MODES: readonly CameraMode[] = [
  "free",
  "sun",
  "earth",
  "chase",
  "moon",
  "starbase",
  "fin",
  "gridfin",
  "trench",
  "hull",
  "drone",
];

/** Slice of a running theater the bridge needs. */
export type TheaterBridgeHandle = {
  mission: TheaterBridgeMission;
  clock: MissionClock;
  physicsDurationS: number;
  director: {
    getMode: () => CameraMode;
    setMode: (mode: CameraMode) => void;
    frameMode: (mode: CameraMode) => void;
    getWorldPose?: () => CameraWorldPose;
    setWorldPose?: (input: CameraWorldPoseInput) => void;
  };
  renderer?: { getContext: () => WebGLRenderingContext | WebGL2RenderingContext };
  camera?: { position: { x: number; y: number; z: number } };
  craftPos: { x: number; y: number; z: number };
  craftVel: { x: number; y: number; z: number };
  disableAutoCam: () => void;
  autoCamEnabled: () => boolean;
  phaseId?: () => PhaseId | string;
};

/** JSON-safe theater state for `evaluate_script` / `Runtime.evaluate`. */
export type TheaterSnapshot = {
  ready: boolean;
  mission: TheaterBridgeMission | null;
  href: string;
  hash: string;
  playing: boolean;
  speed: number;
  transportU: number;
  physicsT: number;
  clock: string;
  durationS: number;
  camera: CameraMode | null;
  /** Full world pose (position, target, look, up, FOV). Null before boot. */
  cam: CameraWorldPose | null;
  autoCam: boolean;
  phaseId: string | null;
  craft: { x: number; y: number; z: number; speed: number };
  camPos: { x: number; y: number; z: number } | null;
  webgl: WebglInfo;
  hud: HudScraped;
  error?: string;
};

export type WebglInfo = {
  ok: boolean;
  lost: boolean;
  width: number;
  height: number;
  vendor: string | null;
  renderer: string | null;
};

export type HudScraped = {
  clock: string | null;
  phase: string | null;
  cam: string | null;
  altitude: string | null;
  speed: string | null;
  autoCam: string | null;
};

/** Methods agents call from the page. Mutators return a fresh snapshot. */
export type TheaterDebugApi = {
  ready: boolean;
  mission: TheaterBridgeMission | null;
  snapshot: () => TheaterSnapshot;
  seek: (raw: string | number) => TheaterSnapshot;
  play: () => TheaterSnapshot;
  pause: () => TheaterSnapshot;
  toggle: () => TheaterSnapshot;
  setSpeed: (speed: number) => TheaterSnapshot;
  setCamera: (mode: string) => TheaterSnapshot;
  frameCamera: (mode: string) => TheaterSnapshot;
  /** World pose (km): position, OrbitControls target, look, up, FOV. */
  getCamera: () => CameraWorldPose | null;
  /** Seat a world pose; turns Auto-cam off and switches to free. */
  setCameraPose: (pose: CameraWorldPoseInput) => TheaterSnapshot;
  afterFrame: () => Promise<TheaterSnapshot>;
};

type TheaterWindow = Window & { __theater?: TheaterDebugApi };

/** Parse a seek argument the way agents type it (`1:05:21`, `3921`, `T+…`). */
export function resolveBridgeSeek(raw: string | number): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  return parseSeekTime(String(raw));
}

export function parseCameraMode(raw: string): CameraMode | null {
  return CAMERA_MODES.includes(raw as CameraMode) ? (raw as CameraMode) : null;
}

/** HUD ids agents can also read directly if the hook is not ready. */
export const THEATER_HUD_IDS = {
  canvas: "c",
  clock: "mission-clock-value",
  phase: "phase",
  cam: "tel-cam-mode",
  altitude: "tel-altitude",
  speed: "tel-speed",
  autoCam: "tel-auto-cam",
  scrub: "scrub",
} as const;

/** Read visible HUD strings (fallback when physics is not yet attached). */
export function scrapeHud(): HudScraped {
  return {
    clock: textOf(THEATER_HUD_IDS.clock),
    phase: textOf(THEATER_HUD_IDS.phase),
    cam: textOf(THEATER_HUD_IDS.cam),
    altitude: textOf(THEATER_HUD_IDS.altitude),
    speed: textOf(THEATER_HUD_IDS.speed),
    autoCam: textOf(THEATER_HUD_IDS.autoCam),
  };
}

/**
 * WebGL probe via the live Three.js renderer only.
 * Do not call `canvas.getContext` here — that can steal the context
 * before `WebGLRenderer` mounts (menu stub / pre-boot snapshot).
 */
export function inspectWebgl(
  renderer?: TheaterBridgeHandle["renderer"],
): WebglInfo {
  const gl = rendererContext(renderer);
  if (!gl) {
    return {
      ok: false,
      lost: false,
      width: 0,
      height: 0,
      vendor: null,
      renderer: null,
    };
  }
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    ok: !gl.isContextLost(),
    lost: gl.isContextLost(),
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    vendor: dbg
      ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL))
      : String(gl.getParameter(gl.VENDOR)),
    renderer: dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER)),
  };
}

/** Menu-time stub so `window.__theater.snapshot()` never throws. */
export function installTheaterBridgeStub(): void {
  const w = theaterWindow();
  if (!w) return;
  w.__theater = makeStubApi();
}

/** Replace the stub with a live handle after bootstrap. */
export function attachTheaterBridge(handle: TheaterBridgeHandle): void {
  const w = theaterWindow();
  if (!w) return;
  w.__theater = makeLiveApi(handle);
}

export function theaterApi(): TheaterDebugApi | undefined {
  return theaterWindow()?.__theater;
}

function makeLiveApi(handle: TheaterBridgeHandle): TheaterDebugApi {
  const snap = (): TheaterSnapshot => snapshotFromHandle(handle);
  const apply = (fn: () => void): TheaterSnapshot => {
    fn();
    return snap();
  };
  return {
    ready: true,
    mission: handle.mission,
    snapshot: snap,
    seek: (raw) => apply(() => seekHandle(handle, raw)),
    play: () => apply(() => handle.clock.play()),
    pause: () => apply(() => handle.clock.pause()),
    toggle: () => apply(() => handle.clock.toggle()),
    setSpeed: (speed) => apply(() => handle.clock.setSpeed(speed)),
    setCamera: (mode) => apply(() => setHandleCamera(handle, mode, false)),
    frameCamera: (mode) => apply(() => setHandleCamera(handle, mode, true)),
    getCamera: () => cameraPoseFromHandle(handle),
    setCameraPose: (pose) => apply(() => setCameraPoseOnHandle(handle, pose)),
    afterFrame: () => waitFrames(2).then(snap),
  };
}

function makeStubApi(): TheaterDebugApi {
  const snap = (error?: string): TheaterSnapshot => stubSnapshot(error);
  return {
    ready: false,
    mission: null,
    snapshot: () => snap(),
    seek: () => snap("theater not started"),
    play: () => snap("theater not started"),
    pause: () => snap("theater not started"),
    toggle: () => snap("theater not started"),
    setSpeed: () => snap("theater not started"),
    setCamera: () => snap("theater not started"),
    frameCamera: () => snap("theater not started"),
    getCamera: () => null,
    setCameraPose: () => snap("theater not started"),
    afterFrame: () => Promise.resolve(snap("theater not started")),
  };
}

/** Build a snapshot without touching `window` (unit tests). */
export function snapshotFromHandle(handle: TheaterBridgeHandle): TheaterSnapshot {
  const physicsT = transportUToPhysicsT(handle.clock.t, handle.physicsDurationS);
  const loc = pageLocation();
  const cam = cameraPoseFromHandle(handle);
  return {
    ready: true,
    mission: handle.mission,
    href: loc.href,
    hash: loc.hash,
    playing: handle.clock.playing,
    speed: handle.clock.speed,
    transportU: handle.clock.t,
    physicsT,
    clock: formatWebcastMissionTime(physicsT),
    durationS: handle.physicsDurationS,
    camera: handle.director.getMode(),
    cam,
    autoCam: handle.autoCamEnabled(),
    phaseId: handle.phaseId?.() ?? null,
    craft: {
      x: handle.craftPos.x,
      y: handle.craftPos.y,
      z: handle.craftPos.z,
      speed: hypot3(handle.craftVel),
    },
    camPos: cam
      ? cam.position
      : handle.camera
        ? {
            x: handle.camera.position.x,
            y: handle.camera.position.y,
            z: handle.camera.position.z,
          }
        : null,
    webgl: inspectWebgl(handle.renderer),
    hud: scrapeHud(),
  };
}

function stubSnapshot(error?: string): TheaterSnapshot {
  const loc = pageLocation();
  return {
    ready: false,
    mission: null,
    href: loc.href,
    hash: loc.hash,
    playing: false,
    speed: 1,
    transportU: 0,
    physicsT: 0,
    clock: "T+00:00:00",
    durationS: 0,
    camera: null,
    cam: null,
    autoCam: false,
    phaseId: null,
    craft: { x: 0, y: 0, z: 0, speed: 0 },
    camPos: null,
    webgl: inspectWebgl(),
    hud: scrapeHud(),
    ...(error ? { error } : {}),
  };
}

function seekHandle(handle: TheaterBridgeHandle, raw: string | number): void {
  const physicsT = resolveBridgeSeek(raw);
  if (physicsT == null) return;
  handle.clock.seek(physicsTToTransportU(physicsT, handle.physicsDurationS));
  replaceMissionSeekHash(handle.mission, physicsT);
}

function setHandleCamera(
  handle: TheaterBridgeHandle,
  raw: string,
  frame: boolean,
): void {
  const mode = parseCameraMode(raw);
  if (!mode) return;
  handle.disableAutoCam();
  if (frame) handle.director.frameMode(mode);
  else handle.director.setMode(mode);
}

/** Live pose for `getCamera` / `snapshot().cam`. */
export function cameraPoseFromHandle(
  handle: TheaterBridgeHandle,
): CameraWorldPose | null {
  return handle.director.getWorldPose?.() ?? null;
}

/** Seat a world pose; disables Auto-cam so the next frame keeps it. */
export function setCameraPoseOnHandle(
  handle: TheaterBridgeHandle,
  pose: CameraWorldPoseInput,
): void {
  handle.disableAutoCam();
  handle.director.setWorldPose?.(pose ?? {});
}

function rendererContext(
  renderer?: TheaterBridgeHandle["renderer"],
): WebGLRenderingContext | WebGL2RenderingContext | null {
  try {
    return renderer?.getContext() ?? null;
  } catch {
    return null;
  }
}

function textOf(id: string): string | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById(id);
  const t = el?.textContent?.trim();
  return t && t.length > 0 ? t : null;
}

function pageLocation(): { href: string; hash: string } {
  if (typeof location === "undefined") return { href: "", hash: "" };
  return { href: location.href, hash: location.hash };
}

function theaterWindow(): TheaterWindow | null {
  if (typeof window === "undefined") return null;
  return window as TheaterWindow;
}

function hypot3(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

function waitFrames(n: number): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    const step = (left: number): void => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

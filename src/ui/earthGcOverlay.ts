/**
 * Shared open/close for the whole-Earth great-circle overlay.
 * Used from the theater HUD and the Flight 13 / Flight 14 briefings.
 */

import {
  buildFlight13EarthGcModel,
  buildFlight14EarthGcModel,
  drawEarthGreatCircle,
  type EarthGcModel,
} from "./earthGreatCircle";

export type EarthGcProfile = "flight-13" | "flight-14";

let profile: EarthGcProfile = "flight-13";
let model: EarthGcModel | null = null;
let bound = false;

/** Select Flight 13 Gauteng GC vs Flight 14 orbital-plane view. */
export function setEarthGcProfile(next: EarthGcProfile): void {
  if (profile === next && model) return;
  profile = next;
  model = null;
}

function getModel(): EarthGcModel {
  if (!model) {
    model =
      profile === "flight-14"
        ? buildFlight14EarthGcModel()
        : buildFlight13EarthGcModel();
  }
  return model;
}

function els(): {
  root: HTMLElement | null;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  closeBtn: HTMLButtonElement | null;
  sub: HTMLElement | null;
  title: HTMLElement | null;
} {
  const root = document.getElementById("earth-gc");
  const canvas = document.querySelector<HTMLCanvasElement>("#earth-gc-canvas");
  return {
    root,
    canvas,
    ctx: canvas?.getContext("2d") ?? null,
    closeBtn: document.querySelector<HTMLButtonElement>("#earth-gc-close"),
    sub: document.getElementById("earth-gc-sub"),
    title: document.getElementById("earth-gc-title"),
  };
}

function syncOverlayCopy(m: EarthGcModel): void {
  const { title, sub } = els();
  if (title) title.textContent = m.title;
  if (sub) sub.textContent = m.subtitle;
}

/** Draw the active whole-Earth GC into the overlay canvas. */
export function redrawEarthGcOverlay(): void {
  const { root, canvas, ctx } = els();
  if (!root || root.hidden || !canvas || !ctx) return;
  const m = getModel();
  syncOverlayCopy(m);
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(rect.width, 320);
  const cssH = Math.max(rect.height, 200);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  drawEarthGreatCircle(ctx, m, cssW, cssH, dpr);
}

export function isEarthGcOverlayOpen(): boolean {
  const { root } = els();
  return !!root && !root.hidden;
}

export function setEarthGcOverlayOpen(open: boolean): void {
  ensureEarthGcOverlayBound();
  const { root } = els();
  if (!root) return;
  root.hidden = !open;
  document.body.classList.toggle("earth-gc-standalone", open);
  if (open) {
    requestAnimationFrame(() => redrawEarthGcOverlay());
  }
}

export function toggleEarthGcOverlay(): boolean {
  const next = !isEarthGcOverlayOpen();
  setEarthGcOverlayOpen(next);
  return next;
}

function bindEarthGcClose(root: HTMLElement | null, closeBtn: HTMLButtonElement | null): void {
  if (closeBtn) closeBtn.addEventListener("click", () => setEarthGcOverlayOpen(false));
  if (root) {
    root.addEventListener("click", (ev) => {
      if (ev.target === root) setEarthGcOverlayOpen(false);
    });
  }
}

function bindEarthGcWindow(): void {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isEarthGcOverlayOpen()) {
      e.preventDefault();
      setEarthGcOverlayOpen(false);
    }
  });
  window.addEventListener("resize", () => {
    if (isEarthGcOverlayOpen()) redrawEarthGcOverlay();
  });
}

/**
 * Wire close button + Esc once. Safe to call from HUD and briefings.
 */
export function ensureEarthGcOverlayBound(): void {
  if (bound) return;
  bound = true;
  const { root, closeBtn } = els();
  bindEarthGcClose(root, closeBtn);
  bindEarthGcWindow();
}

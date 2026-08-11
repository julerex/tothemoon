/**
 * Shared open/close for the whole-Earth great-circle overlay.
 * Used from the theater HUD and the Flight 13 briefing.
 */

import {
  buildFlight13EarthGcModel,
  drawEarthGreatCircle,
  type EarthGcModel,
} from "./earthGreatCircle";

let model: EarthGcModel | null = null;
let bound = false;

function getModel(): EarthGcModel {
  if (!model) model = buildFlight13EarthGcModel();
  return model;
}

function els(): {
  root: HTMLElement | null;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  closeBtn: HTMLButtonElement | null;
} {
  const root = document.getElementById("earth-gc");
  const canvas = document.querySelector<HTMLCanvasElement>("#earth-gc-canvas");
  return {
    root,
    canvas,
    ctx: canvas?.getContext("2d") ?? null,
    closeBtn: document.querySelector<HTMLButtonElement>("#earth-gc-close"),
  };
}

/** Draw the Flight 13 whole-Earth GC into the overlay canvas. */
export function redrawEarthGcOverlay(): void {
  const { root, canvas, ctx } = els();
  if (!root || root.hidden || !canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(rect.width, 320);
  const cssH = Math.max(rect.height, 200);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  drawEarthGreatCircle(ctx, getModel(), cssW, cssH, dpr);
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
 * Wire close button + Esc once. Safe to call from HUD and Flight 13.
 */
export function ensureEarthGcOverlayBound(): void {
  if (bound) return;
  bound = true;
  const { root, closeBtn } = els();
  bindEarthGcClose(root, closeBtn);
  bindEarthGcWindow();
}

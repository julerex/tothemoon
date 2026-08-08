/**
 * Shared open/close for the Earth-centric ecliptic-plane trajectory overlay.
 */

import type { Sample } from "../physics/missionTypes";
import {
  buildPolarTrajectoryModel,
  drawPolarTrajectories,
  livePolar,
  type PolarTrajectoryModel,
} from "./polarTrajectories";

let model: PolarTrajectoryModel | null = null;
let samplesRef: Sample[] = [];
let missionT = 0;
let bound = false;

function els(): {
  root: HTMLElement | null;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  closeBtn: HTMLButtonElement | null;
} {
  const root = document.getElementById("polar-map");
  const canvas = document.querySelector<HTMLCanvasElement>("#polar-map-canvas");
  return {
    root,
    canvas,
    ctx: canvas?.getContext("2d") ?? null,
    closeBtn: document.querySelector<HTMLButtonElement>("#polar-map-close"),
  };
}

/** Provide trajectory samples (from HUD bind). Rebuilds the polar model. */
export function setPolarOverlaySamples(samples: Sample[]): void {
  samplesRef = samples;
  model = samples.length > 0 ? buildPolarTrajectoryModel(samples) : null;
}

export function setPolarOverlayMissionT(t: number): void {
  missionT = t;
}

export function redrawPolarOverlay(): void {
  const { root, canvas, ctx } = els();
  if (!root || root.hidden || !canvas || !ctx || !model) return;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(rect.width, 320);
  const cssH = Math.max(rect.height, 200);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const live = livePolar(model, samplesRef, missionT);
  drawPolarTrajectories(ctx, model, live, missionT, cssW, cssH, dpr);
}

export function isPolarOverlayOpen(): boolean {
  const { root } = els();
  return !!root && !root.hidden;
}

export function setPolarOverlayOpen(open: boolean): void {
  ensurePolarOverlayBound();
  const { root } = els();
  if (!root) return;
  root.hidden = !open;
  document.body.classList.toggle("polar-map-open-body", open);
  if (open) {
    requestAnimationFrame(() => redrawPolarOverlay());
  }
}

export function togglePolarOverlay(): boolean {
  const next = !isPolarOverlayOpen();
  setPolarOverlayOpen(next);
  return next;
}

export function ensurePolarOverlayBound(): void {
  if (bound) return;
  bound = true;
  const { root, closeBtn } = els();
  if (closeBtn) {
    closeBtn.addEventListener("click", () => setPolarOverlayOpen(false));
  }
  if (root) {
    root.addEventListener("click", (ev) => {
      if (ev.target === root) setPolarOverlayOpen(false);
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isPolarOverlayOpen()) {
      e.preventDefault();
      setPolarOverlayOpen(false);
    }
  });
  window.addEventListener("resize", () => {
    if (isPolarOverlayOpen()) redrawPolarOverlay();
  });
}

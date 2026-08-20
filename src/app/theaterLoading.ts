/**
 * Full-screen overlay while a mission theater loads JS, meshes, and JPEGs.
 */

import { assetLoadFraction } from "../scene/assetLoad";

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Show the overlay (menus may still be underneath until bootstrap). */
export function showTheaterLoading(title: string): void {
  const root = el("theater-loading");
  if (!root) return;
  const titleEl = el("theater-loading-title");
  if (titleEl) titleEl.textContent = title;
  setTheaterLoadingProgress("Loading mission…", 0);
  root.hidden = false;
  root.classList.remove("theater-loading-out");
  document.body.classList.add("theater-loading-active");
  document.body.setAttribute("aria-busy", "true");
}

/**
 * Update status copy and the bar fill.
 *
 * @param status - Line under the mission title
 * @param fraction - 0…1
 */
export function setTheaterLoadingProgress(status: string, fraction: number): void {
  const statusEl = el("theater-loading-status");
  if (statusEl) statusEl.textContent = status;
  const fill = el("theater-loading-fill");
  const bar = el("theater-loading-bar");
  const u = assetLoadFraction(fraction, 1);
  if (fill) fill.style.transform = `scaleX(${u})`;
  if (bar) {
    bar.setAttribute("aria-valuenow", String(Math.round(u * 100)));
    bar.setAttribute("aria-valuetext", status);
  }
}

const FADE_MS = 420;

/** Fade out; resolves when the overlay is `hidden` (or immediately if absent). */
export function hideTheaterLoading(): Promise<void> {
  const root = el("theater-loading");
  document.body.classList.remove("theater-loading-active");
  document.body.removeAttribute("aria-busy");
  if (!root || root.hidden) return Promise.resolve();
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    root.hidden = true;
    root.classList.remove("theater-loading-out");
    return Promise.resolve();
  }
  root.classList.add("theater-loading-out");
  return new Promise((resolve) => {
    window.setTimeout(() => {
      root.hidden = true;
      root.classList.remove("theater-loading-out");
      resolve();
    }, FADE_MS);
  });
}

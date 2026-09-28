/**
 * Open/close and redraw for the flight-graphs dashboard.
 * Pause/resume stays in {@link ./hudPanels} so the clock hold matches Menu.
 */

import { drawFlightGraphs } from "./flightGraphsDraw";
import type { FlightGraphSeries } from "./flightGraphsSeries";

let series: FlightGraphSeries | null = null;
let missionT = 0;
let open = false;
let bound = false;

/** Replace the baked series (once per HUD bind). */
export function setFlightGraphsSeries(next: FlightGraphSeries | null): void {
  series = next;
}

export function setFlightGraphsMissionT(t: number): void {
  missionT = t;
}

export function redrawFlightGraphs(): void {
  if (!open || !series) return;
  const canvas = document.querySelector<HTMLCanvasElement>("#flight-graphs-canvas");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(rect.width, 320);
  const cssH = Math.max(rect.height, 200);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  drawFlightGraphs(ctx, series, missionT, cssW, cssH, dpr);
}

/** Show or hide the dashboard. Does not touch the mission clock. */
export function setFlightGraphsVisible(visible: boolean): void {
  open = visible;
  const root = document.getElementById("flight-graphs");
  if (root) root.hidden = !visible;
  if (visible) requestAnimationFrame(() => redrawFlightGraphs());
}

export function ensureFlightGraphsBound(): void {
  if (bound) return;
  bound = true;
  window.addEventListener("resize", () => {
    if (open) redrawFlightGraphs();
  });
}

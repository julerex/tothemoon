/**
 * Canvas paint for the flight-graphs dashboard (black and white).
 * Three stacked charts share mission time. A vertical playhead marks `t`.
 */

import { prepareDiagramCanvas } from "./canvasDiagram";
import { formatWebcastMissionTime } from "./hudFormat";
import {
  ALT_LOG_FLOOR_KM,
  interpolateFlightGraph,
  playheadFraction,
  type FlightGraphPoint,
  type FlightGraphSeries,
} from "./flightGraphsSeries";

const FONT = "11px Helvetica Neue, Helvetica, Arial, sans-serif";
const FONT_TICK = "10px ui-monospace, SF Mono, Menlo, monospace";

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

type YMap = {
  yOf: (value: number) => number;
  ticks: { value: number; label: string }[];
};

/** Draw altitude, speed, and acceleration with a playhead at `missionT`. */
export function drawFlightGraphs(
  ctx: CanvasRenderingContext2D,
  series: FlightGraphSeries,
  missionT: number,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  prepareDiagramCanvas(ctx, cssW, cssH, dpr);
  if (series.ship.length === 0 && series.booster.length === 0) {
    paintEmpty(ctx, cssW, cssH);
    return;
  }
  const tCursor = cursorT(missionT, series.durationS);
  const layout = chartLayout(cssW, cssH);
  paintHeader(ctx, series, tCursor, cssW);
  paintChart(ctx, layout.alt, "Altitude", series, altMap(series, layout.alt));
  paintChart(ctx, layout.speed, "Speed", series, linearMap(
    0,
    seriesMax(series, (p) => p.speedKmS),
    layout.speed,
    (v) => `${v.toFixed(v >= 10 ? 0 : 1)} km/s`,
  ));
  paintChart(ctx, layout.accel, "Acceleration", series, linearMap(
    0,
    seriesMax(series, (p) => p.accelG),
    layout.accel,
    (v) => `${v.toFixed(v >= 10 ? 0 : 1)} g`,
  ));
  paintTimeAxis(ctx, layout.accel, series.durationS);
  paintPlayhead(ctx, layout, series.durationS, tCursor);
}

function cursorT(missionT: number, durationS: number): number {
  if (!(durationS > 0)) return 0;
  return Math.min(durationS, Math.max(0, missionT));
}

function paintEmpty(ctx: CanvasRenderingContext2D, cssW: number, cssH: number): void {
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("No trajectory samples", cssW / 2, cssH / 2);
}

function chartLayout(cssW: number, cssH: number): { alt: Rect; speed: Rect; accel: Rect } {
  const left = 78;
  const right = cssW - 16;
  const header = 62;
  const timeAxis = 22;
  const gap = 10;
  const innerH = Math.max(60, cssH - header - timeAxis);
  const h = (innerH - gap * 2) / 3;
  const rect = (i: number): Rect => {
    const top = header + i * (h + gap);
    return { left, top, width: Math.max(10, right - left), height: h, right, bottom: top + h };
  };
  return { alt: rect(0), speed: rect(1), accel: rect(2) };
}

function paintHeader(
  ctx: CanvasRenderingContext2D,
  series: FlightGraphSeries,
  t: number,
  cssW: number,
): void {
  ctx.font = FONT;
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(16, 16);
  ctx.lineTo(36, 16);
  ctx.stroke();
  ctx.setLineDash([5, 4]);
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(108, 16);
  ctx.lineTo(128, 16);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText("Starship", 42, 16);
  ctx.fillText("Super Heavy", 134, 16);

  const ship = interpolateFlightGraph(series.ship, t, true);
  const boost = interpolateFlightGraph(series.booster, t, false);
  ctx.textAlign = "right";
  ctx.fillText(formatWebcastMissionTime(t), cssW - 16, 16);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(readout("Ship", ship), cssW - 16, 34);
  ctx.fillText(readout("Booster", boost), cssW - 16, 50);
}

function readout(name: string, p: FlightGraphPoint | null): string {
  if (!p) return `${name}  —`;
  return `${name}  ${fmtAlt(p.altKm)} · ${fmtSpeed(p.speedKmS)} · ${fmtG(p.accelG)}`;
}

function fmtAlt(km: number): string {
  const v = Math.max(0, km);
  if (v >= 10_000) return `${(v / 1000).toFixed(0)}k km`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k km`;
  if (v >= 10) return `${v.toFixed(0)} km`;
  return `${v.toFixed(1)} km`;
}

function fmtSpeed(kmS: number): string {
  return `${kmS.toFixed(kmS >= 10 ? 1 : 2)} km/s`;
}

function fmtG(g: number): string {
  return `${g.toFixed(2)} g`;
}

function paintChart(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  title: string,
  series: FlightGraphSeries,
  map: YMap,
): void {
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
  ctx.font = FONT_TICK;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const tick of map.ticks) {
    const y = map.yOf(tick.value);
    ctx.beginPath();
    ctx.moveTo(rect.left, y);
    ctx.lineTo(rect.right, y);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(tick.label, rect.left - 6, y);
  }
  const xOf = (time: number) => xAt(time, series.durationS, rect);
  const pick = valuePick(title);
  strokeVehicle(ctx, series.ship, xOf, (p) => map.yOf(pick(p)), false);
  strokeVehicle(ctx, series.booster, xOf, (p) => map.yOf(pick(p)), true);
  ctx.fillStyle = "#fff";
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, rect.left + 8, rect.top + 4);
}

function valuePick(title: string): (p: FlightGraphPoint) => number {
  if (title === "Speed") return (p) => p.speedKmS;
  if (title === "Acceleration") return (p) => p.accelG;
  return (p) => p.altKm;
}

function strokeVehicle(
  ctx: CanvasRenderingContext2D,
  points: FlightGraphPoint[],
  xOf: (t: number) => number,
  yOf: (p: FlightGraphPoint) => number,
  dashed: boolean,
): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(xOf(points[0]!.t), yOf(points[0]!));
  for (let i = 1; i < points.length; i++) ctx.lineTo(xOf(points[i]!.t), yOf(points[i]!));
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.globalAlpha = dashed ? 0.75 : 1;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = dashed ? 1.25 : 1.6;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function paintTimeAxis(ctx: CanvasRenderingContext2D, rect: Rect, durationS: number): void {
  ctx.font = FONT_TICK;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.textBaseline = "top";
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    const t = durationS * u;
    ctx.textAlign = u === 0 ? "left" : u === 1 ? "right" : "center";
    ctx.fillText(formatWebcastMissionTime(t), xAt(t, durationS, rect), rect.bottom + 6);
  }
}

function paintPlayhead(
  ctx: CanvasRenderingContext2D,
  layout: { alt: Rect; accel: Rect },
  durationS: number,
  t: number,
): void {
  const x = xAt(t, durationS, layout.alt);
  ctx.beginPath();
  ctx.moveTo(x, layout.alt.top);
  ctx.lineTo(x, layout.accel.bottom);
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = 0.92;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function xAt(t: number, durationS: number, rect: Rect): number {
  return rect.left + playheadFraction(t, durationS) * rect.width;
}

function seriesMax(series: FlightGraphSeries, pick: (p: FlightGraphPoint) => number): number {
  let max = 0;
  for (const p of series.ship) max = Math.max(max, pick(p));
  for (const p of series.booster) max = Math.max(max, pick(p));
  return max;
}

function altMap(series: FlightGraphSeries, rect: Rect): YMap {
  if (!series.logAltitude) {
    return linearMap(0, seriesMax(series, (p) => Math.max(0, p.altKm)), rect, fmtAlt);
  }
  const peak = Math.max(seriesMax(series, (p) => p.altKm), ALT_LOG_FLOOR_KM);
  const yOf = (value: number) => {
    const lo = Math.log10(ALT_LOG_FLOOR_KM);
    const hi = Math.log10(peak);
    const u = hi <= lo ? 0 : (Math.log10(Math.max(value, ALT_LOG_FLOOR_KM)) - lo) / (hi - lo);
    return rect.bottom - u * rect.height;
  };
  const ticks: { value: number; label: string }[] = [];
  const loE = Math.floor(Math.log10(ALT_LOG_FLOOR_KM));
  const hiE = Math.ceil(Math.log10(peak));
  for (let e = loE; e <= hiE; e++) {
    const value = 10 ** e;
    if (value < ALT_LOG_FLOOR_KM * 0.99 || value > peak * 1.01) continue;
    ticks.push({ value, label: fmtAlt(value) });
  }
  return { yOf, ticks };
}

function linearMap(
  min: number,
  max: number,
  rect: Rect,
  label: (v: number) => string,
): YMap {
  const hi = max > min ? max * 1.08 : min + 1;
  const yOf = (value: number) => {
    const u = (value - min) / (hi - min || 1);
    return rect.bottom - Math.min(1, Math.max(0, u)) * rect.height;
  };
  return {
    yOf,
    ticks: [min, (min + hi) / 2, hi].map((value) => ({ value, label: label(value) })),
  };
}

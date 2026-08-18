/**
 * Canvas paint for the ascent / RTLS cross-section diagram.
 */

import { ATM_H_MAX_KM } from "../physics/constants";
import type { RecoveryProfile } from "../physics/boosterRecovery";
import {
  drawBoosterIcon,
  drawShipIcon,
  drawStackLaunchIcon,
} from "./craftSilhouettes";
import {
  formatMissionClock,
  paintScaleBarLabel,
  paintScaleBarTicks,
  pickScaleKm,
  prepareDiagramCanvas,
  scaleBarGeom,
  worldToCanvas,
  type ViewTransform,
} from "./canvasDiagram";
import {
  fitView,
  trailUpTo,
  type CrossSectionLive,
  type CrossSectionModel,
  type PlanePoint,
  type TimedPlanePoint,
} from "./crossSectionGeometry";

export { worldToCanvas };

/** Draw the full black & white cross-section into a 2-D canvas. */
export function drawCrossSection(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  live: CrossSectionLive,
  missionT: number,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  prepareDiagramCanvas(ctx, cssW, cssH, dpr);
  const view = fitView(model.bounds, cssW, cssH, dpr);
  paintCrossSection(ctx, model, live, missionT, view, cssW, cssH);
}

function paintCrossSection(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  live: CrossSectionLive,
  missionT: number,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  const span = arcSpan(model.bounds);
  drawEarthAndAtmArcs(ctx, model, view, span);
  drawPadTick(ctx, model, view);
  drawCsLabels(ctx, model, view, span);
  drawScaleBar(ctx, view, cssW, cssH);
  drawCsTrails(ctx, model, missionT, view);
  drawStageMark(ctx, model, missionT, view);
  drawLiveIcons(ctx, live, view);
  drawCsReadout(ctx, live, missionT, cssW);
}

function arcSpan(bounds: { xMin: number; xMax: number; yMin: number; yMax: number }): { a0: number; a1: number } {
  const ang0 = Math.atan2(bounds.xMin, (bounds.yMin + bounds.yMax) / 2);
  const ang1 = Math.atan2(bounds.xMax, (bounds.yMin + bounds.yMax) / 2);
  return {
    a0: Math.min(ang0, ang1) - 0.002,
    a1: Math.max(ang0, ang1) + 0.002,
  };
}

function drawEarthAndAtmArcs(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  view: ViewTransform,
  span: { a0: number; a1: number },
): void {
  strokeWhiteArc(ctx, view, model.rEarth, span, 1.5, 1);
  strokeWhiteArc(ctx, view, model.rAtm, span, 1, 0.85);
}

function strokeWhiteArc(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  radius: number,
  span: { a0: number; a1: number },
  width: number,
  alpha: number,
): void {
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  strokeArc(ctx, view, radius, span.a0, span.a1);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPadTick(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  view: ViewTransform,
): void {
  const padSurf = padSurfacePoint(model);
  const scale = (model.rEarth + 3) / model.rEarth;
  const padTop = { x: padSurf.x * scale, y: padSurf.y * scale };
  strokeSegment(ctx, worldToCanvas(padSurf, view), worldToCanvas(padTop, view));
}

function strokeSegment(
  ctx: CanvasRenderingContext2D,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
): void {
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
}

function padSurfacePoint(model: CrossSectionModel): PlanePoint {
  const padWorld: PlanePoint = { x: 0, y: model.rEarth };
  const padRef = model.boosterTrail[0] ?? model.shipTrail[0] ?? padWorld;
  const L = Math.hypot(padRef.x, padRef.y) || model.rEarth;
  return {
    x: padRef.x * (model.rEarth / L),
    y: padRef.y * (model.rEarth / L),
  };
}

function drawCsLabels(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  view: ViewTransform,
  span: { a0: number; a1: number },
): void {
  setCsLabelStyle(ctx);
  fillEarthSurfaceLabel(ctx, model, view, span);
  fillAtmLabel(ctx, model, view, span);
  ctx.globalAlpha = 1;
}

function setCsLabelStyle(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.7;
}

function fillEarthSurfaceLabel(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  view: ViewTransform,
  span: { a0: number; a1: number },
): void {
  const midAng = (span.a0 + span.a1) / 2;
  const p = worldToCanvas(polarOnRadius(model.rEarth - 18, midAng), view);
  ctx.fillText("Earth surface", p.x, p.y);
}

function fillAtmLabel(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  view: ViewTransform,
  span: { a0: number; a1: number },
): void {
  const p = worldToCanvas(polarOnRadius(model.rAtm + 8, span.a1 - 0.01), view);
  ctx.fillText(`Atmosphere ${ATM_H_MAX_KM} km`, p.x, p.y);
}

function polarOnRadius(r: number, a: number): PlanePoint {
  return { x: r * Math.sin(a), y: r * Math.cos(a) };
}

function drawCsTrails(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  missionT: number,
  view: ViewTransform,
): void {
  strokeCsTrail(ctx, view, trailUpTo(model.shipTrail, missionT), 1.25, 0.35);
  strokeCsTrail(ctx, view, trailUpTo(model.boosterTrail, missionT), 1.6, 0.9);
}

function strokeCsTrail(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  trail: PlanePoint[],
  width: number,
  alpha: number,
): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = alpha;
  strokeTrail(ctx, view, trail);
  ctx.globalAlpha = 1;
}

function drawStageMark(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  missionT: number,
  view: ViewTransform,
): void {
  if (model.stageT == null || missionT < model.stageT) return;
  const stPt = trailPointAt(model.boosterTrail, model.stageT);
  if (!stPt) return;
  paintStageMark(ctx, worldToCanvas(stPt, view));
}

function paintStageMark(
  ctx: CanvasRenderingContext2D,
  c: { x: number; y: number },
): void {
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = "10px ui-monospace, SF Mono, Menlo, monospace";
  ctx.globalAlpha = 0.75;
  ctx.fillText("hot-stage", c.x + 6, c.y - 6);
  ctx.globalAlpha = 1;
}

function drawLiveIcons(
  ctx: CanvasRenderingContext2D,
  live: CrossSectionLive,
  view: ViewTransform,
): void {
  if (!live.staged && live.ship) {
    drawStackLaunchIcon(ctx, worldToCanvas(live.ship, view));
    return;
  }
  if (live.ship) {
    drawShipIcon(ctx, worldToCanvas(live.ship, view), 0.55);
  }
  if (live.booster && live.boosterFade > 0.02) {
    drawBoosterIcon(ctx, worldToCanvas(live.booster, view), live.boosterFade);
  }
}

function drawCsReadout(
  ctx: CanvasRenderingContext2D,
  live: CrossSectionLive,
  missionT: number,
  cssW: number,
): void {
  setCsReadoutStyle(ctx);
  fillCsReadoutLines(ctx, live, missionT);
  fillCsLegend(ctx, cssW, live.recoveryProfile);
}

function setCsReadoutStyle(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

function fillCsLegend(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  recovery: RecoveryProfile = "chopsticks",
): void {
  ctx.textAlign = "right";
  ctx.globalAlpha = 0.8;
  ctx.fillText("white trails · true scale · launch plane", cssW - 12, 10);
  const dest = recovery === "gulf" ? "Gulf splash" : "chopsticks";
  ctx.fillText(`Booster path: liftoff → ${dest}`, cssW - 12, 25);
  ctx.globalAlpha = 1;
}

function fillCsReadoutLines(
  ctx: CanvasRenderingContext2D,
  live: CrossSectionLive,
  missionT: number,
): void {
  const lines = csReadoutLines(live, missionT);
  let ly = 10;
  for (const line of lines) {
    ctx.fillText(line, 12, ly);
    ly += 15;
  }
}

function csReadoutLines(live: CrossSectionLive, missionT: number): string[] {
  const lines = [`t = ${formatMissionClock(missionT)}`];
  if (live.booster) {
    lines.push(altRangeLine("Booster ", live.boosterAltKm, live.boosterRangeKm));
  }
  if (live.ship) lines.push(shipStackReadout(live));
  return lines;
}

function altRangeLine(prefix: string, alt: number, range: number): string {
  return `${prefix} alt ${fmtKm(alt)}  range ${fmtKm(range)}`;
}

function shipStackReadout(live: CrossSectionLive): string {
  const prefix = live.staged ? "Ship    " : "Stack   ";
  return altRangeLine(prefix, live.shipAltKm, live.shipRangeKm);
}

function strokeArc(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  radius: number,
  a0: number,
  a1: number,
): void {
  for (let i = 0; i <= 64; i++) {
    const a = a0 + ((a1 - a0) * i) / 64;
    const p = worldToCanvas(
      { x: radius * Math.sin(a), y: radius * Math.cos(a) },
      view,
    );
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

function strokeTrail(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  trail: PlanePoint[],
): void {
  if (trail.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < trail.length; i++) {
    const c = worldToCanvas(trail[i]!, view);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  }
  ctx.stroke();
}

function trailPointAt(
  trail: TimedPlanePoint[],
  t: number,
): PlanePoint | null {
  if (trail.length === 0) return null;
  return nearestTrailPoint(trail, t);
}

function nearestTrailPoint(trail: TimedPlanePoint[], t: number): PlanePoint {
  let best = trail[0]!;
  let bestD = Math.abs(best.t - t);
  for (const p of trail) {
    const d = Math.abs(p.t - t);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  const km = pickScaleKm([50, 20, 10, 5], view, cssW, 20);
  const geom = scaleBarGeom(view, cssW, cssH, km);
  paintScaleBarTicks(ctx, geom);
  paintScaleBarLabel(ctx, geom, `${km} km`);
}

function fmtKm(km: number): string {
  if (!Number.isFinite(km)) return "—";
  if (Math.abs(km) < 1) return `${(km * 1000).toFixed(0)} m`;
  return `${km.toFixed(1)} km`;
}

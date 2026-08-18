/**
 * Canvas paint for the whole-Earth great-circle cross-section diagram.
 */

import { ATM_H_MAX_KM } from "../physics/constants";
import {
  paintScaleBarLabel,
  paintScaleBarTicks,
  pickScaleKm,
  prepareDiagramCanvas,
  scaleBarGeom,
  worldToCanvas,
  type ViewTransform,
} from "./canvasDiagram";
import {
  fitEarthGcView,
  suborbitalArcPoints,
  type EarthGcLabel,
  type EarthGcModel,
  type PlanePoint,
} from "./earthGreatCircleGeometry";

export { worldToCanvas };

/** Draw the whole-Earth great-circle cross-section (B&W). */
export function drawEarthGreatCircle(
  ctx: CanvasRenderingContext2D,
  model: EarthGcModel,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  prepareDiagramCanvas(ctx, cssW, cssH, dpr);
  const view = fitEarthGcView(model.bounds, cssW, cssH, dpr);
  paintEarthGc(ctx, model, view, cssW, cssH);
}

function paintEarthGc(
  ctx: CanvasRenderingContext2D,
  model: EarthGcModel,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  const c0 = worldToCanvas({ x: 0, y: 0 }, view);
  drawEarthDisk(ctx, c0, model.rEarth, view);
  drawAtmShell(ctx, c0, model.rAtm, view);
  drawStarbaseDiameter(ctx, model, view);
  drawSuborbitalArc(ctx, model, view);
  drawAllSiteLabels(ctx, model, view);
  drawEarthScaleBar(ctx, view, cssW, cssH);
  drawGcReadout(ctx, model, cssW);
}

function drawEarthDisk(
  ctx: CanvasRenderingContext2D,
  c0: { x: number; y: number },
  rEarth: number,
  view: ViewTransform,
): void {
  ctx.beginPath();
  ctx.arc(c0.x, c0.y, rEarth * view.scale, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0a";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.75;
  ctx.stroke();
}

function drawAtmShell(
  ctx: CanvasRenderingContext2D,
  c0: { x: number; y: number },
  rAtm: number,
  view: ViewTransform,
): void {
  ctx.beginPath();
  ctx.arc(c0.x, c0.y, rAtm * view.scale, 0, Math.PI * 2);
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawStarbaseDiameter(
  ctx: CanvasRenderingContext2D,
  model: EarthGcModel,
  view: ViewTransform,
): void {
  const sb = model.labels.find((l) => l.id === "starbase");
  if (!sb) return;
  const a = worldToCanvas(sb.surface, view);
  const b = worldToCanvas({ x: -sb.surface.x, y: -sb.surface.y }, view);
  strokeDashedSegment(ctx, a, b);
}

function strokeDashedSegment(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
): void {
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  lineAB(ctx, a, b);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function lineAB(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawSuborbitalArc(
  ctx: CanvasRenderingContext2D,
  model: EarthGcModel,
  view: ViewTransform,
): void {
  const arc = suborbitalArcPoints(model);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.85;
  strokeWorldPolyline(ctx, view, arc);
  ctx.globalAlpha = 1;
}

function strokeWorldPolyline(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  pts: PlanePoint[],
): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = worldToCanvas(pts[i]!, view);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function drawAllSiteLabels(
  ctx: CanvasRenderingContext2D,
  model: EarthGcModel,
  view: ViewTransform,
): void {
  ctx.font = "12px Helvetica Neue, Helvetica, Arial, sans-serif";
  for (const lab of model.labels) {
    drawSiteLabel(ctx, view, lab, model.rEarth);
  }
}

function drawGcReadout(
  ctx: CanvasRenderingContext2D,
  model: EarthGcModel,
  cssW: number,
): void {
  setGcReadoutStyle(ctx);
  ctx.globalAlpha = 0.9;
  fillGcLeftReadout(ctx, model);
  fillGcRightReadout(ctx, cssW);
}

function setGcReadoutStyle(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

function fillGcRightReadout(ctx: CanvasRenderingContext2D, cssW: number): void {
  ctx.textAlign = "right";
  ctx.globalAlpha = 0.75;
  ctx.fillText("true scale · full Earth · GC plane", cssW - 12, 10);
  ctx.fillText("dashed: Starbase diameter", cssW - 12, 26);
  ctx.globalAlpha = 1;
}

function fillGcLeftReadout(
  ctx: CanvasRenderingContext2D,
  model: EarthGcModel,
): void {
  const splashDeg = (model.plane.splashAngleRad * 180) / Math.PI;
  const arcKm = model.plane.splashAngleRad * model.rEarth;
  ctx.fillText("Flight 13 · Earth great-circle section", 12, 10);
  ctx.fillText(splashLine(splashDeg, arcKm), 12, 26);
  ctx.fillText(atmPeakLine(model), 12, 42);
}

function splashLine(splashDeg: number, arcKm: number): string {
  return `Starbase → splash  ${splashDeg.toFixed(1)}°  ·  ${fmtArcKm(arcKm)} surface`;
}

function atmPeakLine(model: EarthGcModel): string {
  return `Atmosphere shell ${ATM_H_MAX_KM} km · arc peak ~${model.arcPeakAltKm} km`;
}

function drawSiteLabel(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  lab: EarthGcLabel,
  rEarth: number,
): void {
  const surf = worldToCanvas(lab.surface, view);
  const { ux, uy } = radialUnit(lab.surface, rEarth);
  const out = worldToCanvas(
    { x: lab.surface.x + ux * 280, y: lab.surface.y + uy * 280 },
    view,
  );
  paintSiteMarker(ctx, surf, out);
  paintSiteText(ctx, view, lab, ux, uy, rEarth);
}

function radialUnit(
  surface: PlanePoint,
  rEarth: number,
): { ux: number; uy: number } {
  const L = Math.hypot(surface.x, surface.y) || rEarth;
  return { ux: surface.x / L, uy: surface.y / L };
}

function paintSiteMarker(
  ctx: CanvasRenderingContext2D,
  surf: { x: number; y: number },
  out: { x: number; y: number },
): void {
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.25;
  fillSiteDot(ctx, surf);
  strokeSiteLeader(ctx, surf, out);
}

function fillSiteDot(
  ctx: CanvasRenderingContext2D,
  surf: { x: number; y: number },
): void {
  ctx.beginPath();
  ctx.arc(surf.x, surf.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function strokeSiteLeader(
  ctx: CanvasRenderingContext2D,
  surf: { x: number; y: number },
  out: { x: number; y: number },
): void {
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(surf.x, surf.y);
  ctx.lineTo(out.x, out.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintSiteText(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  lab: EarthGcLabel,
  ux: number,
  uy: number,
  rEarth: number,
): void {
  const textPt = worldToCanvas({ x: ux * (rEarth + 520), y: uy * (rEarth + 520) }, view);
  const preferRight = ux >= 0;
  setSiteTextStyle(ctx, preferRight);
  ctx.fillText(lab.label, textPt.x + (preferRight ? 4 : -4), textPt.y);
}

function setSiteTextStyle(ctx: CanvasRenderingContext2D, preferRight: boolean): void {
  ctx.font = "12px Helvetica Neue, Helvetica, Arial, sans-serif";
  ctx.textAlign = preferRight ? "left" : "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
}

function drawEarthScaleBar(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  const km = pickScaleKm([5000, 2000, 1000, 500], view, cssW, 2000);
  const g = scaleBarGeom(view, cssW, cssH, km);
  paintScaleBarTicks(ctx, g);
  const label = km >= 1000 ? `${km / 1000} Mm` : `${km} km`;
  paintScaleBarLabel(ctx, g, label);
}

function fmtArcKm(km: number): string {
  if (!Number.isFinite(km)) return "—";
  if (km >= 1000) return `${(km / 1000).toFixed(2)} Mm`;
  return `${km.toFixed(0)} km`;
}

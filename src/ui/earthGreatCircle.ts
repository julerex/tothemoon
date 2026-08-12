/**
 * Whole-Earth great-circle cross-section (black & white, true scale).
 *
 * Flight 13 corridor: plane through Starbase and the Indian Ocean splashdown
 * zone; labels for Starbase, Gauteng, landing, and Australia projected onto
 * that great circle. Pure helpers are scrub-safe; canvas draw is live.
 */

import {
  ATM_H_MAX_KM,
  R_EARTH,
  STARBASE_LAT,
  STARBASE_LON,
} from "../physics/constants";
import {
  flight13GreatCirclePlane,
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
  GAUTENG_LAT,
  GAUTENG_LON,
  siteUnit,
  type Flight13CorridorPlane,
} from "../physics/flight13Corridor";
import { dot, v3 } from "../physics/vec3";

/** 2-D point in the Earth-centered great-circle plane (km). */
export type PlanePoint = { x: number; y: number };

export type EarthGcBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

/** Named surface site (geodetic). */
export type EarthGcSite = {
  id: string;
  label: string;
  /** Latitude (rad). */
  lat: number;
  /** Longitude (rad), east-positive. */
  lon: number;
};

/** Projected label on the GC plane. */
export type EarthGcLabel = {
  id: string;
  label: string;
  /** Angle from Starbase along the GC toward splashdown (rad, −π…π). */
  angleRad: number;
  /** Surface point in plane coords (on the Earth circle after projection). */
  surface: PlanePoint;
  /** Absolute distance off the GC plane (km). */
  offPlaneKm: number;
};

export type EarthGcPlane = Flight13CorridorPlane;

export type EarthGcModel = {
  profileId: "flight-13";
  title: string;
  subtitle: string;
  plane: EarthGcPlane;
  labels: EarthGcLabel[];
  rEarth: number;
  rAtm: number;
  /** Simple suborbital silhouette peak altitude (km). */
  arcPeakAltKm: number;
  bounds: EarthGcBounds;
};

export type ViewTransform = {
  scale: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  dpr: number;
};

// ── Flight 13 corridor sites (theater-grade coordinates) ───────────────

export {
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
  GAUTENG_LAT,
  GAUTENG_LON,
  siteUnit,
} from "../physics/flight13Corridor";

/** Approximate geographic center of Australia (label only). */
export const AUSTRALIA_LAT = (-25.2744 * Math.PI) / 180;
export const AUSTRALIA_LON = (133.7751 * Math.PI) / 180;

/** Sites that define / annotate the Flight 13 great-circle view. */
export const FLIGHT13_SITES: readonly EarthGcSite[] = [
  {
    id: "starbase",
    label: "Starbase",
    lat: STARBASE_LAT,
    lon: STARBASE_LON,
  },
  {
    id: "gauteng",
    label: "Gauteng",
    lat: GAUTENG_LAT,
    lon: GAUTENG_LON,
  },
  {
    id: "landing",
    label: "Landing",
    lat: FLIGHT13_SPLASH_LAT,
    lon: FLIGHT13_SPLASH_LON,
  },
  {
    id: "australia",
    label: "Australia",
    lat: AUSTRALIA_LAT,
    lon: AUSTRALIA_LON,
  },
] as const;

const _tmp = v3();

export { flight13GreatCirclePlane };

/**
 * Signed angle of a site in the GC plane, unwrapped onto the Flight 13 corridor
 * (Starbase ≈ 0, increasing through Gauteng toward splash / Australia).
 */
export function corridorAngleRad(
  lat: number,
  lon: number,
  plane: EarthGcPlane,
): number {
  const p = siteUnit(lat, lon, _tmp);
  let a = Math.atan2(dot(p, plane.v), dot(p, plane.u));
  const hi = plane.splashAngleRad + Math.PI / 2;
  while (a < -0.25) a += 2 * Math.PI;
  while (a > hi) a -= 2 * Math.PI;
  return a;
}

/**
 * Project a unit radial onto the GC plane → surface plane point + off-plane km.
 */
export function projectSiteToPlane(
  lat: number,
  lon: number,
  plane: EarthGcPlane,
  rEarth = R_EARTH,
): { surface: PlanePoint; angleRad: number; offPlaneKm: number } {
  const p = siteUnit(lat, lon, _tmp);
  const angleRad = corridorAngleRad(lat, lon, plane);
  return {
    surface: { x: rEarth * Math.cos(angleRad), y: rEarth * Math.sin(angleRad) },
    angleRad,
    offPlaneKm: Math.abs(dot(p, plane.n)) * rEarth,
  };
}

/**
 * Build the Flight 13 whole-Earth great-circle model (labels + framing).
 */
export function buildFlight13EarthGcModel(): EarthGcModel {
  const plane = flight13GreatCirclePlane();
  const rEarth = R_EARTH;
  return earthGcModelShell(
    plane,
    FLIGHT13_SITES.map((s) => siteToLabel(s, plane, rEarth)),
    rEarth,
    R_EARTH + ATM_H_MAX_KM,
    200,
  );
}

function earthGcModelShell(
  plane: EarthGcPlane,
  labels: EarthGcLabel[],
  rEarth: number,
  rAtm: number,
  arcPeakAltKm: number,
): EarthGcModel {
  return {
    profileId: "flight-13",
    title: "Earth great circle",
    subtitle: GC_SUBTITLE,
    plane, labels, rEarth, rAtm, arcPeakAltKm,
    bounds: earthGcBounds(rAtm, arcPeakAltKm),
  };
}

const GC_SUBTITLE =
  "Flight 13 · Starbase → Gauteng → Indian Ocean · Australia · true scale";

function siteToLabel(
  s: EarthGcSite,
  plane: EarthGcPlane,
  rEarth: number,
): EarthGcLabel {
  const pr = projectSiteToPlane(s.lat, s.lon, plane, rEarth);
  return {
    id: s.id,
    label: s.label,
    angleRad: pr.angleRad,
    surface: pr.surface,
    offPlaneKm: pr.offPlaneKm,
  };
}

function earthGcBounds(rAtm: number, arcPeakAltKm: number): EarthGcBounds {
  const margin = rAtm + arcPeakAltKm + 400;
  return {
    xMin: -margin,
    xMax: margin,
    yMin: -margin,
    yMax: margin,
  };
}

/** Fit the full Earth disk (with atmosphere + arc margin) into the canvas. */
export function fitEarthGcView(
  bounds: EarthGcBounds,
  cssW: number,
  cssH: number,
  dpr: number,
  padPx = 36,
): ViewTransform {
  const w = Math.max(1, cssW);
  const h = Math.max(1, cssH);
  const bw = Math.max(bounds.xMax - bounds.xMin, 1e-3);
  const bh = Math.max(bounds.yMax - bounds.yMin, 1e-3);
  const scale = Math.min((w - 2 * padPx) / bw, (h - 2 * padPx) / bh);
  return earthGcViewOrigin(bounds, w, h, scale, dpr);
}

function earthGcViewOrigin(
  bounds: EarthGcBounds,
  w: number,
  h: number,
  scale: number,
  dpr: number,
): ViewTransform {
  const usedW = (bounds.xMax - bounds.xMin) * scale;
  const usedH = (bounds.yMax - bounds.yMin) * scale;
  return {
    scale, originX: (w - usedW) / 2 - bounds.xMin * scale,
    originY: (h - usedH) / 2 + bounds.yMax * scale, width: w, height: h, dpr,
  };
}

export function worldToCanvas(
  p: PlanePoint,
  view: ViewTransform,
): { x: number; y: number } {
  return {
    x: view.originX + p.x * view.scale,
    y: view.originY - p.y * view.scale,
  };
}

/**
 * Sample a simple ballistic silhouette along the GC from Starbase (0) to splash.
 * Height peaks mid-arc — theater only, not a real trajectory pack.
 */
export function suborbitalArcPoints(
  model: EarthGcModel,
  steps = 96,
): PlanePoint[] {
  const a1 = model.plane.splashAngleRad;
  const pts: PlanePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    pts.push(suborbitalPoint(model, a1, i / steps));
  }
  return pts;
}

function suborbitalPoint(
  model: EarthGcModel,
  a1: number,
  f: number,
): PlanePoint {
  const ang = a1 * f;
  const h = model.arcPeakAltKm * Math.sin(Math.PI * f);
  const r = model.rEarth + h;
  return { x: r * Math.cos(ang), y: r * Math.sin(ang) };
}

/** Draw the whole-Earth great-circle cross-section (B&W). */
export function drawEarthGreatCircle(
  ctx: CanvasRenderingContext2D,
  model: EarthGcModel,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  prepareGcCanvas(ctx, cssW, cssH, dpr);
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

function prepareGcCanvas(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  const w = Math.max(1, Math.floor(cssW * dpr));
  const h = Math.max(1, Math.floor(cssH * dpr));
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cssW, cssH);
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
  const km = pickEarthScaleKm(view, cssW);
  const g = earthScaleGeom(view, cssW, cssH, km);
  paintEarthScaleTicks(ctx, g);
  const label = km >= 1000 ? `${km / 1000} Mm` : `${km} km`;
  paintEarthScaleLabel(ctx, g, label);
}

function pickEarthScaleKm(view: ViewTransform, cssW: number): number {
  for (const c of [5000, 2000, 1000, 500]) {
    if (c * view.scale < cssW * 0.28) return c;
  }
  return 2000;
}

function earthScaleGeom(
  view: ViewTransform,
  cssW: number,
  cssH: number,
  km: number,
): { x0: number; x1: number; y: number } {
  const px = km * view.scale;
  const x1 = cssW - 16;
  return { x0: x1 - px, x1, y: cssH - 18 };
}

function paintEarthScaleTicks(
  ctx: CanvasRenderingContext2D,
  g: { x0: number; x1: number; y: number },
): void {
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  pathEarthScale(ctx, g);
  ctx.stroke();
}

function pathEarthScale(
  ctx: CanvasRenderingContext2D,
  g: { x0: number; x1: number; y: number },
): void {
  ctx.moveTo(g.x0, g.y);
  ctx.lineTo(g.x1, g.y);
  ctx.moveTo(g.x0, g.y - 4);
  ctx.lineTo(g.x0, g.y + 4);
  ctx.moveTo(g.x1, g.y - 4);
  ctx.lineTo(g.x1, g.y + 4);
}

function paintEarthScaleLabel(
  ctx: CanvasRenderingContext2D,
  g: { x0: number; x1: number; y: number },
  label: string,
): void {
  ctx.font = "10px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, (g.x0 + g.x1) / 2, g.y - 6);
}

function fmtArcKm(km: number): string {
  if (!Number.isFinite(km)) return "—";
  if (km >= 1000) return `${(km / 1000).toFixed(2)} Mm`;
  return `${km.toFixed(0)} km`;
}

/**
 * Angular order of labels along the Flight 13 GC (Starbase ≈ 0 → splash → …).
 * Used by tests to assert corridor geography.
 */
export function labelAngleOrder(model: EarthGcModel): string[] {
  return [...model.labels]
    .sort((a, b) => a.angleRad - b.angleRad)
    .map((l) => l.id);
}

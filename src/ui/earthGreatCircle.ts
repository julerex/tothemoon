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
import { geodeticToMeshLocal } from "../physics/earthFrame";
import { cross, dot, normalize, type V3, v3 } from "../physics/vec3";

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

export type EarthGcPlane = {
  /** Mesh-local unit: Starbase radial. */
  u: V3;
  /** Mesh-local unit: 90° along GC toward splashdown. */
  v: V3;
  /** Mesh-local unit: plane normal. */
  n: V3;
  /** Central angle Starbase → splashdown (rad). */
  splashAngleRad: number;
};

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

/** Johannesburg / Gauteng province (rad). */
export const GAUTENG_LAT = (-26.2041 * Math.PI) / 180;
export const GAUTENG_LON = (28.0473 * Math.PI) / 180;

/**
 * Starship Flight 13 Indian Ocean splashdown (theater).
 * West of Australia / planned soft splashdown zone — not a surveyed fix.
 */
export const FLIGHT13_SPLASH_LAT = (-31.5 * Math.PI) / 180;
export const FLIGHT13_SPLASH_LON = (95.0 * Math.PI) / 180;

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
const _tmp2 = v3();
const _tmp3 = v3();

/** Unit mesh-local radial for a geodetic site. */
export function siteUnit(lat: number, lon: number, out: V3 = v3()): V3 {
  geodeticToMeshLocal(lat, lon, 1, out);
  return normalize(out, out);
}

/**
 * Best-fit great-circle plane through Starbase, Gauteng, and splashdown
 * (mesh-local, Earth-fixed). Normal ≈ S×G + G×L + L×S so all three lie near
 * the section; `u` is the Starbase radial projected into the plane.
 *
 * Orientation: Gauteng has positive angle from Starbase; splash angle is
 * unwrapped so the corridor runs Starbase → Gauteng → landing (increasing).
 */
export function flight13GreatCirclePlane(): EarthGcPlane {
  const s = siteUnit(STARBASE_LAT, STARBASE_LON, v3());
  const g = siteUnit(GAUTENG_LAT, GAUTENG_LON, v3());
  const splash = siteUnit(FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON, v3());

  // n ∝ S×G + G×L + L×S (best-fit plane through origin for three unit sites)
  cross(_tmp, s, g);
  cross(_tmp2, g, splash);
  cross(_tmp3, splash, s);
  const nRaw = v3(
    _tmp.x + _tmp2.x + _tmp3.x,
    _tmp.y + _tmp2.y + _tmp3.y,
    _tmp.z + _tmp2.z + _tmp3.z,
  );
  let n = normalize(v3(), nRaw);

  // Project Starbase into the plane → u
  const sn = dot(s, n);
  const uRaw = v3(s.x - n.x * sn, s.y - n.y * sn, s.z - n.z * sn);
  const u = normalize(v3(), uRaw);

  // v = n × u
  cross(_tmp, n, u);
  let v = normalize(v3(), _tmp);

  // Orient so Gauteng is on the +v side of Starbase
  if (Math.atan2(dot(g, v), dot(g, u)) < 0) {
    v = v3(-v.x, -v.y, -v.z);
  }

  // Re-orthonormalize after possible flip
  cross(_tmp2, u, v);
  n = normalize(v3(), _tmp2);
  cross(_tmp3, n, u);
  v = normalize(v3(), _tmp3);
  let gAng = Math.atan2(dot(g, v), dot(g, u));
  if (gAng < 0) {
    v = v3(-v.x, -v.y, -v.z);
    n = v3(-n.x, -n.y, -n.z);
    gAng = -gAng;
  }

  // Unwrap splash past Gauteng along the same tour (may exceed π)
  let splashAngleRad = Math.atan2(dot(splash, v), dot(splash, u));
  while (splashAngleRad < gAng) splashAngleRad += 2 * Math.PI;
  // Prefer the shorter unwrap if we overshot by a full turn
  if (splashAngleRad - gAng > Math.PI && splashAngleRad - 2 * Math.PI > 0) {
    const alt = splashAngleRad - 2 * Math.PI;
    if (alt >= gAng * 0.5) splashAngleRad = alt;
  }

  return { u, v, n, splashAngleRad };
}

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
  // Keep near the splash corridor (0 … splash+margin)
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
  const pn = dot(p, plane.n);
  // Corridor angle may unwrap past π for the Flight 13 tour
  const angleRad = corridorAngleRad(lat, lon, plane);
  return {
    surface: {
      x: rEarth * Math.cos(angleRad),
      y: rEarth * Math.sin(angleRad),
    },
    angleRad,
    offPlaneKm: Math.abs(pn) * rEarth,
  };
}

/**
 * Build the Flight 13 whole-Earth great-circle model (labels + framing).
 */
export function buildFlight13EarthGcModel(): EarthGcModel {
  const plane = flight13GreatCirclePlane();
  const rEarth = R_EARTH;
  const rAtm = R_EARTH + ATM_H_MAX_KM;
  const labels: EarthGcLabel[] = FLIGHT13_SITES.map((s) => {
    const pr = projectSiteToPlane(s.lat, s.lon, plane, rEarth);
    return {
      id: s.id,
      label: s.label,
      angleRad: pr.angleRad,
      surface: pr.surface,
      offPlaneKm: pr.offPlaneKm,
    };
  });

  // Suborbital silhouette: peak ~200 km (theater Starship coast height)
  const arcPeakAltKm = 200;
  const margin = rAtm + arcPeakAltKm + 400;
  const bounds: EarthGcBounds = {
    xMin: -margin,
    xMax: margin,
    yMin: -margin,
    yMax: margin,
  };

  return {
    profileId: "flight-13",
    title: "Earth great circle",
    subtitle:
      "Flight 13 · Starbase → Gauteng → Indian Ocean · Australia · true scale",
    plane,
    labels,
    rEarth,
    rAtm,
    arcPeakAltKm,
    bounds,
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
  const usedW = bw * scale;
  const usedH = bh * scale;
  const originX = (w - usedW) / 2 - bounds.xMin * scale;
  const originY = (h - usedH) / 2 + bounds.yMax * scale;
  return { scale, originX, originY, width: w, height: h, dpr };
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
    const f = i / steps;
    const ang = a1 * f;
    const h = model.arcPeakAltKm * Math.sin(Math.PI * f);
    const r = model.rEarth + h;
    pts.push({ x: r * Math.cos(ang), y: r * Math.sin(ang) });
  }
  return pts;
}

/** Draw the whole-Earth great-circle cross-section (B&W). */
export function drawEarthGreatCircle(
  ctx: CanvasRenderingContext2D,
  model: EarthGcModel,
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

  const view = fitEarthGcView(model.bounds, cssW, cssH, dpr);
  const { rEarth, rAtm } = model;
  const c0 = worldToCanvas({ x: 0, y: 0 }, view);

  // Earth disk fill
  ctx.beginPath();
  ctx.arc(c0.x, c0.y, rEarth * view.scale, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0a";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.75;
  ctx.stroke();

  // Atmosphere shell
  ctx.beginPath();
  ctx.arc(c0.x, c0.y, rAtm * view.scale, 0, Math.PI * 2);
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Great-circle diameter tick (Starbase ↔ antipode)
  const sb = model.labels.find((l) => l.id === "starbase");
  if (sb) {
    const a = worldToCanvas(sb.surface, view);
    const anti: PlanePoint = { x: -sb.surface.x, y: -sb.surface.y };
    const b = worldToCanvas(anti, view);
    ctx.strokeStyle = "#fff";
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Suborbital silhouette Starbase → splash
  const arc = suborbitalArcPoints(model);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let i = 0; i < arc.length; i++) {
    const p = worldToCanvas(arc[i]!, view);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Site markers + labels
  ctx.font = "12px Helvetica Neue, Helvetica, Arial, sans-serif";
  for (const lab of model.labels) {
    drawSiteLabel(ctx, view, lab, rEarth);
  }

  // Scale bar (Earth radius)
  drawEarthScaleBar(ctx, view, cssW, cssH);

  // Readout
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const splashDeg = (model.plane.splashAngleRad * 180) / Math.PI;
  const arcKm = model.plane.splashAngleRad * rEarth;
  ctx.globalAlpha = 0.9;
  ctx.fillText("Flight 13 · Earth great-circle section", 12, 10);
  ctx.fillText(
    `Starbase → splash  ${splashDeg.toFixed(1)}°  ·  ${fmtArcKm(arcKm)} surface`,
    12,
    26,
  );
  ctx.fillText(`Atmosphere shell ${ATM_H_MAX_KM} km · arc peak ~${model.arcPeakAltKm} km`, 12, 42);
  ctx.globalAlpha = 1;

  ctx.textAlign = "right";
  ctx.globalAlpha = 0.75;
  ctx.fillText("true scale · full Earth · GC plane", cssW - 12, 10);
  ctx.fillText("dashed: Starbase diameter", cssW - 12, 26);
  ctx.globalAlpha = 1;
}

function drawSiteLabel(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  lab: EarthGcLabel,
  rEarth: number,
): void {
  const surf = worldToCanvas(lab.surface, view);
  // Tick outward along radial
  const L = Math.hypot(lab.surface.x, lab.surface.y) || rEarth;
  const ux = lab.surface.x / L;
  const uy = lab.surface.y / L;
  const tickOut: PlanePoint = {
    x: lab.surface.x + ux * 280,
    y: lab.surface.y + uy * 280,
  };
  const out = worldToCanvas(tickOut, view);

  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(surf.x, surf.y, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(surf.x, surf.y);
  ctx.lineTo(out.x, out.y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Prefer text outside the disk
  const textR = rEarth + 520;
  const textPt = worldToCanvas(
    { x: ux * textR, y: uy * textR },
    view,
  );
  // Nudge text by quadrant so it doesn't sit on the leader
  const preferRight = ux >= 0;
  ctx.font = "12px Helvetica Neue, Helvetica, Arial, sans-serif";
  ctx.textAlign = preferRight ? "left" : "right";
  ctx.textBaseline = "middle";
  const tx = textPt.x + (preferRight ? 4 : -4);
  const ty = textPt.y;
  ctx.fillStyle = "#fff";
  ctx.fillText(lab.label, tx, ty);
}

function drawEarthScaleBar(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  const candidates = [5000, 2000, 1000, 500];
  let km = 2000;
  for (const c of candidates) {
    if (c * view.scale < cssW * 0.28) {
      km = c;
      break;
    }
  }
  const px = km * view.scale;
  const x1 = cssW - 16;
  const x0 = x1 - px;
  const y = cssH - 18;
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.moveTo(x0, y - 4);
  ctx.lineTo(x0, y + 4);
  ctx.moveTo(x1, y - 4);
  ctx.lineTo(x1, y + 4);
  ctx.stroke();
  ctx.font = "10px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${km >= 1000 ? `${km / 1000} Mm` : `${km} km`}`, (x0 + x1) / 2, y - 6);
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

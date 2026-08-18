/**
 * Whole-Earth great-circle model, projection, and framing.
 * Canvas paint lives in earthGreatCircleDraw.ts.
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
import { fitBoxView, type ViewTransform } from "./canvasDiagram";

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

export type { ViewTransform };

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

const GC_SUBTITLE =
  "Flight 13 · Starbase → Gauteng → Indian Ocean · Australia · true scale";

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
  return fitBoxView(bounds, cssW, cssH, dpr, padPx);
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

/**
 * Angular order of labels along the Flight 13 GC (Starbase ≈ 0 → splash → …).
 * Used by tests to assert corridor geography.
 */
export function labelAngleOrder(model: EarthGcModel): string[] {
  return [...model.labels]
    .sort((a, b) => a.angleRad - b.angleRad)
    .map((l) => l.id);
}

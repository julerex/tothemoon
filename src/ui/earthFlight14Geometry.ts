/**
 * Flight 14 orbital-plane / deorbit-target view.
 *
 * Not the Flight 13 Starbase–Gauteng great circle. Labels Starbase and the
 * public Chile-west splash *target* (briefing only — not a theater buoy).
 * The bake's splash is wherever deorbit + the force model meet the sea.
 */

import {
  ATM_H_MAX_KM,
  R_EARTH,
  STARBASE_LAT,
  STARBASE_LON,
} from "../physics/constants";
import { CHILE_WEST_LAT, CHILE_WEST_LON } from "../physics/flight14Corridor";
import { siteUnit } from "../physics/flight13Corridor";
import { INSERT_ALT_KM } from "../physics/flight14Timeline";
import { cross, normalize, type V3, v3 } from "../physics/vec3";
import {
  type EarthGcLabel,
  type EarthGcModel,
  type EarthGcPlane,
  type EarthGcSite,
  type PlanePoint,
  corridorAngleRad,
  projectSiteToPlane,
} from "./earthGreatCircleGeometry";

export const FLIGHT14_SITES: readonly EarthGcSite[] = [
  { id: "starbase", label: "Starbase", lat: STARBASE_LAT, lon: STARBASE_LON },
  { id: "chile-west", label: "Chile west (target)", lat: CHILE_WEST_LAT, lon: CHILE_WEST_LON },
];

const _a = v3();
const _b = v3();
const _n = v3();
const _v = v3();

/** Starbase → Chile-west great circle (planned splash target, not a buoy). */
export function flight14DeorbitPlane(): EarthGcPlane {
  siteUnit(STARBASE_LAT, STARBASE_LON, _a);
  siteUnit(CHILE_WEST_LAT, CHILE_WEST_LON, _b);
  normalize(_n, cross(v3(), _a, _b));
  const u: V3 = { x: _a.x, y: _a.y, z: _a.z };
  normalize(_v, cross(v3(), _n, u));
  return {
    u: { x: u.x, y: u.y, z: u.z },
    v: { x: _v.x, y: _v.y, z: _v.z },
    n: { x: _n.x, y: _n.y, z: _n.z },
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

/**
 * Flight 14 whole-Earth orbital-plane model (labels + LEO ring at ~275 km).
 */
export function buildFlight14EarthGcModel(): EarthGcModel {
  const plane = flight14DeorbitPlane();
  const rEarth = R_EARTH;
  const labels = FLIGHT14_SITES.map((s) => siteToLabel(s, plane, rEarth));
  const chile = labels.find((l) => l.id === "chile-west");
  if (chile) {
    const mid = chile.angleRad * 0.55;
    labels.push({
      id: "pacific",
      label: "Pacific",
      angleRad: mid,
      surface: { x: rEarth * Math.cos(mid), y: rEarth * Math.sin(mid) },
      offPlaneKm: 0,
    });
  }
  const margin = rEarth + ATM_H_MAX_KM + INSERT_ALT_KM + 400;
  return {
    profileId: "flight-14",
    title: "Orbital plane",
    subtitle:
      "Flight 14 · ~275 km · six-rev coast · Chile-west target (no buoy)",
    plane,
    labels,
    rEarth,
    rAtm: rEarth + ATM_H_MAX_KM,
    arcPeakAltKm: INSERT_ALT_KM,
    arcEndRad: Math.PI * 2,
    bounds: { xMin: -margin, xMax: margin, yMin: -margin, yMax: margin },
  };
}

/** Closed LEO ring in the deorbit-target plane (theater schematic). */
export function orbitalRingPoints(
  model: EarthGcModel,
  steps = 128,
): PlanePoint[] {
  const r = model.rEarth + model.arcPeakAltKm;
  const pts: PlanePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const ang = (Math.PI * 2 * i) / steps;
    pts.push({ x: r * Math.cos(ang), y: r * Math.sin(ang) });
  }
  return pts;
}

export { corridorAngleRad };

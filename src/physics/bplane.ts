/**
 * Moon-relative B-plane / perilune targeting helpers.
 *
 * Theater-grade: T/R frame uses lunar south as the reference pole so a
 * south-pole capture is an explicit aim (B along −T×S / +south), not a
 * post-hoc polar snap after lunar orbit insertion.
 */

import { LOW_LUNAR_ORBIT_ALTITUDE_KM, R_MOON } from "./constants";
import { moonSouthUnit } from "./bodies";
import { cross, dot, len, normalize, set, type V3, v3 } from "./vec3";

/** Design ballistic perilune altitude (km) — LOI-class, not an 8_000 km flyby. */
export const DESIGN_PERILUNE_ALT_KM = 400;

/** Incoming hyperbola / B-plane at closest approach. */
export type BPlane = {
  /** Miss along T (S × south). Polar south aim wants this near 0. */
  bT: number;
  /** Miss along R (S × T). Sign: +R is northward of the incoming asymptote. */
  bR: number;
  /** |B| (km). */
  bMag: number;
  /** r̂ · south at peri (−1 north … +1 south). */
  southAlign: number;
};

const _s = v3();
const _south = v3();
const _t = v3();
const _r = v3();
const _tmp = v3();

function fillSouth(): V3 {
  return moonSouthUnit(_south);
}

/** Fallback T when S is parallel to south. */
function fallbackT(s: V3, out: V3): V3 {
  set(_tmp, 1, 0, 0);
  cross(out, s, _tmp);
  if (len(out) < 1e-8) {
    set(_tmp, 0, 1, 0);
    cross(out, s, _tmp);
  }
  return normalize(out, out);
}

/**
 * B-plane of a Moon-relative periapsis state.
 *
 * S is the unit incoming velocity (at peri this is already ⟂ r). T = S × south
 * (or a fallback if S ‖ south). R = S × T so +R is the northward B-plane axis.
 */
export function bPlaneFromMoonRel(relP: V3, relV: V3): BPlane {
  const south = fillSouth();
  const rMag = len(relP);
  const southAlign = rMag > 1e-9 ? dot(relP, south) / rMag : 0;
  if (len(relV) < 1e-12) {
    return { bT: 0, bR: 0, bMag: rMag, southAlign };
  }
  normalize(_s, relV);
  cross(_t, _s, south);
  if (len(_t) < 1e-8) fallbackT(_s, _t);
  else normalize(_t, _t);
  cross(_r, _s, _t);
  normalize(_r, _r);
  const bT = dot(relP, _t);
  const bR = dot(relP, _r);
  return { bT, bR, bMag: Math.hypot(bT, bR), southAlign };
}

/**
 * Score a ballistic perilune against the design altitude + south-pole B-plane.
 * Lower is better. Impacts and distant misses are heavily penalized.
 */
export function periluneTargetScore(altKm: number, plane: BPlane): number {
  if (!Number.isFinite(altKm) || altKm > 400_000) return 1e12;
  if (altKm < 0) return 2_000 + Math.abs(altKm) * 8;
  const altErr = Math.abs(altKm - DESIGN_PERILUNE_ALT_KM);
  const far = altKm > 8_000 ? (altKm - 8_000) * 4 : 0;
  const veryFar = altKm > 45_000 ? (altKm - 45_000) * 12 : 0;
  const southErr = (1 - plane.southAlign) * 3_500;
  const polarErr = Math.abs(plane.bT) * 0.35;
  return altErr + far + veryFar + southErr + polarErr;
}

/** Design periapsis radius (km) for a circular-ish LOI gate. */
export function designPeriluneRadiusKm(): number {
  return R_MOON + DESIGN_PERILUNE_ALT_KM;
}

/** Re-export the LLO altitude the LOI burn still chases after this peri. */
export const LOI_CIRCULARIZE_ALT_KM = LOW_LUNAR_ORBIT_ALTITUDE_KM;

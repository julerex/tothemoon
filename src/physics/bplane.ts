/**
 * Moon-relative B-plane / perilune helpers (theater-grade two-body at encounter).
 *
 * The B-plane is perpendicular to the incoming hyperbolic asymptote and passes
 * through the Moon’s center. T̂ = Ŝ × k̂, R̂ = Ŝ × T̂ with k̂ = lunar north.
 * Elliptic / slow encounters fall back to the closest-approach miss vector.
 *
 * Scene unit = km. Pure + allocation-light (scratch vectors).
 */

import { MU_MOON, R_MOON } from "./constants";
import { moonNorthUnit } from "./bodies";
import {
  cross,
  dot,
  len,
  normalize,
  scale,
  set,
  type V3,
  v3,
} from "./vec3";

/** Design ballistic perilune altitude (km) — explicit search target, not min-anywhere. */
export const DESIGN_PERILUNE_ALT_KM = 8_000;

/** Theater B-plane miss that still counts as a close south-pole pass. */
export const BPLANE_CLOSE_MISS_KM = 25_000;

export type BPlaneEncounter = {
  /** Periapsis radius from Moon center (km) */
  periluneRadiusKm: number;
  /** Altitude above mean lunar radius (km); may be negative on impact */
  periluneAltKm: number;
  eccentricity: number;
  /** Specific energy (km²/s²); >0 hyperbolic */
  energyKm2S2: number;
  /** Hyperbolic excess speed (km/s); 0 when bound */
  vInfKmS: number;
  /** Impact-parameter magnitude (km) */
  bMagKm: number;
  /** B · T̂ (km) */
  bT: number;
  /** B · R̂ (km) */
  bR: number;
  /** r̂_ca · south; +1 = closest approach over the south pole */
  southDot: number;
  /**
   * Distance (km) between achieved B and the south-pole design B
   * (design |B| from {@link DESIGN_PERILUNE_ALT_KM} and v∞).
   */
  bPlaneMissKm: number;
};

const _h = v3();
const _eVec = v3();
const _pHat = v3();
const _qHat = v3();
const _hHat = v3();
const _sHat = v3();
const _tHat = v3();
const _rHatB = v3();
const _bVec = v3();
const _south = v3();
const _north = v3();
const _tmp = v3();
const _des = v3();

function eccentricityVector(r: V3, v: V3, mu: number, out: V3): number {
  const R = len(r) || 1;
  const v2 = dot(v, v);
  const vr = dot(r, v);
  out.x = ((v2 - mu / R) * r.x - vr * v.x) / mu;
  out.y = ((v2 - mu / R) * r.y - vr * v.y) / mu;
  out.z = ((v2 - mu / R) * r.z - vr * v.z) / mu;
  return len(out);
}

function incomingAsymptoteHyperbola(e: number): void {
  const nuInf = -Math.acos(Math.max(-1, Math.min(1, -1 / e)));
  const c = Math.cos(nuInf);
  const s = Math.sin(nuInf);
  set(_sHat, _pHat.x * c + _qHat.x * s, _pHat.y * c + _qHat.y * s, _pHat.z * c + _qHat.z * s);
  normalize(_sHat, _sHat);
}

function fillHyperbolicB(e: number, energy: number): number {
  const a = -MU_MOON / (2 * energy);
  const bMag = Math.abs(a) * Math.sqrt(Math.max(0, e * e - 1));
  incomingAsymptoteHyperbola(e);
  cross(_bVec, _hHat, _sHat);
  if (len(_bVec) < 1e-12) set(_bVec, _pHat.x, _pHat.y, _pHat.z);
  normalize(_bVec, _bVec);
  scale(_bVec, _bVec, bMag);
  return bMag;
}

function fillEllipticB(r: V3, v: V3): number {
  normalize(_sHat, v);
  const rs = dot(r, _sHat);
  set(_bVec, r.x - _sHat.x * rs, r.y - _sHat.y * rs, r.z - _sHat.z * rs);
  const bMag = len(_bVec);
  if (bMag < 1e-9) set(_bVec, r.x, r.y, r.z);
  return len(_bVec);
}

function designImpactParameter(vInf: number): number {
  const rpDes = R_MOON + DESIGN_PERILUNE_ALT_KM;
  if (vInf < 1e-6) return rpDes;
  const v2 = vInf * vInf;
  return Math.sqrt(rpDes * (rpDes + (2 * MU_MOON) / v2));
}

function southPoleDesignMiss(south: V3, bMag: number, vInf: number): number {
  const bDes = designImpactParameter(vInf);
  const sDot = dot(south, _sHat);
  set(_tmp, south.x - _sHat.x * sDot, south.y - _sHat.y * sDot, south.z - _sHat.z * sDot);
  if (len(_tmp) < 1e-12) return Math.abs(bMag - bDes);
  normalize(_tmp, _tmp);
  scale(_des, _tmp, bDes);
  return Math.hypot(_des.x - _bVec.x, _des.y - _bVec.y, _des.z - _bVec.z);
}

function trFrame(poleNorth: V3): void {
  cross(_tmp, _sHat, poleNorth);
  if (len(_tmp) < 1e-12) {
    set(_tmp, 1, 0, 0);
    if (Math.abs(dot(_tmp, _sHat)) > 0.9) set(_tmp, 0, 1, 0);
    cross(_tmp, _sHat, _tmp);
  }
  normalize(_tHat, _tmp);
  cross(_rHatB, _sHat, _tHat);
  normalize(_rHatB, _rHatB);
}

/**
 * Two-body B-plane / perilune at a Moon-relative state (typically closest approach).
 * `poleNorth` defaults to the theater lunar north so tests can pass an explicit axis.
 */
export function moonRelativeEncounter(
  r: V3,
  v: V3,
  poleNorth?: V3,
): BPlaneEncounter {
  const north = poleNorth ?? moonNorthUnit(_north);
  set(_south, -north.x, -north.y, -north.z);
  const R = len(r) || 1;
  cross(_h, r, v);
  const hMag = len(_h);
  const energy = 0.5 * dot(v, v) - MU_MOON / R;
  const e = eccentricityVector(r, v, MU_MOON, _eVec);
  const rp = hMag > 1e-12 ? (hMag * hMag) / (MU_MOON * (1 + e)) : R;
  const vInf = energy > 0 ? Math.sqrt(2 * energy) : 0;
  if (hMag > 1e-12) normalize(_hHat, _h);
  else set(_hHat, 0, 0, 1);
  if (e > 1e-12) normalize(_pHat, _eVec);
  else normalize(_pHat, r);
  cross(_qHat, _hHat, _pHat);
  if (len(_qHat) < 1e-12) set(_qHat, 0, 1, 0);
  else normalize(_qHat, _qHat);

  const hyperbolic = energy > 1e-10 && e > 1 + 1e-8;
  const bMag = hyperbolic ? fillHyperbolicB(e, energy) : fillEllipticB(r, v);
  trFrame(north);
  const miss = southPoleDesignMiss(_south, bMag, vInf);
  return {
    periluneRadiusKm: rp,
    periluneAltKm: rp - R_MOON,
    eccentricity: e,
    energyKm2S2: energy,
    vInfKmS: vInf,
    bMagKm: bMag,
    bT: dot(_bVec, _tHat),
    bR: dot(_bVec, _rHatB),
    southDot: dot(r, _south) / R,
    bPlaneMissKm: miss,
  };
}

/** True when the miss is small enough that a ballistic coast can feed LOI. */
export function bplaneMissNeedsTcm(missKm: number, periluneAltKm: number): boolean {
  if (!Number.isFinite(missKm) || !Number.isFinite(periluneAltKm)) return true;
  if (periluneAltKm > 40_000) return true;
  return missKm > BPLANE_CLOSE_MISS_KM;
}

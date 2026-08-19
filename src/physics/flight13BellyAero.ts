/** Belly entry drag, lift, and bank toward splash. */
import { R_EARTH } from "./constants";
import { atmDensity, entryCdAOverM, entryLiftToDrag } from "./atmosphere";
import { getBodies } from "./integrator";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import type { PropState } from "./propellant";
import { dot, len, normalize, set, sub, type V3 } from "./vec3";
import { F13, splashSurfaceInertial, smoothstep } from "./flight13Timeline";
import { _along, _horiz, _relP, _relV, _tmp, _tmp2, _tmp3, _up } from "./flight13Scratch";
import type { BurnMode } from "./flight13Types";
import { interceptAlongAt } from "./flight13Steer";

/** Belly drag + lift + bank toward splash during atmospheric entry. */
function bellyEntryActive(
  t: number, alt: number, vRel: number, prop: PropState, mode: BurnMode,
): boolean {
  return prop.staged && mode === "idle" && t >= F13.RELIGHT_END &&
    alt > 8 && alt < 120 && vRel > 0.8;
}

function bellyLiftBand(alt: number, rangeKm: number): number {
  // Soften the skip once the Indian Ocean site is in reach so leftover
  // energy does not carry the ship onto Australia.
  if (rangeKm < 500) return 0.15;
  if (alt > 25 && alt < 65) return 1.1;
  if (alt < 25) return 0.65;
  return 1.0;
}

function applyBellyLift(
  alt: number, vRel: number, vRad: number, aDrag: number, rangeKm: number,
  a: { ax: number; ay: number; az: number },
): void {
  if (!(vRel > 1.2 && alt > 10 && alt < 95)) return;
  if (!((vRad < 0 && vRel > 1.5) || rangeKm < 500)) return;
  const raw = aDrag * entryLiftToDrag(alt) * bellyLiftBand(alt, rangeKm);
  const aLift = Math.max(-0.006, Math.min(0.015, raw));
  a.ax += _up.x * aLift; a.ay += _up.y * aLift; a.az += _up.z * aLift;
}

function bellyDragLift(
  alt: number, vRel: number, vRad: number, rangeKm: number,
): { ax: number; ay: number; az: number; aDrag: number } {
  const near = rangeKm < 500 ? 1.4 : 1;
  const aDrag = Math.min(0.04, 0.5 * entryCdAOverM(alt) * atmDensity(alt) * vRel * near);
  const a = { ax: 0, ay: 0, az: 0, aDrag };
  if (aDrag > 1e-9) {
    a.ax -= (_relV.x / vRel) * aDrag;
    a.ay -= (_relV.y / vRel) * aDrag;
    a.az -= (_relV.z / vRel) * aDrag;
  }
  applyBellyLift(alt, vRel, vRad, aDrag, rangeKm, a);
  return a;
}

function fillEarthUpVel(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): {
  alt: number; vRel: number; vRad: number;
} {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.earth);
  const rL = len(_relP) || 1;
  set(_up, _relP.x / rL, _relP.y / rL, _relP.z / rL);
  sub(_relV, vel, b.earthVel);
  return { alt: rL - R_EARTH, vRel: len(_relV), vRad: dot(_relV, _up) };
}

export function bellyAeroAccel(
  t: number, pos: V3, vel: V3, prop: PropState, mode: BurnMode,
  epoch: EphemerisEpoch, interceptN: V3,
): { ax: number; ay: number; az: number } {
  const g = fillEarthUpVel(t, pos, vel, epoch);
  if (!bellyEntryActive(t, g.alt, g.vRel, prop, mode)) return { ax: 0, ay: 0, az: 0 };
  const splash = splashSurfaceInertial(t, _tmp2, epoch);
  const earth = getBodies(t, epoch).earth;
  sub(_relP, pos, earth);
  const L = len(_relP) || 1;
  const rangeKm = Math.acos(Math.min(1, Math.max(-1, dot(_relP, splash) / L))) * R_EARTH;
  const dl = bellyDragLift(g.alt, g.vRel, g.vRad, rangeKm);
  const bank = bellyBankAccel(t, pos, g.alt, g.vRel, g.vRad, dl.aDrag, epoch, interceptN);
  return { ax: dl.ax + bank.ax, ay: dl.ay + bank.ay, az: dl.az + bank.az };
}

/** Project vector onto plane ⊥ up into `_horiz`; return false if degenerate. */
function projectHorizOntoUp(vec: V3): boolean {
  const rd = dot(vec, _up);
  set(_horiz, vec.x - _up.x * rd, vec.y - _up.y * rd, vec.z - _up.z * rd);
  if (len(_horiz) <= 1e-6) return false;
  normalize(_horiz, _horiz);
  return true;
}

/**
 * Horizontal bank target: stay in the intercept plane, then home to splash
 * when close. Pure pursuit at the site from 1000 km out overshoots north
 * and forces the landing-burn hook.
 */
function fillDesiredHorizHeading(
  t: number, pos: V3, alt: number, epoch: EphemerisEpoch, interceptN: V3,
): boolean {
  const splash = splashSurfaceInertial(t, _tmp2, epoch);
  const earth = getBodies(t, epoch).earth;
  const r = R_EARTH + alt;
  set(_tmp3, earth.x + splash.x * r - pos.x, earth.y + splash.y * r - pos.y, earth.z + splash.z * r - pos.z);
  const hasSplash = projectHorizOntoUp(_tmp3);
  const sx = _horiz.x, sy = _horiz.y, sz = _horiz.z;
  interceptAlongAt(t, pos, interceptN, _along, epoch);
  const off = dot(_up, interceptN);
  const offKm = Math.abs(off) * r;
  let tx = 0, ty = 0, tz = 0;
  let hasXt = false;
  if (offKm > 2) {
    const s = off > 0 ? -1 : 1;
    set(_tmp, interceptN.x * s, interceptN.y * s, interceptN.z * s);
    const rd = dot(_tmp, _up);
    _tmp.x -= _up.x * rd; _tmp.y -= _up.y * rd; _tmp.z -= _up.z * rd;
    if (len(_tmp) > 1e-6) {
      normalize(_tmp, _tmp);
      tx = _tmp.x; ty = _tmp.y; tz = _tmp.z;
      hasXt = true;
    }
  }
  sub(_relP, pos, earth);
  const L = len(_relP) || 1;
  const ang = Math.acos(Math.min(1, Math.max(-1, dot(_relP, splash) / L)));
  const rangeKm = ang * R_EARTH;
  const wSplash = hasSplash ? smoothstep(800, 80, rangeKm) : 0;
  const wXt = hasXt ? Math.min(0.7, offKm / 80) : 0;
  set(
    _horiz,
    _along.x * (1 - wSplash) * (1 - 0.35 * wXt) + tx * wXt + sx * wSplash,
    _along.y * (1 - wSplash) * (1 - 0.35 * wXt) + ty * wXt + sy * wSplash,
    _along.z * (1 - wSplash) * (1 - 0.35 * wXt) + tz * wXt + sz * wSplash,
  );
  if (len(_horiz) < 1e-8) {
    if (hasSplash) { set(_horiz, sx, sy, sz); return true; }
    return false;
  }
  normalize(_horiz, _horiz);
  return true;
}

function zeroAccel(): { ax: number; ay: number; az: number } {
  return { ax: 0, ay: 0, az: 0 };
}

function bankCrossTrack(align: number, aDrag: number): { ax: number; ay: number; az: number } {
  set(_tmp2, _horiz.x - _tmp3.x * align, _horiz.y - _tmp3.y * align, _horiz.z - _tmp3.z * align);
  if (len(_tmp2) <= 1e-8) return zeroAccel();
  normalize(_tmp2, _tmp2);
  const aBank = Math.min(0.008, aDrag * 0.45 * (1 - align));
  return { ax: _tmp2.x * aBank, ay: _tmp2.y * aBank, az: _tmp2.z * aBank };
}

function bankLateralAccel(vRad: number, aDrag: number): { ax: number; ay: number; az: number } {
  set(_tmp3, _relV.x - _up.x * vRad, _relV.y - _up.y * vRad, _relV.z - _up.z * vRad);
  if (len(_tmp3) <= 0.3) return zeroAccel();
  normalize(_tmp3, _tmp3);
  const align = dot(_horiz, _tmp3);
  if (align >= 0.98) return zeroAccel();
  return bankCrossTrack(align, aDrag);
}

function bellyBankAccel(
  t: number, pos: V3, alt: number, vRel: number, vRad: number, aDrag: number,
  epoch: EphemerisEpoch, interceptN: V3,
): { ax: number; ay: number; az: number } {
  if (!(vRel > 1.0 && alt > 10 && alt < 110)) return { ax: 0, ay: 0, az: 0 };
  if (!fillDesiredHorizHeading(t, pos, alt, epoch, interceptN)) return { ax: 0, ay: 0, az: 0 };
  return bankLateralAccel(vRad, aDrag);
}


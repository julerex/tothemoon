/** Belly entry drag, lift, and bank toward splash. */
import { R_EARTH } from "./constants";
import { atmDensity, entryCdAOverM } from "./atmosphere";
import { EARTH_SPIN_RATE, earthNorthPole } from "./earthFrame";
import { getBodies, altitudeEarth } from "./integrator";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import type { PropState } from "./propellant";
import { cross, dot, len, normalize, set, sub, type V3 } from "./vec3";
import { F13, splashSurfaceInertial, smoothstep } from "./flight13Timeline";
import { webcastShipHudAt } from "./flight13Webcast";
import { _along, _horiz, _relP, _relV, _tmp, _tmp2, _tmp3, _up } from "./flight13Scratch";
import type { BurnMode } from "./flight13Types";
import { interceptAlongAt } from "./flight13Steer";

/** Belly drag + lift + bank toward splash during atmospheric entry. */
function bellyEntryActive(
  t: number, alt: number, vRel: number, prop: PropState, mode: BurnMode,
): boolean {
  return (prop.staged && (mode === "idle" || mode === "land") && t >= F13.ENTRY &&
    alt > 0.12 && alt < 90 && vRel > 0.02);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * PD + gravity feed-forward onto the webcast altitude corridor.
 * Without the g term, P-only droops ~10 km below the HUD (mg vs k·err).
 */
function applyBellyLift(
  t: number, alt: number, vRel: number, vRad: number,
  a: { ax: number; ay: number; az: number },
): void {
  if (!(vRel > 0.02 && alt > 0.12 && alt < 110)) return;
  const tgt = webcastShipHudAt(t).altKm;
  const tgtSoon = webcastShipHudAt(t + 6).altKm;
  const vRadTgt = (tgtSoon - tgt) / 6;
  const err = tgt - alt;
  const gain = err > 0 ? 0.0012 : 0.0007;
  const damped = (vRad - vRadTgt) * 0.75;
  const g = 0.00981;
  const aLift = clamp(g + err * gain - damped, -0.022, 0.022);
  a.ax += _up.x * aLift; a.ay += _up.y * aLift; a.az += _up.z * aLift;
}

function bellyDragLift(
  t: number, alt: number, vRel: number, vRad: number, rangeKm: number,
): { ax: number; ay: number; az: number; aDrag: number } {
  const near = rangeKm < 500 ? 1.3 : 1;
  const vTarget = webcastShipHudAt(t).kmh / 3600;
  const speedErr = vRel - vTarget;
  const aero = 0.5 * entryCdAOverM(alt) * atmDensity(alt) * vRel * near;
  // Extra brake only while faster than the HUD — the old dense×15 term
  // stopped the ship at ~25 km a minute before transonic.
  const guided = speedErr > 0 ? clamp(speedErr * 0.04, 0, 0.09) : 0;
  const aDrag = Math.min(0.10, aero + guided);
  const a = { ax: 0, ay: 0, az: 0, aDrag };
  if (aDrag > 1e-9 && vRel > 1e-6) {
    a.ax -= (_relV.x / vRel) * aDrag;
    a.ay -= (_relV.y / vRel) * aDrag;
    a.az -= (_relV.z / vRel) * aDrag;
  }
  applyBellyLift(t, alt, vRel, vRad, a);
  return a;
}

function fillEarthUpVel(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): {
  alt: number; vRel: number; vRad: number;
} {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.earth);
  const rL = len(_relP) || 1;
  set(_up, _relP.x / rL, _relP.y / rL, _relP.z / rL);
  earthNorthPole(_tmp);
  set(_tmp2, _tmp.x * EARTH_SPIN_RATE, _tmp.y * EARTH_SPIN_RATE, _tmp.z * EARTH_SPIN_RATE);
  cross(_tmp3, _tmp2, _relP);
  set(
    _relV,
    vel.x - b.earthVel.x - _tmp3.x,
    vel.y - b.earthVel.y - _tmp3.y,
    vel.z - b.earthVel.z - _tmp3.z,
  );
  return { alt: altitudeEarth(t, pos, epoch), vRel: len(_relV), vRad: dot(_relV, _up) };
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
  const dl = bellyDragLift(t, g.alt, g.vRel, g.vRad, rangeKm);
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


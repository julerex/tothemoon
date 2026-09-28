/** Belly entry drag, lift, and bank for Flight 14 (public T+ knots, not HUD pins). */
import { R_EARTH } from "./constants";
import { atmDensity, entryCdAOverM } from "./atmosphere";
import { EARTH_SPIN_RATE, earthNorthPole } from "./earthFrame";
import { getBodies, altitudeEarth } from "./integrator";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import type { PropState } from "./propellant";
import { cross, dot, len, normalize, set, sub, type V3 } from "./vec3";
import { F14 } from "./flight14Timeline";
import { _along, _horiz, _relP, _relV, _tmp, _tmp2, _tmp3, _up } from "./flight13Scratch";
import type { BurnMode } from "./flight14Types";
import { interceptAlongAt } from "./flight14Steer";

type EntryKnot = { t: number; altKm: number; kmh: number };

/** Public-table altitude / speed corridor for entry guidance. */
const ENTRY_KNOTS: readonly EntryKnot[] = [
  { t: F14.ENTRY - 60, altKm: 130, kmh: 27500 },
  { t: F14.ENTRY, altKm: 120, kmh: 27000 },
  { t: F14.TRANSONIC, altKm: 12, kmh: 1220 },
  { t: F14.SUBSONIC, altKm: 8, kmh: 900 },
  { t: F14.LAND_BURN, altKm: 0.85, kmh: 320 },
  { t: F14.SPLASH, altKm: 0.05, kmh: 20 },
];

function lerpKnot(t: number): EntryKnot {
  if (t <= ENTRY_KNOTS[0]!.t) return ENTRY_KNOTS[0]!;
  const last = ENTRY_KNOTS[ENTRY_KNOTS.length - 1]!;
  if (t >= last.t) return last;
  for (let i = 1; i < ENTRY_KNOTS.length; i++) {
    const b = ENTRY_KNOTS[i]!;
    const a = ENTRY_KNOTS[i - 1]!;
    if (t <= b.t) {
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return {
        t,
        altKm: a.altKm + (b.altKm - a.altKm) * u,
        kmh: a.kmh + (b.kmh - a.kmh) * u,
      };
    }
  }
  return last;
}

function bellyEntryActive(
  t: number, alt: number, vRel: number, prop: PropState, mode: BurnMode,
): boolean {
  return (
    prop.staged &&
    (mode === "idle" || mode === "land") &&
    t >= F14.ENTRY &&
    alt > 0.12 &&
    alt < 90 &&
    vRel > 0.02
  );
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function applyBellyLift(
  t: number, alt: number, vRel: number, vRad: number,
  a: { ax: number; ay: number; az: number },
): void {
  if (!(vRel > 0.02 && alt > 0.12 && alt < 110)) return;
  const tgt = lerpKnot(t).altKm;
  const tgtSoon = lerpKnot(t + 6).altKm;
  const vRadTgt = (tgtSoon - tgt) / 6;
  const err = tgt - alt;
  const gain = err > 0 ? 0.0012 : 0.06;
  const damped = (vRad - vRadTgt) * 0.75;
  const g = 0.00981;
  const aLift = clamp(g + err * gain - damped, -0.022, 0.022);
  a.ax += _up.x * aLift; a.ay += _up.y * aLift; a.az += _up.z * aLift;
}

function bellyDragLift(
  t: number, alt: number, vRel: number, vRad: number,
): { ax: number; ay: number; az: number; aDrag: number } {
  const vTarget = lerpKnot(t).kmh / 3600;
  const speedErr = vRel - vTarget;
  const aero = 0.5 * entryCdAOverM(alt) * atmDensity(alt) * vRel;
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

function fillDesiredHorizHeading(
  t: number, pos: V3, alt: number, epoch: EphemerisEpoch, interceptN: V3,
): boolean {
  interceptAlongAt(t, pos, interceptN, _along, epoch);
  const off = dot(_up, interceptN);
  const offKm = Math.abs(off) * (R_EARTH + alt);
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
  const wXt = hasXt ? Math.min(0.7, offKm / 80) : 0;
  set(
    _horiz,
    _along.x * (1 - 0.35 * wXt) + tx * wXt,
    _along.y * (1 - 0.35 * wXt) + ty * wXt,
    _along.z * (1 - 0.35 * wXt) + tz * wXt,
  );
  if (len(_horiz) < 1e-8) return false;
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

/** Belly drag + lift + bank onto the ascent intercept plane during entry. */
export function bellyAeroAccel(
  t: number, pos: V3, vel: V3, prop: PropState, mode: BurnMode,
  epoch: EphemerisEpoch, interceptN: V3,
): { ax: number; ay: number; az: number } {
  const g = fillEarthUpVel(t, pos, vel, epoch);
  if (!bellyEntryActive(t, g.alt, g.vRel, prop, mode)) return { ax: 0, ay: 0, az: 0 };
  const dl = bellyDragLift(t, g.alt, g.vRel, g.vRad);
  const bank = bellyBankAccel(t, pos, g.alt, g.vRel, g.vRad, dl.aDrag, epoch, interceptN);
  return { ax: dl.ax + bank.ax, ay: dl.ay + bank.ay, az: dl.az + bank.az };
}

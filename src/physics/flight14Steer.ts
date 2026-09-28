/** Corridor steering, intercept plane, and throttle tables for Flight 14. */
import { BOOSTER_THRUST_N, MU_EARTH, R_EARTH, SHIP_THRUST_N } from "./constants";
import { corridorAlongAt, flight14AscentPlane } from "./flight14Corridor";
import {
  EARTH_SPIN_RATE,
  earthNorthPole,
  meshLocalToInertial,
  starbasePadState,
} from "./earthFrame";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { radialHeightAboveEllipsoid } from "./wgs84";
import { getBodies } from "./integrator";
import type { Tank } from "./propellant";
import { cross, dot, len, normalize, set, sub, type V3, v3 } from "./vec3";
import {
  F14,
  SECO_ALT_MIN_KM,
  SECO_VCIRC_FRAC,
  smoothstep,
} from "./flight14Timeline";
import { _along, _horiz, _relP, _relV, _tmp, _tmp2, _up } from "./flight13Scratch";
import type { BurnMode, SteerGeo } from "./flight14Types";

function fillEarthRelGeo(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): {
  r: number;
  vRad: number;
  vHoriz: number;
} {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.earth);
  const r = len(_relP) || 1;
  set(_up, _relP.x / r, _relP.y / r, _relP.z / r);
  sub(_relV, vel, b.earthVel);
  const vRad = dot(_relV, _up);
  set(_horiz, _relV.x - _up.x * vRad, _relV.y - _up.y * vRad, _relV.z - _up.z * vRad);
  return { r, vRad, vHoriz: len(_horiz) };
}

/** Inertial copy of the ascent-corridor normal at liftoff. */
export function makeInterceptNormal(epoch: EphemerisEpoch): V3 {
  const pad = starbasePadState(0, epoch);
  const b0 = getBodies(0, epoch);
  const plane = flight14AscentPlane();
  meshLocalToInertial(plane.n, 0, _tmp2, epoch);
  const n = normalize(v3(), _tmp2);
  sub(_relP, pad.pos, b0.earth);
  normalize(_relP, _relP);
  cross(_along, n, _relP);
  corridorAlongAt(0, pad.pos, _tmp, epoch);
  if (dot(_along, _tmp) < 0) {
    n.x = -n.x;
    n.y = -n.y;
    n.z = -n.z;
  }
  return n;
}

export function interceptAlongAt(
  t: number,
  pos: V3,
  interceptN: V3,
  out: V3,
  epoch: EphemerisEpoch,
): V3 {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.earth);
  const r = len(_relP) || 1;
  set(_up, _relP.x / r, _relP.y / r, _relP.z / r);
  cross(out, interceptN, _up);
  if (len(out) < 1e-8) return corridorAlongAt(t, pos, out, epoch);
  normalize(out, out);
  const d = dot(out, _up);
  out.x -= _up.x * d;
  out.y -= _up.y * d;
  out.z -= _up.z * d;
  if (len(out) < 1e-8) return corridorAlongAt(t, pos, out, epoch);
  normalize(out, out);
  return out;
}

function blendAlongIntercept(
  t: number,
  pos: V3,
  interceptN: V3,
  epoch: EphemerisEpoch,
  xtWeight: number,
  out: V3,
): V3 {
  corridorAlongAt(t, pos, out, epoch);
  const off = dot(_up, interceptN);
  const offKm = Math.abs(off) * (R_EARTH + 200);
  if (offKm < 8 || xtWeight <= 0) return out;
  const s = off > 0 ? -1 : 1;
  set(_tmp, interceptN.x * s, interceptN.y * s, interceptN.z * s);
  const rd = dot(_tmp, _up);
  _tmp.x -= _up.x * rd;
  _tmp.y -= _up.y * rd;
  _tmp.z -= _up.z * rd;
  if (len(_tmp) < 1e-8) return out;
  normalize(_tmp, _tmp);
  const w = Math.min(xtWeight, offKm / 80);
  out.x += _tmp.x * w;
  out.y += _tmp.y * w;
  out.z += _tmp.z * w;
  normalize(out, out);
  return out;
}

function fillSteerFrame(
  t: number,
  pos: V3,
  vel: V3,
  epoch: EphemerisEpoch,
  interceptN: V3,
): SteerGeo {
  const g = fillEarthRelGeo(t, pos, vel, epoch);
  const xt = t < F14.SECO ? 0.45 : 0.12;
  earthNorthPole(_tmp);
  return {
    alt: radialHeightAboveEllipsoid(_relP, _tmp),
    vRad: g.vRad,
    vHoriz: g.vHoriz,
    vCirc: Math.sqrt(MU_EARTH / Math.max(g.r, R_EARTH + 50)),
    along: blendAlongIntercept(t, pos, interceptN, epoch, xt, _along),
  };
}

function fillGroundRelVel(pos: V3, vel: V3, earth: V3, earthVel: V3): void {
  sub(_relP, pos, earth);
  earthNorthPole(_tmp);
  set(_horiz, _tmp.x * EARTH_SPIN_RATE, _tmp.y * EARTH_SPIN_RATE, _tmp.z * EARTH_SPIN_RATE);
  cross(_tmp2, _horiz, _relP);
  set(
    _relV,
    vel.x - earthVel.x - _tmp2.x,
    vel.y - earthVel.y - _tmp2.y,
    vel.z - earthVel.z - _tmp2.z,
  );
}

function steerLandBrake(out: V3, alt: number): void {
  const v = len(_relV);
  set(out, -_relV.x / v, -_relV.y / v, -_relV.z / v);
  if (alt < 2.4) {
    const upW = Math.min(0.7, 0.38 + 0.12 * alt);
    out.x = out.x * (1 - upW) + _up.x * upW;
    out.y = out.y * (1 - upW) + _up.y * upW;
    out.z = out.z * (1 - upW) + _up.z * upW;
  }
  normalize(out, out);
}

function steerLand(
  t: number, pos: V3, vel: V3, alt: number, out: V3, epoch: EphemerisEpoch,
): void {
  const bL = getBodies(t, epoch);
  fillGroundRelVel(pos, vel, bL.earth, bL.earthVel);
  if (len(_relV) > 0.08) { steerLandBrake(out, alt); return; }
  set(out, _up.x, _up.y, _up.z);
}

/** Retrograde deorbit (single Raptor). */
function steerRetro(vHoriz: number, along: V3, out: V3): void {
  if (vHoriz > 0.05) {
    set(out, -_horiz.x / vHoriz, -_horiz.y / vHoriz, -_horiz.z / vHoriz);
  } else {
    set(out, -along.x, -along.y, -along.z);
  }
}

/** Single-Raptor circularize at the current radius (prograde, not corridor). */
function steerInsert(geo: SteerGeo, out: V3): void {
  const vTarget = geo.vCirc;
  const tgtRad = -1.5 * geo.vRad;
  const needH = Math.max(0, vTarget - geo.vHoriz);
  const radW = Math.min(0.8, 0.3 + Math.abs(geo.vRad) * 1.5);
  const hW = geo.vHoriz > vTarget ? -0.2 : 1 - radW + (needH > 0.03 ? 0.12 : 0);
  const hx = geo.vHoriz > 0.05 ? _horiz.x / geo.vHoriz : geo.along.x;
  const hy = geo.vHoriz > 0.05 ? _horiz.y / geo.vHoriz : geo.along.y;
  const hz = geo.vHoriz > 0.05 ? _horiz.z / geo.vHoriz : geo.along.z;
  set(out, hx * hW + _up.x * tgtRad, hy * hW + _up.y * tgtRad, hz * hW + _up.z * tgtRad);
  if (len(out) < 1e-8) set(out, hx, hy, hz);
  normalize(out, out);
}

function aimPitchAlong(along: V3, pitch: number, out: V3): void {
  const cosP = Math.cos(pitch); const sinP = Math.sin(pitch);
  set(
    out,
    _up.x * cosP + along.x * sinP,
    _up.y * cosP + along.y * sinP,
    _up.z * cosP + along.z * sinP,
  );
  normalize(out, out);
}

function pitchBoost(alt: number): number {
  if (alt < 0.15) return 0;
  if (alt < 48) return smoothstep(0.15, 48, alt) * (Math.PI / 2) * 0.9;
  return (Math.PI / 2) * 0.92;
}

function steerBoost(alt: number, along: V3, out: V3): void {
  aimPitchAlong(along, pitchBoost(alt), out);
}

function pitchUpperClimb(vRad: number, vHoriz: number, vTarget: number): number {
  const speedFrac = Math.min(1, vHoriz / Math.max(vTarget, 1));
  let pitch = (Math.PI / 2) * (0.5 + 0.4 * smoothstep(1.0, 5.5, vHoriz));
  if (vRad < 0.05) pitch = Math.max(0.35, pitch - 0.25);
  if (speedFrac > 0.9) pitch = Math.min((Math.PI / 2) * 0.92, pitch + 0.12);
  return pitch;
}

function steerUpperClimb(
  _alt: number,
  vRad: number,
  vHoriz: number,
  vTarget: number,
  along: V3,
  out: V3,
): void {
  aimPitchAlong(along, pitchUpperClimb(vRad, vHoriz, vTarget), out);
}

function steerUpperCircular(
  vRad: number,
  vHoriz: number,
  vTarget: number,
  along: V3,
  out: V3,
): void {
  const tgtRad = -1.4 * vRad;
  const needH = Math.max(0, vTarget - vHoriz);
  const radW = Math.min(0.75, 0.35 + Math.abs(vRad) * 1.4);
  // Do not keep adding along-track once we are at the suborbital target —
  // overshooting circular at SECO makes a fat ellipse the 19 s insert cannot fix.
  const hW = vHoriz >= vTarget ? -0.2 : 1 - radW + (needH > 0.05 ? 0.1 : 0);
  set(out, along.x * hW + _up.x * tgtRad, along.y * hW + _up.y * tgtRad, along.z * hW + _up.z * tgtRad);
  if (len(out) < 1e-8) set(out, along.x, along.y, along.z);
  normalize(out, out);
}

function steerUpperRaise(along: V3, vRad: number, out: V3): void {
  const upW = vRad < 0.12 ? 0.32 : 0.14;
  set(
    out,
    _up.x * upW + along.x * 0.82,
    _up.y * upW + along.y * 0.82,
    _up.z * upW + along.z * 0.82,
  );
  if (len(out) < 1e-8) set(out, along.x, along.y, along.z);
  normalize(out, out);
}

function steerUpper(geo: SteerGeo, out: V3): void {
  const vTarget = SECO_VCIRC_FRAC * geo.vCirc;
  if (geo.vHoriz >= vTarget) {
    steerUpperCircular(geo.vRad, geo.vHoriz, vTarget, geo.along, out);
    return;
  }
  if (geo.alt < SECO_ALT_MIN_KM && geo.vHoriz < vTarget * 0.92) {
    steerUpperClimb(geo.alt, geo.vRad, geo.vHoriz, vTarget, geo.along, out);
    return;
  }
  if (geo.alt < SECO_ALT_MIN_KM) {
    steerUpperRaise(geo.along, geo.vRad, out);
    return;
  }
  steerUpperCircular(geo.vRad, geo.vHoriz, vTarget, geo.along, out);
}

export function steer(
  t: number,
  pos: V3,
  vel: V3,
  mode: BurnMode,
  out: V3,
  epoch: EphemerisEpoch,
  interceptN: V3,
): void {
  const geo = fillSteerFrame(t, pos, vel, epoch, interceptN);
  if (mode === "idle") { set(out, 0, 0, 0); return; }
  if (mode === "land") { steerLand(t, pos, vel, geo.alt, out, epoch); return; }
  if (mode === "deorbit") { steerRetro(geo.vHoriz, geo.along, out); return; }
  if (mode === "insert") { steerInsert(geo, out); return; }
  if (mode === "boost") { steerBoost(geo.alt, geo.along, out); return; }
  steerUpper(geo, out);
}

function throttleBoost(t: number, alt: number): number {
  let thr = 0.9;
  if (alt > 4 && alt < 16) thr *= 0.88;
  if (alt < 2) thr = 0.84;
  if (t > F14.MECO - 8) thr *= Math.max(0.15, (F14.HOT_STAGE - t) / 12);
  return Math.max(0, Math.min(1, thr));
}

function throttleLand(t: number, alt: number): number {
  let thr = 0.95;
  if (t >= F14.LAND_3TO2) thr = 0.62;
  if (t >= F14.LAND_2TO1) thr = 0.38;
  if (alt < 0.7) thr *= 0.55;
  return thr;
}

export function throttleFor(t: number, alt: number, mode: BurnMode): number {
  if (mode === "idle") return 0;
  if (mode === "hot_stage") return 0.55;
  if (mode === "insert" || mode === "deorbit") return 0.65;
  if (mode === "land") return throttleLand(t, alt);
  if (mode === "boost") return throttleBoost(t, alt);
  if (t >= F14.SECO - 8) return Math.max(0, (F14.SECO - t) / 8) * 0.8;
  return 0.88;
}

export function peakForceN(mode: BurnMode, thr: number): number {
  if (mode === "boost") return BOOSTER_THRUST_N * thr;
  if (mode === "hot_stage")
    return BOOSTER_THRUST_N * 0.18 * thr + SHIP_THRUST_N * 0.95;
  if (mode === "upper") return SHIP_THRUST_N * thr;
  if (mode === "insert" || mode === "deorbit") return SHIP_THRUST_N * 0.18 * thr;
  if (mode === "land") return SHIP_THRUST_N * 0.032 * thr;
  return 0;
}

export function tankFor(mode: BurnMode, staged: boolean): Tank {
  if (!staged && (mode === "boost" || mode === "hot_stage")) return "booster";
  return "ship";
}

/** Corridor steering, intercept plane, and throttle tables. */
import { BOOSTER_THRUST_N, EARTH_SURFACE_ALT_KM, MU_EARTH, R_EARTH, SHIP_THRUST_N } from "./constants";
import { corridorAlongAt } from "./flight13Corridor";
import { EARTH_SPIN_RATE, earthNorthPole, starbasePadState } from "./earthFrame";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { earthSurfaceRadiusAlong, radialHeightAboveEllipsoid } from "./wgs84";
import { getBodies } from "./integrator";
import type { Tank } from "./propellant";
import { cross, dot, len, normalize, set, sub, type V3, v3 } from "./vec3";
import { F13, SECO_ALT_MIN_KM, SECO_VCIRC_FRAC, splashSurfaceInertial, smoothstep } from "./flight13Timeline";
import { _along, _horiz, _relP, _relV, _tmp, _tmp2, _tmp3, _up } from "./flight13Scratch";
import type { BurnMode, SteerGeo } from "./flight13Types";

/** Radial/horizontal geometry about Earth; fills `_up`, `_relV`, `_horiz`. */
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

/**
 * Inertial plane through the pad at liftoff and the splash site at
 * {@link F13.SPLASH}. Oriented so the pad tangent matches the eastward
 * Earth-fixed corridor.
 */
export function makeInterceptNormal(epoch: EphemerisEpoch): V3 {
  const pad = starbasePadState(0, epoch);
  const b0 = getBodies(0, epoch);
  sub(_relP, pad.pos, b0.earth);
  normalize(_relP, _relP);
  splashSurfaceInertial(F13.SPLASH, _tmp2, epoch);
  cross(_tmp3, _relP, _tmp2);
  const n = normalize(v3(), _tmp3);
  cross(_along, n, _relP);
  corridorAlongAt(0, pad.pos, _tmp, epoch);
  if (dot(_along, _tmp) < 0) {
    n.x = -n.x;
    n.y = -n.y;
    n.z = -n.z;
  }
  return n;
}

/** Horizontal unit along the intercept plane at `pos` (inertial). */
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

/**
 * Corridor heading plus a pull onto the intercept plane. Full intercept
 * steering circularizes on a shallower plane and skips past 107°E; a
 * modest out-of-plane blend keeps the original loft and slides latitude
 * south toward the splash site.
 */
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

/** Local ENU-ish geometry for steering. */
function fillSteerFrame(
  t: number,
  pos: V3,
  vel: V3,
  epoch: EphemerisEpoch,
  interceptN: V3,
): SteerGeo {
  const g = fillEarthRelGeo(t, pos, vel, epoch);
  const xt = t < F13.SECO ? 0.45 : 0.15;
  earthNorthPole(_tmp);
  return {
    alt: radialHeightAboveEllipsoid(_relP, _tmp),
    vRad: g.vRad,
    vHoriz: g.vHoriz,
    vCirc: Math.sqrt(MU_EARTH / Math.max(g.r, R_EARTH + 50)),
    along: blendAlongIntercept(t, pos, interceptN, epoch, xt, _along),
  };
}

/** Vector from craft to surface point at radius `rSurf` along unit `surf`. */
function aimToSurfPoint(pos: V3, earth: V3, surf: V3, rSurf: number, out: V3): number {
  set(out, earth.x + surf.x * rSurf - pos.x, earth.y + surf.y * rSurf - pos.y, earth.z + surf.z * rSurf - pos.z);
  const d = len(out);
  if (d > 1e-6) normalize(out, out);
  return d;
}

/** Landing burn aim direction (writes unit aim into `_tmp3`). */
function fillSplashAim(t: number, pos: V3, epoch: EphemerisEpoch): number {
  const splash = splashSurfaceInertial(t, _tmp2, epoch);
  const bL = getBodies(t, epoch);
  earthNorthPole(_tmp);
  const rSurf = earthSurfaceRadiusAlong(splash, _tmp, EARTH_SURFACE_ALT_KM);
  return aimToSurfPoint(pos, bL.earth, splash, rSurf, _tmp3);
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

function steerLandBrake(out: V3, distSplash: number, alt: number): void {
  const v = len(_relV);
  set(out, -_relV.x / v, -_relV.y / v, -_relV.z / v);
  // Only nibble toward the site in the last tens of km. A 500 km
  // landing-burn divert is the late hook on the Earth-fixed trail.
  if (distSplash <= 40) {
    const w = Math.min(0.4, (40 - distSplash) / 90);
    out.x = out.x * (1 - w) + _tmp3.x * w;
    out.y = out.y * (1 - w) + _tmp3.y * w;
    out.z = out.z * (1 - w) + _tmp3.z * w;
  }
  // Hold against g while killing the last hundreds of km/h — a pure
  // retrograde burn from 1 km falls through the landing HUD shots.
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
  const distSplash = fillSplashAim(t, pos, epoch);
  if (len(_relV) > 0.08) { steerLandBrake(out, distSplash, alt); return; }
  if (alt > 0.4) {
    set(out, _up.x * 0.35 + _tmp3.x * 0.65, _up.y * 0.35 + _tmp3.y * 0.65, _up.z * 0.35 + _tmp3.z * 0.65);
    normalize(out, out);
    return;
  }
  set(out, _up.x, _up.y, _up.z);
}

/** Modest retrograde so the near-circular insert can reenter over the IO. */
function steerRelight(vHoriz: number, along: V3, out: V3): void {
  if (vHoriz > 0.05) {
    set(out, -_horiz.x / vHoriz, -_horiz.y / vHoriz, -_horiz.z / vHoriz);
  } else {
    set(out, -along.x, -along.y, -along.z);
  }
}

/** Aim thrust as pitch from local up toward `along`. */
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
  // Pitch over from ~150 m so T+16 is hundreds of metres, not a 1 km loft.
  if (alt < 0.15) return 0;
  if (alt < 48) return smoothstep(0.15, 48, alt) * (Math.PI / 2) * 0.9;
  return (Math.PI / 2) * 0.92;
}

/** Boost gravity-turn pitch along corridor. */
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

/** Hot-stage / upper climb toward insert altitude. */
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

/**
 * At speed but below insert alt: climb with mostly radial thrust so eastbound
 * assist does not keep stacking horizontal Δv into a high ellipse.
 */
function steerUpperLoft(along: V3, vRad: number, vHoriz: number, vTarget: number, out: V3): void {
  const upW = vRad > 0.8 ? 0.45 : 0.55;
  const alongW = vHoriz < vTarget ? 0.35 : -0.08;
  set(
    out,
    _up.x * upW + along.x * alongW,
    _up.y * upW + along.y * alongW,
    _up.z * upW + along.z * alongW,
  );
  if (len(out) < 1e-8) set(out, _up.x, _up.y, _up.z);
  normalize(out, out);
}

/** Above insert altitude: kill radial, push horizontal. */
function steerUpperCircular(
  vRad: number,
  vHoriz: number,
  vTarget: number,
  along: V3,
  out: V3,
): void {
  const tgtRad = -1.1 * vRad;
  const needH = Math.max(0, vTarget - vHoriz);
  const radW = Math.min(0.55, 0.2 + Math.abs(vRad) * 1.2);
  const hW = 1 - radW + (needH > 0.05 ? 0.15 : 0);
  set(out, along.x * hW + _up.x * tgtRad, along.y * hW + _up.y * tgtRad, along.z * hW + _up.z * tgtRad);
  if (len(out) < 1e-8) set(out, along.x, along.y, along.z);
  normalize(out, out);
}

function steerUpper(geo: SteerGeo, out: V3): void {
  const vTarget = SECO_VCIRC_FRAC * geo.vCirc;
  if (geo.alt < SECO_ALT_MIN_KM) {
    if (geo.vHoriz >= vTarget * 0.9) {
      steerUpperLoft(geo.along, geo.vRad, geo.vHoriz, vTarget, out);
    } else {
      steerUpperClimb(geo.alt, geo.vRad, geo.vHoriz, vTarget, geo.along, out);
    }
  } else {
    steerUpperCircular(geo.vRad, geo.vHoriz, vTarget, geo.along, out);
  }
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
  if (mode === "relight") { steerRelight(geo.vHoriz, geo.along, out); return; }
  if (mode === "boost") { steerBoost(geo.alt, geo.along, out); return; }
  steerUpper(geo, out);
}

function throttleBoost(t: number, alt: number): number {
  let thr = 0.9;
  // Narrower max-Q dip so staging still reaches ~6,000 km/h.
  if (alt > 4 && alt < 16) thr *= 0.88;
  // ~1.4 T/W at liftoff (webcast T+16 is 0.4 km / 219 km/h, not a 1 km punch).
  if (alt < 2) thr = 0.84;
  if (t > F13.MECO - 8) thr *= Math.max(0.15, (F13.HOT_STAGE - t) / 12);
  return Math.max(0, Math.min(1, thr));
}

function throttleLand(t: number, alt: number): number {
  let thr = 0.95;
  if (t >= F13.LAND_3TO2) thr = 0.62;
  if (t >= F13.LAND_2TO1) thr = 0.38;
  // SHIP_THRUST_N is sized for wet mass; at landing weight even a
  // 3-engine fraction is tens of g. Keep the deck-relative T/W ~1.
  if (alt < 0.7) thr *= 0.55;
  return thr;
}

export function throttleFor(t: number, alt: number, mode: BurnMode): number {
  if (mode === "idle") return 0;
  if (mode === "hot_stage") return 0.55;
  if (mode === "relight") return 0.5;
  if (mode === "land") return throttleLand(t, alt);
  if (mode === "boost") return throttleBoost(t, alt);
  if (t >= F13.SECO - 8) return Math.max(0, (F13.SECO - t) / 8) * 0.8;
  return 0.88;
}

export function peakForceN(mode: BurnMode, thr: number): number {
  if (mode === "boost") return BOOSTER_THRUST_N * thr;
  if (mode === "hot_stage")
    return BOOSTER_THRUST_N * 0.18 * thr + SHIP_THRUST_N * 0.95;
  if (mode === "upper") return SHIP_THRUST_N * thr;
  if (mode === "relight") return SHIP_THRUST_N * 0.34 * thr;
  // ~1.5 g at landing (dry) mass — full SHIP_THRUST_N is ~50 g on the dry ship.
  if (mode === "land") return SHIP_THRUST_N * 0.032 * thr;
  return 0;
}

export function tankFor(mode: BurnMode, staged: boolean): Tank {
  if (!staged && (mode === "boost" || mode === "hot_stage")) return "booster";
  return "ship";
}



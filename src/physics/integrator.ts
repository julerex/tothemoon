/**
 * Restricted n-body craft integrator (RK4) and force model.
 *
 * Accelerations (default **nbody**): Earth + Moon point-mass gravity, solar
 * tide about Earth, Earth J₂, and simple exponential atmosphere + quadratic
 * drag below ~120 km.
 *
 * **earth** model: Earth point-mass + J₂ + atmosphere only (no Moon, no Sun
 * tide). Useful as an independent check that short suborbital flights are not
 * dominated by third-body terms.
 *
 * Units: km, s, km/s, km/s².
 */

/** Which gravitational terms to include (atmosphere/drag always on when vel given). */
export type GravityModel = "nbody" | "earth";

export type AccelOptions = {
  /**
   * Force model. Default `"nbody"`.
   * `"earth"` = Earth μ + J₂ + drag only (ignore Moon / solar tide).
   */
  gravity?: GravityModel;
  /**
   * Body ephemeris for this integrate step.
   * Default {@link DEFAULT_EPHEMERIS} (analytic, no Horizons).
   */
  epoch?: EphemerisEpoch;
};

import {
  ATM_H_MAX_KM,
  ATM_RHO0_KG_KM3,
  ATM_SCALE_HEIGHT_KM,
  DRAG_CD_A_OVER_M,
  EARTH_J2,
  EARTH_SIDEREAL_DAY_S,
  MU_EARTH,
  MU_MOON,
  MU_SUN,
  R_EARTH,
  R_MOON,
} from "./constants";
import { bodyPositions, type BodyState } from "./bodies";
import {
  DEFAULT_EPHEMERIS,
  type EphemerisEpoch,
} from "./ephemerisEpoch";
import { earthNorthPole } from "./earthFrame";
import {
  add,
  copy,
  cross,
  dot,
  len,
  madd,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

function resolveEpoch(opts?: AccelOptions): EphemerisEpoch {
  return opts?.epoch ?? DEFAULT_EPHEMERIS;
}

/** Craft state in the heliocentric theater frame. */
export type CraftState = {
  /** Mission time (s). */
  t: number;
  /** Inertial position (km). */
  pos: V3;
  /** Inertial velocity (km/s). */
  vel: V3;
};

const _bodies: BodyState = {
  sun: v3(),
  earth: v3(),
  moon: v3(),
  earthVel: v3(),
  moonVel: v3(),
};

const _r = v3();
const _a = v3();
const _tmp = v3();
const _pole = v3();
const _vRel = v3();
const _omega = v3();
const _vAtm = v3();

/** Earth spin rate (rad/s) for co-rotating atmosphere. */
const EARTH_OMEGA = (2 * Math.PI) / EARTH_SIDEREAL_DAY_S;

/** Point-mass gravity from one body: −μ r̂ / r² */
function addGravity(acc: V3, craft: V3, body: V3, mu: number): void {
  sub(_r, craft, body);
  const r = len(_r);
  if (r < 1e-6) return;
  const f = -mu / (r * r * r);
  acc.x += _r.x * f;
  acc.y += _r.y * f;
  acc.z += _r.z * f;
}

/**
 * Third-body **tidal** acceleration relative to a primary (Earth).
 *
 * a = −μ [ (r_c − r_b)/|r_c−r_b|³ − (r_p − r_b)/|r_p−r_b|³ ]
 *
 * Required when the primary is on rails: full solar point-mass would pull the
 * craft into a solar orbit while Earth stays near the EM barycenter, draining
 * Earth-relative energy on multi-day coasts. Tidal form is the correct
 * restricted n-body residual.
 */
function addPointMass(acc: V3, from: V3, to: V3, mu: number, sign: number): void {
  sub(_r, from, to);
  const r = len(_r);
  if (r <= 1e-6) return;
  const f = sign * (-mu / (r * r * r));
  acc.x += _r.x * f; acc.y += _r.y * f; acc.z += _r.z * f;
}

function addTidalGravity(acc: V3, craft: V3, body: V3, primary: V3, mu: number): void {
  addPointMass(acc, craft, body, mu, 1);
  addPointMass(acc, primary, body, mu, -1);
}

/**
 * Earth J₂ acceleration in the inertial frame.
 * a = 1½ J₂ μ R² / r⁵ · [ (5 ζ² − 1) r − 2 ζ n̂ ]
 * where ζ = (r · n̂)/r and n̂ is the Earth north pole.
 */
function j2Accel(acc: V3, r: number, zeta: number): void {
  const r2 = r * r, fac = 1.5 * EARTH_J2 * MU_EARTH * (R_EARTH * R_EARTH) / (r2 * r2 * r);
  const s = (5 * (zeta * zeta) / r2 - 1);
  acc.x += fac * (s * _r.x - 2 * zeta * _pole.x);
  acc.y += fac * (s * _r.y - 2 * zeta * _pole.y);
  acc.z += fac * (s * _r.z - 2 * zeta * _pole.z);
}

export function addEarthJ2(acc: V3, craft: V3, earth: V3): void {
  sub(_r, craft, earth);
  const r = len(_r);
  if (r < R_EARTH * 0.5) return;
  earthNorthPole(_pole);
  j2Accel(acc, r, dot(_r, _pole));
}

/**
 * Exponential atmosphere density (kg/km³) at altitude h (km). Zero above cutoff.
 */
export function atmDensity(hKm: number): number {
  if (hKm < 0) return ATM_RHO0_KG_KM3;
  if (hKm > ATM_H_MAX_KM) return 0;
  return ATM_RHO0_KG_KM3 * Math.exp(-hKm / ATM_SCALE_HEIGHT_KM);
}

/**
 * Quadratic drag vs co-rotating atmosphere.
 * a = −½ (Cd A/m) ρ |v_rel| v_rel
 * Uses fixed ballistic factor (theater stack).
 */
function dragRelVel(vel: V3, earthVel: V3): number {
  earthNorthPole(_pole);
  set(_omega, _pole.x * EARTH_OMEGA, _pole.y * EARTH_OMEGA, _pole.z * EARTH_OMEGA);
  cross(_vAtm, _omega, _r);
  _vRel.x = vel.x - earthVel.x - _vAtm.x;
  _vRel.y = vel.y - earthVel.y - _vAtm.y;
  _vRel.z = vel.z - earthVel.z - _vAtm.z;
  return len(_vRel);
}

function applyDrag(acc: V3, rho: number, speed: number): void {
  const k = -0.5 * DRAG_CD_A_OVER_M * rho * speed;
  acc.x += k * _vRel.x; acc.y += k * _vRel.y; acc.z += k * _vRel.z;
}

export function addEarthDrag(acc: V3, craft: V3, earth: V3, vel: V3, earthVel: V3): void {
  sub(_r, craft, earth);
  const rho = atmDensity(len(_r) - R_EARTH);
  if (rho < 1e-30) return;
  const speed = dragRelVel(vel, earthVel);
  if (speed >= 1e-9) applyDrag(acc, rho, speed);
}

/**
 * Gravitational acceleration on craft at time t (optional thrust + Earth J2/drag).
 *
 * Default restricted n-body: Earth + Moon point-mass, Sun as **tidal** residual
 * about Earth (ephemeris-fixed primaries), plus J₂ / drag / thrust.
 * With `{ gravity: "earth" }`: Earth μ + J₂ + drag only.
 * Pass `vel` to include atmospheric drag; omit for pure gravity+J2.
 */
function addNbodyTerms(out: V3, pos: V3): void {
  addGravity(out, pos, _bodies.moon, MU_MOON);
  addTidalGravity(out, pos, _bodies.sun, _bodies.earth, MU_SUN);
}

function addThrust(out: V3, thrust: V3 | null): void {
  if (!thrust) return;
  out.x += thrust.x; out.y += thrust.y; out.z += thrust.z;
}

function earthBaseAccel(out: V3, pos: V3): void {
  addGravity(out, pos, _bodies.earth, MU_EARTH);
  addEarthJ2(out, pos, _bodies.earth);
}

export function acceleration(
  t: number, pos: V3, thrust: V3 | null, out: V3 = _a, vel: V3 | null = null, opts?: AccelOptions,
): V3 {
  const gravity: GravityModel = opts?.gravity ?? "nbody";
  bodyPositions(t, resolveEpoch(opts), _bodies);
  set(out, 0, 0, 0);
  earthBaseAccel(out, pos);
  if (gravity === "nbody") addNbodyTerms(out, pos);
  if (vel) addEarthDrag(out, pos, _bodies.earth, vel, _bodies.earthVel);
  addThrust(out, thrust);
  return out;
}

const k1r = v3(),
  k1v = v3(),
  k2r = v3(),
  k2v = v3(),
  k3r = v3(),
  k3v = v3(),
  k4r = v3(),
  k4v = v3(),
  rp = v3(),
  vp = v3(),
  thr = v3();

export type ThrustFn = (t: number, pos: V3, vel: V3) => V3 | null;

/**
 * Classic RK4 step. Mutates state in place.
 * thrustFn returns inertial acceleration (km/s²) or null.
 * Includes Earth J2 + atmospheric drag (when in atmosphere).
 * Pass `{ gravity: "earth" }` to drop Moon / solar-tide terms.
 */
function rk4Stage(
  t: number, pos: V3, vel: V3, kr: V3, kv: V3, h: number,
  thrustFn: ThrustFn | undefined, opts: AccelOptions | undefined,
  outR: V3, outV: V3,
): void {
  madd(rp, pos, kr, h);
  madd(vp, vel, kv, h);
  const th = thrustFn?.(t + h, rp, vp) ?? null;
  acceleration(t + h, rp, th, outV, vp, opts);
  copy(outR, vp);
}

function rk4Combine(dst: V3, k1: V3, k2: V3, k3: V3, k4: V3, dt: number): void {
  dst.x += (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x);
  dst.y += (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y);
  dst.z += (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z);
}

function rk4First(state: CraftState, thrustFn: ThrustFn | undefined, opts: AccelOptions | undefined): void {
  const th0 = thrustFn?.(state.t, state.pos, state.vel) ?? null;
  if (th0) copy(thr, th0);
  acceleration(state.t, state.pos, th0, k1v, state.vel, opts);
  copy(k1r, state.vel);
}

function rk4Stages(state: CraftState, dt: number, thrustFn: ThrustFn | undefined, opts: AccelOptions | undefined): void {
  const { t, pos, vel } = state;
  rk4Stage(t, pos, vel, k1r, k1v, dt * 0.5, thrustFn, opts, k2r, k2v);
  rk4Stage(t, pos, vel, k2r, k2v, dt * 0.5, thrustFn, opts, k3r, k3v);
  rk4Stage(t, pos, vel, k3r, k3v, dt, thrustFn, opts, k4r, k4v);
}

export function rk4Step(state: CraftState, dt: number, thrustFn?: ThrustFn, opts?: AccelOptions): void {
  rk4First(state, thrustFn, opts);
  rk4Stages(state, dt, thrustFn, opts);
  rk4Combine(state.pos, k1r, k2r, k3r, k4r, dt);
  rk4Combine(state.vel, k1v, k2v, k3v, k4v, dt);
  state.t += dt;
}

/** Surface collision / proximity checks. */
export function altitudeEarth(
  t: number,
  pos: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  bodyPositions(t, epoch, _bodies);
  return len(sub(_tmp, pos, _bodies.earth)) - R_EARTH;
}

export function altitudeMoon(
  t: number,
  pos: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  bodyPositions(t, epoch, _bodies);
  return len(sub(_tmp, pos, _bodies.moon)) - R_MOON;
}

export function distanceToMoon(
  t: number,
  pos: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  bodyPositions(t, epoch, _bodies);
  return len(sub(_tmp, pos, _bodies.moon));
}

export function distanceToEarth(
  t: number,
  pos: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  bodyPositions(t, epoch, _bodies);
  return len(sub(_tmp, pos, _bodies.earth));
}

export function getBodies(
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): BodyState {
  return bodyPositions(t, epoch, _bodies);
}

/** Impulsive Δv in inertial frame. */
export function applyDeltaV(vel: V3, dv: V3): void {
  add(vel, vel, dv);
}

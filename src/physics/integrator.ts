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

export type CraftState = {
  t: number;
  pos: V3;
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
 * Earth J₂ acceleration in the inertial frame.
 * a = 1½ J₂ μ R² / r⁵ · [ (5 ζ² − 1) r − 2 ζ n̂ ]
 * where ζ = (r · n̂)/r and n̂ is the Earth north pole.
 */
export function addEarthJ2(acc: V3, craft: V3, earth: V3): void {
  sub(_r, craft, earth);
  const r = len(_r);
  if (r < R_EARTH * 0.5) return;
  earthNorthPole(_pole);
  const zeta = dot(_r, _pole); // r · n̂  (km)
  const r2 = r * r;
  const r5 = r2 * r2 * r;
  const fac = 1.5 * EARTH_J2 * MU_EARTH * (R_EARTH * R_EARTH) / r5;
  const s = (5 * (zeta * zeta) / r2 - 1);
  // a = fac * (s * r − 2 ζ n̂)
  acc.x += fac * (s * _r.x - 2 * zeta * _pole.x);
  acc.y += fac * (s * _r.y - 2 * zeta * _pole.y);
  acc.z += fac * (s * _r.z - 2 * zeta * _pole.z);
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
export function addEarthDrag(
  acc: V3,
  craft: V3,
  earth: V3,
  vel: V3,
  earthVel: V3,
): void {
  sub(_r, craft, earth);
  const r = len(_r);
  const h = r - R_EARTH;
  const rho = atmDensity(h);
  if (rho < 1e-30) return;

  // Atmosphere co-rotates: v_atm = ω × r, ω along Earth pole
  earthNorthPole(_pole);
  set(_omega, _pole.x * EARTH_OMEGA, _pole.y * EARTH_OMEGA, _pole.z * EARTH_OMEGA);
  cross(_vAtm, _omega, _r);
  // v_rel = (v − earthVel) − v_atm
  _vRel.x = vel.x - earthVel.x - _vAtm.x;
  _vRel.y = vel.y - earthVel.y - _vAtm.y;
  _vRel.z = vel.z - earthVel.z - _vAtm.z;
  const speed = len(_vRel);
  if (speed < 1e-9) return;

  // a = −0.5 * (CdA/m) * ρ * speed * v_rel
  const k = -0.5 * DRAG_CD_A_OVER_M * rho * speed;
  acc.x += k * _vRel.x;
  acc.y += k * _vRel.y;
  acc.z += k * _vRel.z;
}

/**
 * Gravitational acceleration on craft at time t (optional thrust + Earth J2/drag).
 * Pass `vel` to include atmospheric drag; omit for pure gravity+J2.
 */
export function acceleration(
  t: number,
  pos: V3,
  thrust: V3 | null,
  out: V3 = _a,
  vel: V3 | null = null,
): V3 {
  bodyPositions(t, _bodies);
  set(out, 0, 0, 0);
  addGravity(out, pos, _bodies.sun, MU_SUN);
  addGravity(out, pos, _bodies.earth, MU_EARTH);
  addEarthJ2(out, pos, _bodies.earth);
  addGravity(out, pos, _bodies.moon, MU_MOON);
  if (vel) {
    addEarthDrag(out, pos, _bodies.earth, vel, _bodies.earthVel);
  }
  if (thrust) {
    out.x += thrust.x;
    out.y += thrust.y;
    out.z += thrust.z;
  }
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
 */
export function rk4Step(state: CraftState, dt: number, thrustFn?: ThrustFn): void {
  const { t, pos, vel } = state;

  const th0 = thrustFn?.(t, pos, vel) ?? null;
  if (th0) copy(thr, th0);
  acceleration(t, pos, th0, k1v, vel);
  copy(k1r, vel);

  madd(rp, pos, k1r, dt * 0.5);
  madd(vp, vel, k1v, dt * 0.5);
  const th1 = thrustFn?.(t + dt * 0.5, rp, vp) ?? null;
  acceleration(t + dt * 0.5, rp, th1, k2v, vp);
  copy(k2r, vp);

  madd(rp, pos, k2r, dt * 0.5);
  madd(vp, vel, k2v, dt * 0.5);
  const th2 = thrustFn?.(t + dt * 0.5, rp, vp) ?? null;
  acceleration(t + dt * 0.5, rp, th2, k3v, vp);
  copy(k3r, vp);

  madd(rp, pos, k3r, dt);
  madd(vp, vel, k3v, dt);
  const th3 = thrustFn?.(t + dt, rp, vp) ?? null;
  acceleration(t + dt, rp, th3, k4v, vp);
  copy(k4r, vp);

  pos.x += (dt / 6) * (k1r.x + 2 * k2r.x + 2 * k3r.x + k4r.x);
  pos.y += (dt / 6) * (k1r.y + 2 * k2r.y + 2 * k3r.y + k4r.y);
  pos.z += (dt / 6) * (k1r.z + 2 * k2r.z + 2 * k3r.z + k4r.z);

  vel.x += (dt / 6) * (k1v.x + 2 * k2v.x + 2 * k3v.x + k4v.x);
  vel.y += (dt / 6) * (k1v.y + 2 * k2v.y + 2 * k3v.y + k4v.y);
  vel.z += (dt / 6) * (k1v.z + 2 * k2v.z + 2 * k3v.z + k4v.z);

  state.t = t + dt;
}

/** Surface collision / proximity checks. */
export function altitudeEarth(t: number, pos: V3): number {
  bodyPositions(t, _bodies);
  return len(sub(_tmp, pos, _bodies.earth)) - R_EARTH;
}

export function altitudeMoon(t: number, pos: V3): number {
  bodyPositions(t, _bodies);
  return len(sub(_tmp, pos, _bodies.moon)) - R_MOON;
}

export function distanceToMoon(t: number, pos: V3): number {
  bodyPositions(t, _bodies);
  return len(sub(_tmp, pos, _bodies.moon));
}

export function distanceToEarth(t: number, pos: V3): number {
  bodyPositions(t, _bodies);
  return len(sub(_tmp, pos, _bodies.earth));
}

export function getBodies(t: number): BodyState {
  return bodyPositions(t, _bodies);
}

/** Impulsive Δv in inertial frame. */
export function applyDeltaV(vel: V3, dv: V3): void {
  add(vel, vel, dv);
}

import {
  MU_EARTH,
  MU_MOON,
  MU_SUN,
  R_EARTH,
  R_MOON,
} from "./constants";
import { bodyPositions, type BodyState } from "./bodies";
import {
  add,
  copy,
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
 * Gravitational acceleration on craft at time t (optional extra thrust accel).
 */
export function acceleration(
  t: number,
  pos: V3,
  thrust: V3 | null,
  out: V3 = _a,
): V3 {
  bodyPositions(t, _bodies);
  set(out, 0, 0, 0);
  addGravity(out, pos, _bodies.sun, MU_SUN);
  addGravity(out, pos, _bodies.earth, MU_EARTH);
  addGravity(out, pos, _bodies.moon, MU_MOON);
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
 */
export function rk4Step(state: CraftState, dt: number, thrustFn?: ThrustFn): void {
  const { t, pos, vel } = state;

  const th0 = thrustFn?.(t, pos, vel) ?? null;
  if (th0) copy(thr, th0);
  acceleration(t, pos, th0, k1v);
  copy(k1r, vel);

  madd(rp, pos, k1r, dt * 0.5);
  madd(vp, vel, k1v, dt * 0.5);
  const th1 = thrustFn?.(t + dt * 0.5, rp, vp) ?? null;
  acceleration(t + dt * 0.5, rp, th1, k2v);
  copy(k2r, vp);

  madd(rp, pos, k2r, dt * 0.5);
  madd(vp, vel, k2v, dt * 0.5);
  const th2 = thrustFn?.(t + dt * 0.5, rp, vp) ?? null;
  acceleration(t + dt * 0.5, rp, th2, k3v);
  copy(k3r, vp);

  madd(rp, pos, k3r, dt);
  madd(vp, vel, k3v, dt);
  const th3 = thrustFn?.(t + dt, rp, vp) ?? null;
  acceleration(t + dt, rp, th3, k4v);
  copy(k4r, vp);

  // pos += dt/6 * (k1r + 2 k2r + 2 k3r + k4r)
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

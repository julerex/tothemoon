import { LOW_EARTH_ORBIT_COAST_S, LOW_EARTH_ORBIT_RADIUS, MU_EARTH } from "./constants";
import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import type { AscentResult } from "./ascent";
import { getBodies, type CraftState } from "./integrator";
import { pushSample } from "./missionSample";
import type { Sample } from "./missionTypes";
import {
  applyImpulsiveShipDv,
  createPropState,
  type PropState,
} from "./propellant";
import { moonArrivalDirection, transferPlaneNormal } from "./translunarInjection";
import {
  clone,
  cross,
  dot,
  len,
  normalize,
  scale,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

/** Earth-relative low Earth orbit state at translunar injection epoch (survives Moon-phase ephemeris changes). */
export type LowEarthOrbitRelative = { t: number; relPos: V3; relVel: V3 };

const _n0 = v3();
const _n1 = v3();
const _nPrev = v3();
const _rHat = v3();
const _rHat0 = v3();
const _periHat = v3();
const _axis = v3();
const _relP = v3();
const _relV = v3();
const _tangent = v3();
const _tmp = v3();
const _up = v3(0, 0, 1);

function clamp1(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

/** Spherical linear interpolation of unit vectors (shortest arc). */
function slerpFlip(b: V3, cosom: number): { cosom: number; bx: number; by: number; bz: number } {
  if (cosom >= 0) return { cosom, bx: b.x, by: b.y, bz: b.z };
  return { cosom: -cosom, bx: -b.x, by: -b.y, bz: -b.z };
}

function slerpNlerp(a: V3, bx: number, by: number, bz: number, t: number, out: V3): V3 {
  out.x = a.x + t * (bx - a.x); out.y = a.y + t * (by - a.y); out.z = a.z + t * (bz - a.z);
  return normalize(out, out);
}

function slerpUnit(a: V3, b: V3, t: number, out: V3): V3 {
  const f = slerpFlip(b, clamp1(dot(a, b)));
  if (f.cosom > 0.9995) return slerpNlerp(a, f.bx, f.by, f.bz, t, out);
  const omega = Math.acos(f.cosom), sinom = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / sinom, s1 = Math.sin(t * omega) / sinom;
  out.x = s0 * a.x + s1 * f.bx; out.y = s0 * a.y + s1 * f.by; out.z = s0 * a.z + s1 * f.bz;
  return out;
}

/** Rotate unit vector `v` about unit axis `k` by angle (rad). */
function rotateAbout(v: V3, k: V3, angle: number, out: V3): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Rodrigues: v c + (k×v) s + k (k·v) (1−c)
  cross(_axis, k, v);
  const kdot = dot(k, v);
  out.x = v.x * c + _axis.x * s + k.x * kdot * (1 - c);
  out.y = v.y * c + _axis.y * s + k.y * kdot * (1 - c);
  out.z = v.z * c + _axis.z * s + k.z * kdot * (1 - c);
  return normalize(out, out);
}

/** Project vector onto plane with unit normal n, then normalize (or fallback). */
function projectToPlaneUnit(v: V3, n: V3, out: V3): V3 {
  const d = dot(v, n);
  out.x = v.x - n.x * d;
  out.y = v.y - n.y * d;
  out.z = v.z - n.z * d;
  if (len(out) < 1e-10) {
    cross(out, n, _up);
    if (len(out) < 1e-10) set(out, 1, 0, 0);
  }
  return normalize(out, out);
}

/**
 * Circular low Earth orbit state: position along rHat, velocity n×rHat · v_circ
 * (prograde about normal n — co-rotating if n matches the Moon).
 */
function setCircularLeo(state: CraftState, t: number, rHat: V3, n: V3, epoch: EphemerisEpoch): void {
  const b = bodyPositions(t, epoch), vCirc = Math.sqrt(MU_EARTH / LOW_EARTH_ORBIT_RADIUS);
  cross(_tangent, n, rHat); normalize(_tangent, _tangent);
  state.t = t;
  set(state.pos, b.earth.x + rHat.x * LOW_EARTH_ORBIT_RADIUS, b.earth.y + rHat.y * LOW_EARTH_ORBIT_RADIUS, b.earth.z + rHat.z * LOW_EARTH_ORBIT_RADIUS);
  set(state.vel, b.earthVel.x + _tangent.x * vCirc, b.earthVel.y + _tangent.y * vCirc, b.earthVel.z + _tangent.z * vCirc);
}

export function cloneState(s: CraftState): CraftState {
  return { t: s.t, pos: clone(s.pos), vel: clone(s.vel) };
}

export function captureLowEarthOrbitRelative(
  state: CraftState, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): LowEarthOrbitRelative {
  const b = getBodies(state.t, epoch);
  return {
    t: state.t,
    relPos: { x: state.pos.x - b.earth.x, y: state.pos.y - b.earth.y, z: state.pos.z - b.earth.z },
    relVel: { x: state.vel.x - b.earthVel.x, y: state.vel.y - b.earthVel.y, z: state.vel.z - b.earthVel.z },
  };
}

export function restoreLowEarthOrbitRelative(
  rel: LowEarthOrbitRelative, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): CraftState {
  const b = getBodies(rel.t, epoch);
  return {
    t: rel.t,
    pos: { x: b.earth.x + rel.relPos.x, y: b.earth.y + rel.relPos.y, z: b.earth.z + rel.relPos.z },
    vel: { x: b.earthVel.x + rel.relVel.x, y: b.earthVel.y + rel.relVel.y, z: b.earthVel.z + rel.relVel.z },
  };
}

/**
 * Plane-change Δv (km/s) for an instantaneous change of orbital plane by
 * angle di (rad) at circular speed v: classic 2 v sin(Δi/2).
 */
function planeChangeDv(vCirc: number, diRad: number): number {
  if (diRad < 1e-12) return 0;
  return 2 * vCirc * Math.sin(Math.min(diRad, Math.PI) * 0.5);
}

/**
 * After ascent: **continuous** circular low Earth orbit that doglegs into the
 * **south-biased transfer plane** (same as translunar injection), ~1.25 revs, ending at the
 * transfer periapsis direction.
 *
 * Geometry is kinematic (smooth trail / translunar injection aim). Plane-change cost is
 * booked as ship thrust + propellant: each step pays 2 v sin(di/2) for the
 * normal rotation that step (smoothstep concentrates burn mid-coast).
 * In-plane prograde motion is free (orbital). No free plane slerp.
 */
function leoAscentNormal(state: CraftState, t0: number, epoch: EphemerisEpoch): void {
  const b0 = bodyPositions(t0, epoch);
  sub(_relP, state.pos, b0.earth); sub(_relV, state.vel, b0.earthVel);
  cross(_n0, _relP, _relV);
  if (len(_n0) < 1e-12) set(_n0, 0, 0, 1);
  normalize(_n0, _n0);
}

function leoCoastGeom(state: CraftState, t0: number, coastS: number, epoch: EphemerisEpoch): number {
  leoAscentNormal(state, t0, epoch);
  transferPlaneNormal(t0 + coastS, _n1, epoch);
  if (dot(_n0, _n1) < 0) scale(_n1, _n1, -1);
  projectToPlaneUnit(_relP, _n0, _rHat0);
  moonArrivalDirection(t0 + coastS, _periHat, epoch);
  set(_periHat, -_periHat.x, -_periHat.y, -_periHat.z);
  projectToPlaneUnit(_periHat, _n1, _periHat);
  return Math.acos(clamp1(dot(_n0, _n1)));
}

function leoInPlaneAngle(period: number, coastS: number): number {
  projectToPlaneUnit(_rHat0, _n1, _rHat);
  let angInPlane = Math.atan2(dot(cross(_tmp, _rHat, _periHat), _n1), dot(_rHat, _periHat));
  if (angInPlane < 0) angInPlane += 2 * Math.PI;
  const targetAngle = (coastS / period) * 2 * Math.PI;
  while (angInPlane < targetAngle * 0.85) angInPlane += 2 * Math.PI;
  return angInPlane;
}

function leoStepDir(u: number, angInPlane: number): void {
  slerpUnit(_rHat0, _periHat, u, _rHat);
  projectToPlaneUnit(_rHat, _tmp, _rHat);
  const extra = Math.max(0, angInPlane - Math.acos(clamp1(dot(_rHat0, _periHat)))) * u;
  if (extra > 1e-6) rotateAbout(_rHat, _tmp, extra, _rHat);
  projectToPlaneUnit(_rHat, _tmp, _rHat);
}

function leoPushStep(
  samples: Sample[] | null, lastT: { t: number } | null, state: CraftState, prop: PropState | null,
  aKmS2: number, force: boolean,
): void {
  if (samples && lastT) pushSample(samples, state, "lowEarthOrbit", aKmS2 >= 1e-4, force, 0, lastT, prop, aKmS2, "ship", false);
}

function leoCoastStep(
  state: CraftState, i: number, steps: number, t0: number, coastS: number, dt: number, vCirc: number,
  angInPlane: number, samples: Sample[] | null, lastT: { t: number } | null, prop: PropState | null, epoch: EphemerisEpoch,
): number {
  const u = i / steps;
  slerpUnit(_n0, _n1, u * u * (3 - 2 * u), _tmp);
  const dvPlane = planeChangeDv(vCirc, Math.acos(clamp1(dot(_nPrev, _tmp))));
  leoStepDir(u, angInPlane);
  setCircularLeo(state, t0 + coastS * u, _rHat, _tmp, epoch);
  leoPushStep(samples, lastT, state, prop, dvPlane / Math.max(dt, 1e-6), i === steps);
  set(_nPrev, _tmp.x, _tmp.y, _tmp.z);
  return dvPlane;
}

function bookDogleg(prop: PropState | null, doglegDv: number, state: CraftState, coastS: number): void {
  if (prop && doglegDv > 1e-6) applyImpulsiveShipDv(prop, state.t, Math.min(doglegDv, 0.9), Math.max(coastS * 0.4, 400));
}

function leoCoastTiming(): { t0: number; period: number; coastS: number; steps: number; dt: number; vCirc: number } {
  const period = 2 * Math.PI * Math.sqrt(LOW_EARTH_ORBIT_RADIUS ** 3 / MU_EARTH);
  const coastS = LOW_EARTH_ORBIT_COAST_S > 0 ? LOW_EARTH_ORBIT_COAST_S : period * 1.25;
  const steps = Math.max(180, Math.ceil(coastS / 10));
  return { t0: 0, period, coastS, steps, dt: coastS / steps, vCirc: Math.sqrt(MU_EARTH / LOW_EARTH_ORBIT_RADIUS) };
}

function runLeoDoglegLoop(
  state: CraftState, t0: number, coastS: number, steps: number, dt: number, vCirc: number, angInPlane: number,
  samples: Sample[] | null, lastT: { t: number } | null, prop: PropState | null, epoch: EphemerisEpoch,
): number {
  set(_nPrev, _n0.x, _n0.y, _n0.z);
  let doglegDv = 0;
  for (let i = 1; i <= steps; i++) {
    doglegDv += leoCoastStep(state, i, steps, t0, coastS, dt, vCirc, angInPlane, samples, lastT, prop, epoch);
  }
  return doglegDv;
}

/**
 * Run the dogleg coast in place on `state`.
 * @returns Total plane-change class Δv booked (km/s) — precompute diagnostic.
 */
export function runLunarPlaneLowEarthOrbitCoast(
  state: CraftState, samples: Sample[] | null, lastT: { t: number } | null,
  prop: PropState | null = null, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  const t0 = state.t, timing = leoCoastTiming();
  const totalDi = leoCoastGeom(state, t0, timing.coastS, epoch);
  const angInPlane = leoInPlaneAngle(timing.period, timing.coastS);
  if (samples && lastT) pushSample(samples, state, "lowEarthOrbit", false, true, 0, lastT, prop, 0, "ship");
  const doglegDvKmS = runLeoDoglegLoop(state, t0, timing.coastS, timing.steps, timing.dt, timing.vCirc, angInPlane, samples, lastT, prop, epoch);
  bookDogleg(prop, doglegDvKmS, state, timing.coastS);
  void totalDi;
  return doglegDvKmS;
}

/** Ascent end → continuous low Earth orbit coast → low Earth orbit-rel state for probes. */
export function computeLowEarthOrbitRelative(
  ascent: AscentResult,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): LowEarthOrbitRelative {
  const state = cloneState(ascent.state);
  runLunarPlaneLowEarthOrbitCoast(state, null, null, null, epoch);
  return captureLowEarthOrbitRelative(state, epoch);
}

/** Append ascent samples, then low Earth orbit dogleg into the lunar plane (paid ship Δv). */
function copyAscentProp(prop: PropState, ascent: AscentResult): void {
  const ap = ascent.prop ?? createPropState(ascent.state.t);
  prop.boosterPropKg = ap.boosterPropKg;
  prop.shipPropKg = ap.shipPropKg;
  prop.lastT = ap.lastT;
  prop.staged = ap.staged;
}

function appendAscentSamples(samples: Sample[], lastT: { t: number }, ascent: AscentResult): void {
  for (const s of ascent.samples) {
    samples.push({
      t: s.t, pos: clone(s.pos), vel: clone(s.vel), phase: s.phase, burning: s.burning,
      fuelBooster: s.fuelBooster, fuelShip: s.fuelShip, thrustN: s.thrustN, staged: s.staged,
    });
    lastT.t = s.t;
  }
}

/**
 * @returns Post-coast craft state plus the dogleg Δv booked (km/s).
 */
export function appendAscentAndLowEarthOrbitCoast(
  ascent: AscentResult, samples: Sample[], lastT: { t: number }, prop: PropState,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): { state: CraftState; doglegDvKmS: number } {
  copyAscentProp(prop, ascent);
  appendAscentSamples(samples, lastT, ascent);
  const state = cloneState(ascent.state);
  const doglegDvKmS = runLunarPlaneLowEarthOrbitCoast(state, samples, lastT, prop, epoch);
  return { state, doglegDvKmS };
}

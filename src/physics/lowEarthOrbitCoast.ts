import { LOW_EARTH_ORBIT_COAST_S, LOW_EARTH_ORBIT_RADIUS, MU_EARTH } from "./constants";
import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import type { AscentResult } from "./ascent";
import { getBodies, rk4Step, type CraftState, type ThrustFn } from "./integrator";
import { pushSample } from "./missionSample";
import type { Sample } from "./missionTypes";
import {
  burnForce,
  createPropState,
  fuelShipFrac,
  hasPropellant,
  limitAccelByThrust,
  type PropState,
} from "./propellant";
import { transferPlaneNormal } from "./translunarInjection";
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
const _relP = v3();
const _relV = v3();
const _tangent = v3();
const _tmp = v3();
const _up = v3(0, 0, 1);

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
 * After ascent: RK4 circular-ish low Earth orbit that doglegs into the
 * south-biased transfer plane (same as translunar injection), ~1.25 revs.
 *
 * Out-of-plane + circularize error is mass-coupled ship thrust on the
 * integrator — no plane slerp, no impulsive Δv book.
 */
function leoAscentNormal(state: CraftState, t0: number, epoch: EphemerisEpoch): void {
  const b0 = bodyPositions(t0, epoch);
  sub(_relP, state.pos, b0.earth); sub(_relV, state.vel, b0.earthVel);
  cross(_n0, _relP, _relV);
  if (len(_n0) < 1e-12) set(_n0, 0, 0, 1);
  normalize(_n0, _n0);
}

function leoTargetPlane(state: CraftState, t0: number, coastS: number, epoch: EphemerisEpoch): void {
  leoAscentNormal(state, t0, epoch);
  transferPlaneNormal(t0 + coastS, _n1, epoch);
  if (dot(_n0, _n1) < 0) scale(_n1, _n1, -1);
}

const DOGLEG_GAIN = 0.6;
const DOGLEG_DT = 4;
const DOGLEG_MAX_A = 0.004;
/** Leave this fraction of remaining ship prop for TLI / LOI / PDI. */
const DOGLEG_RESERVE_FRAC = 0.55;

function fillDoglegAccel(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): number {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.earth);
  sub(_relV, vel, b.earthVel);
  const r = len(_relP);
  if (r < 1e-6) { set(_tmp, 0, 0, 0); return 0; }
  normalize(_rHat, _relP);
  cross(_nPrev, _relP, _relV);
  if (len(_nPrev) < 1e-12) set(_nPrev, _n1.x, _n1.y, _n1.z);
  normalize(_nPrev, _nPrev);
  set(_tangent, _n1.x, _n1.y, _n1.z);
  if (dot(_nPrev, _tangent) < 0) scale(_tangent, _tangent, -1);
  projectToPlaneUnit(_rHat, _tangent, _rHat);
  cross(_tmp, _tangent, _rHat);
  if (len(_tmp) < 1e-12) return 0;
  normalize(_tmp, _tmp);
  const vCirc = Math.sqrt(MU_EARTH / r);
  _tmp.x = _tmp.x * vCirc - _relV.x;
  _tmp.y = _tmp.y * vCirc - _relV.y;
  _tmp.z = _tmp.z * vCirc - _relV.z;
  const err = len(_tmp);
  if (err < 1e-8) return 0;
  const aCmd = Math.min(DOGLEG_MAX_A, err * DOGLEG_GAIN);
  scale(_tmp, _tmp, aCmd / err);
  return aCmd;
}

function doglegThrustFn(prop: PropState | null, epoch: EphemerisEpoch): ThrustFn {
  return (t, pos, vel) => {
    if (!prop || !hasPropellant(prop, "ship") || fuelShipFrac(prop) < DOGLEG_RESERVE_FRAC) return null;
    const aCmd = fillDoglegAccel(t, pos, vel, epoch);
    if (aCmd < 1e-8) return null;
    if (!prop) return _tmp;
    const lim = limitAccelByThrust(prop, aCmd, "ship");
    if (lim.forceN < 1e-3) return null;
    return scale(_tmp, _tmp, lim.aKmS2 / aCmd);
  };
}

function leoPushStep(
  samples: Sample[] | null, lastT: { t: number } | null, state: CraftState, prop: PropState | null,
  aKmS2: number, force: boolean,
): void {
  if (samples && lastT) pushSample(samples, state, "lowEarthOrbit", aKmS2 >= 1e-4, force, 0, lastT, prop, aKmS2, "ship", false);
}

function leoCoastTiming(): { coastS: number; dt: number } {
  const period = 2 * Math.PI * Math.sqrt(LOW_EARTH_ORBIT_RADIUS ** 3 / MU_EARTH);
  const coastS = LOW_EARTH_ORBIT_COAST_S > 0 ? LOW_EARTH_ORBIT_COAST_S : period * 1.25;
  return { coastS, dt: DOGLEG_DT };
}

function runLeoDoglegLoop(
  state: CraftState, tEnd: number, dt: number,
  samples: Sample[] | null, lastT: { t: number } | null, prop: PropState | null, epoch: EphemerisEpoch,
): number {
  const guide = doglegThrustFn(prop, epoch);
  let doglegDv = 0;
  let lastPush = state.t;
  while (state.t < tEnd - 1e-9) {
    const step = Math.min(dt, tEnd - state.t);
    const canBurn = prop && hasPropellant(prop, "ship") && fuelShipFrac(prop) >= DOGLEG_RESERVE_FRAC;
    const aCmd = canBurn ? fillDoglegAccel(state.t, state.pos, state.vel, epoch) : 0;
    const lim = prop && aCmd > 1e-8 ? limitAccelByThrust(prop, aCmd, "ship") : { aKmS2: aCmd, forceN: 0 };
    const tBefore = state.t;
    rk4Step(state, step, guide, { epoch });
    if (prop && lim.forceN > 1e-3) {
      prop.lastT = tBefore;
      burnForce(prop, state.t, lim.forceN, "ship");
    }
    doglegDv += lim.aKmS2 * step;
    if (samples && lastT && (state.t - lastPush >= 10 || state.t >= tEnd - 1e-9)) {
      leoPushStep(samples, lastT, state, prop, lim.aKmS2, state.t >= tEnd - 1e-9);
      lastPush = state.t;
    }
  }
  return doglegDv;
}

/**
 * Run the dogleg coast in place on `state`.
 * @returns Integrated out-of-plane / circularize Δv (km/s).
 */
export function runLunarPlaneLowEarthOrbitCoast(
  state: CraftState, samples: Sample[] | null, lastT: { t: number } | null,
  prop: PropState | null = null, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  const t0 = state.t, timing = leoCoastTiming();
  leoTargetPlane(state, t0, timing.coastS, epoch);
  if (samples && lastT) pushSample(samples, state, "lowEarthOrbit", false, true, 0, lastT, prop, 0, "ship");
  return runLeoDoglegLoop(state, t0 + timing.coastS, timing.dt, samples, lastT, prop, epoch);
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

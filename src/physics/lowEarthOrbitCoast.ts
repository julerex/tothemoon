/**
 * After ascent: circular-ish LEO parking with an integrated out-of-plane dogleg
 * toward the south-biased transfer plane, then ballistic coast until TLI.
 *
 * Geometry is RK4 (same path for search probes and the bake). Plane-change Δv
 * is the booked theater class {@link DOGLEG_DV_CAP_KM_S} — not a full ~26°
 * combined plane change, which would starve TLI / LOI. Leftover plane error is
 * absorbed by the TLI Δv search.
 */

import {
  DOGLEG_DV_CAP_KM_S,
  LOW_EARTH_ORBIT_COAST_S,
  LOW_EARTH_ORBIT_RADIUS,
  MU_EARTH,
} from "./constants";
import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import { getAscent } from "./ascentCache";
import { getBodies, rk4Step, type CraftState, type ThrustFn } from "./integrator";
import { pushSample } from "./missionSample";
import type { Sample } from "./missionTypes";
import {
  burnForce,
  createPropState,
  hasPropellant,
  wetMassKg,
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

/** Chosen low Earth orbit coast duration (s). */
let _leoCoastS = LOW_EARTH_ORBIT_COAST_S;

/** Last dogleg plane-change Δv delivered (km/s) — diagnostic / precompute log. */
let _lastDoglegDvKmS = 0;

/** RK4 step during LEO dogleg / parking (s). Search rebuilds LEO often. */
const DOGLEG_DT_S = 5;

/**
 * Commanded dogleg accel (km/s²). Matches ship vacuum T/W class so probes
 * (no propellant) and the bake share the same inertial path.
 */
const DOGLEG_ACCEL_KM_S2 = 0.012;

/** Sample interval while coasting / burning (s). */
const DOGLEG_SAMPLE_S = 10;

export function setLowEarthOrbitCoastS(s: number): void {
  _leoCoastS = s;
  _leoRelCache = null;
}

export function getLowEarthOrbitCoastS(): number {
  return _leoCoastS;
}

/** Total plane-change class Δv delivered on the last low Earth orbit dogleg (km/s). */
export function getLastDoglegDvKmS(): number {
  return _lastDoglegDvKmS;
}

const _n0 = v3();
const _n1 = v3();
const _nNow = v3();
const _relP = v3();
const _relV = v3();
const _rHat = v3();
const _periHat = v3();
const _tangent = v3();
const _vGo = v3();
const _thrust = v3();
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

function leoCoastS(): number {
  if (_leoCoastS > 0) return _leoCoastS;
  return 2 * Math.PI * Math.sqrt(LOW_EARTH_ORBIT_RADIUS ** 3 / MU_EARTH) * 1.25;
}

/**
 * Theater circular hold in the current plane (replaces the old per-step
 * circular snap) plus a |v|-preserving rotation toward transfer-plane prograde.
 * Only the out-of-plane part is billed against {@link DOGLEG_DV_CAP_KM_S}.
 * Returns billed accel (km/s²); total thrust is written to `_thrust`.
 */
function doglegGuideAccel(state: CraftState, vCirc: number, epoch: EphemerisEpoch): number {
  const b = getBodies(state.t, epoch);
  sub(_relP, state.pos, b.earth);
  sub(_relV, state.vel, b.earthVel);
  const r = len(_relP);
  const v = len(_relV);
  if (r < 1e-6) return 0;
  normalize(_rHat, _relP);
  cross(_nNow, _relP, _relV);
  if (len(_nNow) < 1e-12) set(_nNow, _n1.x, _n1.y, _n1.z);
  normalize(_nNow, _nNow);
  cross(_tangent, _nNow, _rHat);
  if (len(_tangent) < 1e-10) return 0;
  normalize(_tangent, _tangent);
  const vr = dot(_relV, _rHat);
  const vt = dot(_relV, _tangent);
  const aHoldR = 0.0005 * (LOW_EARTH_ORBIT_RADIUS - r) - 0.12 * vr;
  const aHoldT = 0.12 * (vCirc - vt);
  set(
    _thrust,
    _rHat.x * aHoldR + _tangent.x * aHoldT,
    _rHat.y * aHoldR + _tangent.y * aHoldT,
    _rHat.z * aHoldR + _tangent.z * aHoldT,
  );
  const aHold = len(_thrust);
  if (aHold > 0.008) scale(_thrust, _thrust, 0.008 / aHold);
  if (v < 1e-6) { set(_vGo, 0, 0, 0); return 0; }
  cross(_vGo, _n1, _rHat);
  if (len(_vGo) < 1e-10) { set(_vGo, 0, 0, 0); return 0; }
  normalize(_vGo, _vGo);
  const vHatX = _relV.x / v, vHatY = _relV.y / v, vHatZ = _relV.z / v;
  const along = _vGo.x * vHatX + _vGo.y * vHatY + _vGo.z * vHatZ;
  _vGo.x -= vHatX * along; _vGo.y -= vHatY * along; _vGo.z -= vHatZ * along;
  const go = len(_vGo);
  if (go < 0.004) { set(_vGo, 0, 0, 0); return 0; }
  normalize(_vGo, _vGo);
  return go * v;
}

function doglegStepAccel(remainDv: number, go: number, dt: number): number {
  if (remainDv < 1e-6 || go < 0.008) return 0;
  return Math.min(DOGLEG_ACCEL_KM_S2, remainDv / Math.max(dt, 1e-6), Math.max(go / dt, 0.002));
}

function doglegThrustFn(ax: number, ay: number, az: number): ThrustFn {
  return () => set(_thrust, ax, ay, az);
}

type DoglegLoop = {
  state: CraftState;
  samples: Sample[] | null;
  lastT: { t: number } | null;
  prop: PropState | null;
  epoch: EphemerisEpoch;
  tMin: number;
  tMax: number;
  vCirc: number;
  dvSpent: number;
  prevAlign: number;
};

function periapsisAlign(state: CraftState, epoch: EphemerisEpoch): number {
  const b = getBodies(state.t, epoch);
  sub(_relP, state.pos, b.earth);
  sub(_relV, state.vel, b.earthVel);
  cross(_nNow, _relP, _relV);
  if (len(_nNow) < 1e-12) set(_nNow, _n1.x, _n1.y, _n1.z);
  normalize(_nNow, _nNow);
  projectToPlaneUnit(_relP, _nNow, _rHat);
  moonArrivalDirection(state.t, _periHat, epoch);
  set(_periHat, -_periHat.x, -_periHat.y, -_periHat.z);
  projectToPlaneUnit(_periHat, _nNow, _periHat);
  return dot(_rHat, _periHat);
}

function doglegPush(
  loop: DoglegLoop, burning: boolean, aStep: number, force: boolean,
): void {
  if (!loop.samples || !loop.lastT) return;
  pushSample(
    loop.samples, loop.state, "lowEarthOrbit", burning, force, DOGLEG_SAMPLE_S,
    loop.lastT, loop.prop, aStep, "ship", false,
  );
}

function doglegShouldStop(loop: DoglegLoop, align: number): boolean {
  if (loop.state.t >= loop.tMax - 1e-9) return true;
  if (loop.state.t < loop.tMin) return false;
  return align > 0.97 && align + 1e-6 < loop.prevAlign;
}

function doglegIntegrateOnce(loop: DoglegLoop): boolean {
  const dt = Math.min(DOGLEG_DT_S, loop.tMax - loop.state.t);
  if (dt <= 1e-9) return false;
  const remain = DOGLEG_DV_CAP_KM_S - loop.dvSpent;
  const go = doglegGuideAccel(loop.state, loop.vCirc, loop.epoch);
  const canBurn = remain > 1e-6 && (!loop.prop || hasPropellant(loop.prop, "ship"));
  const aStep = canBurn ? doglegStepAccel(remain, go, dt) : 0;
  const ax = _thrust.x + _vGo.x * aStep;
  const ay = _thrust.y + _vGo.y * aStep;
  const az = _thrust.z + _vGo.z * aStep;
  const thrustFn = (Math.abs(ax) + Math.abs(ay) + Math.abs(az) > 1e-8)
    ? doglegThrustFn(ax, ay, az)
    : undefined;
  const tBefore = loop.state.t;
  rk4Step(loop.state, dt, thrustFn, { epoch: loop.epoch });
  if (loop.prop && aStep > 0) {
    const forceN = wetMassKg(loop.prop) * aStep * 1000;
    loop.prop.lastT = tBefore;
    burnForce(loop.prop, loop.state.t, forceN, "ship");
  }
  loop.dvSpent = Math.min(DOGLEG_DV_CAP_KM_S, loop.dvSpent + aStep * dt);
  const align = periapsisAlign(loop.state, loop.epoch);
  const stop = doglegShouldStop(loop, align);
  loop.prevAlign = align;
  doglegPush(loop, aStep > 0, aStep, stop);
  return !stop;
}

/**
 * After ascent: **integrated** circular-ish low Earth orbit that doglegs toward
 * the **south-biased transfer plane** (same as translunar injection), ~1.25 revs.
 *
 * Out-of-plane Δv is RK4 thrust at the booked class (thrust ⟂ v so parking
 * |v| stays circular). In-plane, the coast continues until the radius vector
 * lines up with TLI periapsis (Kepler phasing — not a position slerp). Search
 * probes pass `prop=null` but the same accel so TLI start state matches.
 */
export function runLunarPlaneLowEarthOrbitCoast(
  state: CraftState, samples: Sample[] | null, lastT: { t: number } | null,
  prop: PropState | null = null, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): void {
  const t0 = state.t;
  const coastS = leoCoastS();
  leoTargetPlane(state, t0, coastS, epoch);
  const vCirc = Math.sqrt(MU_EARTH / LOW_EARTH_ORBIT_RADIUS);
  if (samples && lastT) pushSample(samples, state, "lowEarthOrbit", false, true, 0, lastT, prop, 0, "ship");
  const loop: DoglegLoop = {
    state, samples, lastT, prop, epoch,
    tMin: t0 + coastS * 0.85, tMax: t0 + coastS * 1.45, vCirc, dvSpent: 0,
    prevAlign: periapsisAlign(state, epoch),
  };
  while (doglegIntegrateOnce(loop)) { /* RK4 until periapsis phase or tMax */ }
  _lastDoglegDvKmS = loop.dvSpent;
}

type LeoRelCache = { key: string; rel: LowEarthOrbitRelative };
let _leoRelCache: LeoRelCache | null = null;

function epochCacheKey(epoch: EphemerisEpoch): string {
  return `${epoch.moonPhase0}|${epoch.horizonsLandingT}|${epoch.useHorizons}|${epoch.sunPhase0}|${epoch.clockUtcMsAtT0}|${_leoCoastS}`;
}

/** Ascent end → continuous low Earth orbit coast → low Earth orbit-rel state for probes. */
export function computeLowEarthOrbitRelative(
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
  _coastS?: number,
): LowEarthOrbitRelative {
  void _coastS;
  const key = epochCacheKey(epoch);
  if (_leoRelCache && _leoRelCache.key === key) {
    const c = _leoRelCache.rel;
    return {
      t: c.t,
      relPos: { x: c.relPos.x, y: c.relPos.y, z: c.relPos.z },
      relVel: { x: c.relVel.x, y: c.relVel.y, z: c.relVel.z },
    };
  }
  const ascent = getAscent();
  const state = cloneState(ascent.state);
  runLunarPlaneLowEarthOrbitCoast(state, null, null, null, epoch);
  const rel = captureLowEarthOrbitRelative(state, epoch);
  _leoRelCache = { key, rel };
  return {
    t: rel.t,
    relPos: { x: rel.relPos.x, y: rel.relPos.y, z: rel.relPos.z },
    relVel: { x: rel.relVel.x, y: rel.relVel.y, z: rel.relVel.z },
  };
}

/** Append ascent samples, then low Earth orbit dogleg into the lunar plane (paid ship Δv). */
function copyAscentProp(prop: PropState, ascent: ReturnType<typeof getAscent>): void {
  const ap = ascent.prop ?? createPropState(ascent.state.t);
  prop.boosterPropKg = ap.boosterPropKg;
  prop.shipPropKg = ap.shipPropKg;
  prop.lastT = ap.lastT;
  prop.staged = ap.staged;
}

function appendAscentSamples(samples: Sample[], lastT: { t: number }, ascent: ReturnType<typeof getAscent>): void {
  for (const s of ascent.samples) {
    samples.push({
      t: s.t, pos: clone(s.pos), vel: clone(s.vel), phase: s.phase, burning: s.burning,
      fuelBooster: s.fuelBooster, fuelShip: s.fuelShip, thrustN: s.thrustN, staged: s.staged,
    });
    lastT.t = s.t;
  }
}

export function appendAscentAndLowEarthOrbitCoast(
  samples: Sample[], lastT: { t: number }, prop: PropState,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS, _coastS?: number,
): CraftState {
  void _coastS;
  const ascent = getAscent();
  copyAscentProp(prop, ascent);
  appendAscentSamples(samples, lastT, ascent);
  const state = cloneState(ascent.state);
  runLunarPlaneLowEarthOrbitCoast(state, samples, lastT, prop, epoch);
  return state;
}

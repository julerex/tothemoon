/**
 * Powered ascent from Starbase (Boca Chica, TX) to circular low Earth orbit.
 *
 * Theater model (A5 staged profile):
 * - Gravity turn due-east (parking i ≈ site lat)
 * - Mass-coupled thrust a = F/m with pure rocket-equation ṁ
 * - Booster throttle schedule (Maximum dynamic pressure dip + late main engine cutoff ramp) → ~1.2–1.5 g avg
 * - Hot-stage: booster throttle-down → ship ignition → separation
 * - Ship upper burn on the integrator until circular-ish low Earth orbit
 *   (no residual path blend / Δv cap)
 *
 * Not ops-grade: timing and throttle tables are approximate Starship-shaped.
 */

import {
  ASCENT_ACCEL,
  ASCENT_SHIP_ACCEL,
  HOT_STAGE_S,
  LOW_EARTH_ORBIT_ALTITUDE,
  MU_EARTH,
  R_EARTH,
  SHIP_ASCENT_THRUST_N,
  STAGE_ALT_MIN_KM,
  STAGE_PROP_ARM,
  UPPER_BURN_MAX_S,
} from "./constants";
import { enuAtPosition, starbasePadState } from "./earthFrame";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import {
  altitudeEarth,
  getBodies,
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import {
  burnForce,
  createPropState,
  fuelBoosterFrac,
  fuelShipFrac,
  hasPropellant,
  limitAccelByThrust,
  stageBooster,
  wetMassKg,
  type PropState,
} from "./propellant";
import {
  clone,
  dot,
  len,
  normalize,
  scale,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

export type AscentPhase = "launch" | "ascent" | "lowEarthOrbit";

/** Internal burn mode for the staged profile. */
export type AscentBurnMode = "boost" | "hot_stage" | "upper";

export type AscentSample = {
  t: number;
  pos: V3;
  vel: V3;
  phase: AscentPhase;
  burning: boolean;
  /** Booster propellant remaining (0–1) */
  fuelBooster: number;
  /** Ship propellant remaining (0–1) */
  fuelShip: number;
  /** Thrust force (N); 0 when engines idle */
  thrustN: number;
  /** True after booster stage-out */
  staged: boolean;
};

export type AscentResult = {
  state: CraftState;
  samples: AscentSample[];
  ok: boolean;
  message: string;
  insertionAlt: number;
  insertionSpeed: number;
  /** Propellant state after insert (booster staged) */
  prop: PropState;
};

function makeAscentSample(
  state: CraftState, phase: AscentPhase, burning: boolean, prop: PropState, thrustN: number,
): AscentSample {
  return { t: state.t, pos: clone(state.pos), vel: clone(state.vel), phase, burning, fuelBooster: fuelBoosterFrac(prop), fuelShip: fuelShipFrac(prop), thrustN, staged: prop.staged };
}

function pushAscentSample(
  samples: AscentSample[],
  state: CraftState,
  phase: AscentPhase,
  burning: boolean,
  prop: PropState,
  thrustN: number,
): void {
  samples.push(makeAscentSample(state, phase, burning, prop, thrustN));
}

const _up = v3();
const _east = v3();
const _north = v3();
const _relP = v3();
const _relV = v3();
const _steer = v3();
const _target = v3();
const _aBoost = v3();
const _aShip = v3();
const _aSum = v3();

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Max-Q / altitude throttle shaping for booster. */
function boosterThrottleShape(altKm: number, thr: number): number {
  if (altKm > 5 && altKm < 28) {
    const dip = 1 - 0.32 * Math.sin(Math.PI * smoothstep(5, 28, altKm));
    const mid = 1 - 0.22 * Math.sin(Math.PI * smoothstep(8, 22, altKm));
    return thr * Math.min(dip, mid);
  }
  if (altKm >= 28 && altKm < 50) {
    return thr * (0.92 + 0.08 * smoothstep(28, 50, altKm));
  }
  return thr;
}

/**
 * Booster throttle in [0, 1] — theater schedule for average ~1.2–1.5 g.
 *
 * - Liftoff: near full (need T/W > 1)
 * - maximum dynamic pressure dip ~8–20 km (Starship-shaped)
 * - Recovery after maximum dynamic pressure
 * - Late main engine cutoff ramp when propellant is nearly gone
 * - Hot-stage: deep throttle-down before separation
 *
 * Exported for unit tests.
 */
export function boosterThrottle(
  altKm: number,
  propFrac: number,
  mode: AscentBurnMode,
): number {
  if (mode === "upper") return 0;
  if (mode === "hot_stage") return 0.2;
  let thr = boosterThrottleShape(altKm, 0.88);
  if (altKm < 2.5) thr = Math.max(thr, 0.98);
  if (propFrac < STAGE_PROP_ARM * 2.5) {
    thr *= Math.max(0.15, propFrac / (STAGE_PROP_ARM * 2.5));
  }
  return Math.max(0, Math.min(1, thr));
}

export type SteerGeo = {
  alt: number;
  vRad: number;
  vEast: number;
  vNorth: number;
  vCirc: number;
};

/** Fill ENU + surface-relative velocity; returns local geometry. */
function fillSteerGeo(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): SteerGeo {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.earth);
  const r = len(_relP);
  enuAtPosition(t, pos, b.earth, _up, _east, _north);
  sub(_relV, vel, b.earthVel);
  return { alt: r - R_EARTH, vRad: dot(_relV, _up), vEast: dot(_relV, _east), vNorth: dot(_relV, _north), vCirc: Math.sqrt(MU_EARTH / Math.max(r, R_EARTH + 50)) };
}

function closedLoopTgtRad(geo: SteerGeo, speedFrac: number): number {
  let tgtRad = -0.5 * geo.vRad;
  if (geo.alt < 140) {
    tgtRad += 1.6 * (140 - geo.alt) / 140;
    if (speedFrac < 0.9) tgtRad += 0.2 * (1 - speedFrac);
  } else if (geo.alt > 250) tgtRad -= 0.08;
  return tgtRad;
}

function boostEastErr(geo: SteerGeo, out: V3): void {
  if (geo.vEast >= geo.vCirc * 0.9) return;
  const k = (geo.vCirc - geo.vEast) * 1.2;
  out.x += _east.x * k; out.y += _east.y * k; out.z += _east.z * k;
}

function setClosedLoopTarget(tgtRad: number, eastW: number, vCirc: number): void {
  set(
    _target,
    _up.x * tgtRad + _east.x * vCirc * eastW,
    _up.y * tgtRad + _east.y * vCirc * eastW,
    _up.z * tgtRad + _east.z * vCirc * eastW,
  );
}

/** Closed-loop circular LEO target direction into `out`. */
function steerClosedLoop(geo: SteerGeo, out: V3): void {
  const speedFrac = Math.min(1, Math.max(0, geo.vEast / Math.max(geo.vCirc, 1)));
  const eastW = geo.alt < 100 ? 1 : 1.0 + 1.0 * (1 - speedFrac);
  setClosedLoopTarget(closedLoopTgtRad(geo, speedFrac), eastW, geo.vCirc);
  set(out, _target.x - _relV.x, _target.y - _relV.y, _target.z - _relV.z);
  if (geo.alt >= 90) boostEastErr(geo, out);
}

/** Gravity-turn pitch (rad) from altitude. */
function gravityTurnPitch(alt: number): number {
  if (alt < 0.6) return 0;
  if (alt < 40) return smoothstep(0.6, 42, alt) * (Math.PI / 2) * 0.88;
  const pitch =
    smoothstep(40, 85, alt) * (Math.PI / 2) * 0.08 + (Math.PI / 2) * 0.88;
  return Math.min(pitch, (Math.PI / 2) * 0.97);
}

/** Open-loop gravity turn into `out`. */
function steerGravityTurn(geo: SteerGeo, out: V3): void {
  const pitch = gravityTurnPitch(geo.alt); const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  set(
    out,
    _up.x * cp + _east.x * sp - _north.x * geo.vNorth * 0.2,
    _up.y * cp + _east.y * sp - _north.y * geo.vNorth * 0.2,
    _up.z * cp + _east.z * sp - _north.z * geo.vNorth * 0.2,
  );
}

/** Normalize steer direction (fallback to up). */
function normalizeSteer(out: V3): void {
  const mag = len(out);
  if (mag < 1e-12) set(out, _up.x, _up.y, _up.z);
  else normalize(out, out);
}

/**
 * Unit thrust direction in inertial frame.
 *
 * - Boost: gravity turn (vertical → east) with earlier pitch-over so most Δv
 *   goes horizontal before main engine cutoff (theater; real tables differ).
 * - Hot-stage / upper: velocity-to-be-gained toward circular due-east low Earth orbit
 *   (kill radial, build east) — powered insert, not a lofted ballistic hop.
 *
 * Writes into `out` and returns local geometry.
 */
function steerDirection(
  t: number,
  pos: V3,
  vel: V3,
  out: V3,
  mode: AscentBurnMode,
  epoch: EphemerisEpoch,
): SteerGeo {
  const geo = fillSteerGeo(t, pos, vel, epoch);
  const closedLoop = mode !== "boost" || geo.alt > 85;
  if (closedLoop) steerClosedLoop(geo, out);
  else steerGravityTurn(geo, out);
  normalizeSteer(out);
  return geo;
}

/**
 * Commanded acceleration magnitude (km/s²) before thrust/mass limits.
 */
function aCmdForAlt(
  alt: number,
  vRad: number,
  vEast: number,
  vNorth: number,
  vCirc: number,
  peak: number,
): number {
  if (alt > 120) {
    const err = Math.hypot(
      vRad * 2,
      vEast - vCirc,
      vNorth * 2,
      (alt - LOW_EARTH_ORBIT_ALTITUDE) * 0.03,
    ); return Math.min(peak * 1.1, Math.max(0.003, err * 1.0));
  }
  return peak;
}

type TankThrust = { a: V3; forceN: number };

/** Booster throttle including hot-stage ramp. */
function boosterThrSchedule(
  geo: SteerGeo,
  prop: PropState,
  mode: AscentBurnMode,
  hotStageAgeS: number,
): number {
  let thr = boosterThrottle(geo.alt, fuelBoosterFrac(prop), mode);
  if (mode === "hot_stage") {
    const u = Math.max(0, 1 - hotStageAgeS / HOT_STAGE_S);
    thr = 0.35 * u;
  }
  return thr;
}

function tankThrustOrNull(aOut: V3, aKmS2: number, forceN: number): TankThrust | null {
  if (forceN < 1e-3 || aKmS2 < 1e-9) return null;
  return { a: scale(aOut, _steer, aKmS2), forceN };
}

function boosterACmd(geo: SteerGeo, mode: AscentBurnMode, peak: number): number {
  if (mode === "boost" && geo.alt < 85) return peak;
  return aCmdForAlt(geo.alt, geo.vRad, geo.vEast, geo.vNorth, geo.vCirc, peak);
}

/**
 * Booster thrust under the current mode + throttle schedule.
 */
function boosterThrust(
  t: number,
  pos: V3,
  vel: V3,
  prop: PropState,
  mode: AscentBurnMode,
  hotStageAgeS: number,
  epoch: EphemerisEpoch,
): TankThrust | null {
  if (mode === "upper" || prop.staged || !hasPropellant(prop, "booster")) return null;
  const geo = steerDirection(t, pos, vel, _steer, mode, epoch);
  if (geo.alt < -1) return null;
  const peak = ASCENT_ACCEL * boosterThrSchedule(geo, prop, mode, hotStageAgeS);
  const lim = limitAccelByThrust(prop, boosterACmd(geo, mode, peak), "booster");
  return tankThrustOrNull(_aBoost, lim.aKmS2, lim.forceN);
}

/** Ship peak accel taper near circular. */
function shipPeakFromErr(vErr: number, alt: number): number {
  let peak = ASCENT_SHIP_ACCEL;
  if (alt < 90 && vErr > 1) return peak;
  if (vErr < 1.5) peak = Math.min(peak, 0.02 + vErr * 0.025);
  if (vErr < 0.4) peak = Math.min(peak, 0.008 + vErr * 0.02);
  return peak;
}

/**
 * Ship thrust during hot-stage and upper / circularization.
 */
function shipThrust(
  t: number,
  pos: V3,
  vel: V3,
  prop: PropState,
  mode: AscentBurnMode,
  epoch: EphemerisEpoch,
): TankThrust | null {
  if (mode === "boost" || !hasPropellant(prop, "ship")) return null;
  const geo = steerDirection(t, pos, vel, _steer, mode, epoch);
  if (geo.alt < -1) return null;
  const vErr = Math.hypot(geo.vRad * 2, geo.vEast - geo.vCirc, geo.vNorth * 2); const aCmd = aCmdForAlt(geo.alt, geo.vRad, geo.vEast, geo.vNorth, geo.vCirc, shipPeakFromErr(vErr, geo.alt));
  const m = wetMassKg(prop);
  if (m < 1e-3) return null;
  const forceN = Math.min(aCmd * m * 1000, SHIP_ASCENT_THRUST_N);
  return tankThrustOrNull(_aShip, forceN / m / 1000, forceN);
}

function addTankAcc(sum: V3, tank: TankThrust | null): void {
  if (!tank) return;
  sum.x += tank.a.x; sum.y += tank.a.y; sum.z += tank.a.z;
}

function combineThrust(
  boost: TankThrust | null,
  ship: TankThrust | null,
): { a: V3 | null; forceN: number; boostN: number; shipN: number } {
  const boostN = boost?.forceN ?? 0;
  const shipN = ship?.forceN ?? 0;
  if (!boost && !ship) return { a: null, forceN: 0, boostN: 0, shipN: 0 };
  set(_aSum, 0, 0, 0);
  addTankAcc(_aSum, boost);
  addTankAcc(_aSum, ship);
  return { a: _aSum, forceN: boostN + shipN, boostN, shipN };
}

/** Shared insertion geometry checks. */
function insertionGeom(
  t: number,
  pos: V3,
  vel: V3,
  epoch: EphemerisEpoch,
): { alt: number; vRad: number; v: number; vCirc: number } | null {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.earth);
  const r = len(_relP);
  sub(_relV, vel, b.earthVel);
  normalize(_up, _relP);
  return { alt: r - R_EARTH, vRad: Math.abs(dot(_relV, _up)), v: len(_relV), vCirc: Math.sqrt(MU_EARTH / r) };
}

/**
 * Stable circular-ish parking above the sensible atmosphere.
 * Target LOW_EARTH_ORBIT_ALTITUDE is preferred but any ~100–250 km circular orbit is
 * accepted so the upper stage does not waste ship prop climbing after
 * already reaching orbital speed (saves fuel for dogleg + translunar injection).
 */
function insertionOk(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): boolean {
  const g = insertionGeom(t, pos, vel, epoch);
  if (!g || g.alt < 90 || g.alt > LOW_EARTH_ORBIT_ALTITUDE + 50) return false;
  return g.vRad < 0.12 && Math.abs(g.v - g.vCirc) < 0.25;
}

/** Near-circular enough to accept as theater low Earth orbit (slightly looser). */
function insertionNear(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): boolean {
  const g = insertionGeom(t, pos, vel, epoch);
  if (!g || g.alt < 85 || g.alt > LOW_EARTH_ORBIT_ALTITUDE + 60) return false;
  return g.vRad < 0.2 && Math.abs(g.v - g.vCirc) < 0.4;
}

function shouldArmHotStage(
  alt: number,
  prop: PropState,
  mode: AscentBurnMode,
): boolean {
  if (mode !== "boost" || prop.staged) return false;
  if (alt < STAGE_ALT_MIN_KM) return false;
  if (!hasPropellant(prop, "booster")) return true;
  return fuelBoosterFrac(prop) <= STAGE_PROP_ARM;
}

function successResult(
  state: CraftState,
  samples: AscentSample[],
  prop: PropState,
  message: string,
  epoch: EphemerisEpoch,
): AscentResult {
  const b = getBodies(state.t, epoch);
  sub(_relV, state.vel, b.earthVel);
  return { state, samples, ok: true, message, insertionAlt: altitudeEarth(state.t, state.pos, epoch), insertionSpeed: len(_relV), prop };
}

function failResult(
  state: CraftState,
  samples: AscentSample[],
  prop: PropState,
  message: string,
  alt: number,
): AscentResult {
  return { state, samples, ok: false, message, insertionAlt: alt, insertionSpeed: 0, prop };
}

type AscentLoop = {
  state: CraftState;
  samples: AscentSample[];
  prop: PropState;
  epoch: EphemerisEpoch;
  mode: AscentBurnMode;
  hotStageT0: number;
  upperBurnT0: number;
  lastSampleT: { t: number };
};

function enterUpper(loop: AscentLoop): void {
  stageBooster(loop.prop, loop.state.t);
  loop.mode = "upper";
  loop.upperBurnT0 = loop.state.t;
}

function boosterDryFail(loop: AscentLoop, alt: number): AscentResult | null {
  if (loop.mode !== "boost" || hasPropellant(loop.prop, "booster")) return null;
  if (alt >= STAGE_ALT_MIN_KM * 0.7) { enterUpper(loop); return null; }
  return failResult(loop.state, loop.samples, loop.prop, "Booster propellant depleted", alt);
}

/** Mode transitions: hot-stage arm / stage / upper. */
function advanceAscentMode(loop: AscentLoop, alt: number): AscentResult | null {
  const { prop, state } = loop;
  if (loop.mode === "boost" && shouldArmHotStage(alt, prop, loop.mode)) {
    loop.mode = "hot_stage";
    loop.hotStageT0 = state.t;
  }
  if (loop.mode === "hot_stage" && state.t - loop.hotStageT0 >= HOT_STAGE_S) {
    enterUpper(loop);
  }
  return boosterDryFail(loop, alt);
}

function upperBurnDone(loop: AscentLoop): boolean {
  const { state, prop, epoch } = loop;
  const upperAge = state.t - loop.upperBurnT0;
  return (
    upperAge >= UPPER_BURN_MAX_S ||
    !hasPropellant(prop, "ship") ||
    insertionOk(state.t, state.pos, state.vel, epoch) ||
    insertionNear(state.t, state.pos, state.vel, epoch)
  );
}

function finishUpperOrbit(loop: AscentLoop): AscentResult {
  const { state, samples, prop, epoch } = loop;
  if (insertionOk(state.t, state.pos, state.vel, epoch) || insertionNear(state.t, state.pos, state.vel, epoch)) {
    pushAscentSample(samples, state, "lowEarthOrbit", false, prop, 0);
    return successResult(state, samples, prop, "low Earth orbit", epoch);
  }
  const alt = altitudeEarth(state.t, state.pos, epoch);
  if (alt > 80) {
    pushAscentSample(samples, state, "lowEarthOrbit", false, prop, 0);
    return successResult(state, samples, prop, "low Earth orbit (upper burn)", epoch);
  }
  return failResult(state, samples, prop, "Upper burn did not circularize", alt);
}

/** Upper burn done → settle or success. */
function maybeFinishUpper(loop: AscentLoop): AscentResult | null {
  if (loop.mode !== "upper" || !upperBurnDone(loop)) return null;
  return finishUpperOrbit(loop);
}

/** Book propellant from step forces. */
function bookAscentProp(
  prop: PropState,
  tBefore: number,
  stateT: number,
  lastBoostN: number,
  lastShipN: number,
): void {
  if (lastBoostN <= 0 && lastShipN <= 0) { prop.lastT = stateT; return; }
  if (lastBoostN > 0) { prop.lastT = tBefore; burnForce(prop, stateT, lastBoostN, "booster"); }
  if (lastShipN > 0) { prop.lastT = tBefore; burnForce(prop, stateT, lastShipN, "ship"); }
}

/** Ascent integrator step size. */
function ascentDt(alt: number, mode: AscentBurnMode): number {
  if (alt < 15) return 0.15;
  if (alt < 40) return 0.25;
  if (alt < 100) return 0.4;
  return mode === "upper" ? 0.4 : 0.6;
}

/** One RK4 step + prop bookkeeping + sample. */
function currentStepForces(loop: AscentLoop): { boostN: number; shipN: number } {
  const hot = loop.mode === "hot_stage" ? loop.state.t - loop.hotStageT0 : 0;
  const bNow = boosterThrust(loop.state.t, loop.state.pos, loop.state.vel, loop.prop, loop.mode, hot, loop.epoch);
  const sNow = shipThrust(loop.state.t, loop.state.pos, loop.state.vel, loop.prop, loop.mode, loop.epoch);
  return { boostN: bNow?.forceN ?? 0, shipN: sNow?.forceN ?? 0 };
}

function maybeFinishHotStage(loop: AscentLoop): void {
  if (loop.mode !== "hot_stage" || loop.state.t - loop.hotStageT0 < HOT_STAGE_S) return;
  stageBooster(loop.prop, loop.state.t);
  loop.mode = "upper";
  loop.upperBurnT0 = loop.state.t;
}

function ascentThrustFn(loop: AscentLoop, hotAge: number): ThrustFn {
  const { prop, epoch } = loop;
  return (t, p, v) =>
    combineThrust(
      boosterThrust(t, p, v, prop, loop.mode, hotAge, epoch),
      shipThrust(t, p, v, prop, loop.mode, epoch),
    ).a;
}

function maybePushAscentStep(
  loop: AscentLoop, phase: AscentPhase, boostN: number, shipN: number,
): void {
  const minDt = phase === "launch" ? 0.15 : 0.35;
  if (loop.state.t - loop.lastSampleT.t < minDt - 1e-9) return;
  loop.lastSampleT.t = loop.state.t;
  pushAscentSample(loop.samples, loop.state, phase, boostN + shipN > 0, loop.prop, boostN + shipN);
}

function integrateAscentStep(loop: AscentLoop, alt: number, phase: AscentPhase): void {
  const hotAge = loop.mode === "hot_stage" ? loop.state.t - loop.hotStageT0 : 0;
  const tBefore = loop.state.t;
  rk4Step(loop.state, ascentDt(alt, loop.mode), ascentThrustFn(loop, hotAge), { epoch: loop.epoch });
  const { boostN, shipN } = currentStepForces(loop);
  bookAscentProp(loop.prop, tBefore, loop.state.t, boostN, shipN);
  maybeFinishHotStage(loop);
  maybePushAscentStep(loop, phase, boostN, shipN);
}

/** Timeout: accept orbital-class coast if already staged; do not blend to circular. */
function ascentTimeout(loop: AscentLoop): AscentResult {
  const { state, samples, prop, epoch } = loop;
  const alt = altitudeEarth(state.t, state.pos, epoch);
  if (!prop.staged && alt > STAGE_ALT_MIN_KM * 0.8) stageBooster(prop, state.t);
  if (prop.staged && (insertionNear(state.t, state.pos, state.vel, epoch) || alt > 80)) {
    pushAscentSample(samples, state, "lowEarthOrbit", false, prop, 0);
    return successResult(state, samples, prop, "low Earth orbit (upper burn)", epoch);
  }
  return failResult(state, samples, prop, "Ascent timeout", alt);
}

function padAscentState(epoch: EphemerisEpoch): CraftState {
  const pad = starbasePadState(0, epoch);
  const state: CraftState = { t: 0, pos: clone(pad.pos), vel: clone(pad.vel) };
  state.vel.x += pad.up.x * 0.01;
  state.vel.y += pad.up.y * 0.01;
  state.vel.z += pad.up.z * 0.01;
  return state;
}

/**
 * Integrate Starbase pad → circular low Earth orbit with staged hot-stage profile.
 */
function initAscentLoop(epoch: EphemerisEpoch): AscentLoop {
  return {
    state: padAscentState(epoch), samples: [], prop: createPropState(0), epoch,
    mode: "boost", hotStageT0: -1, upperBurnT0: -1, lastSampleT: { t: 0 },
  };
}

function earlyAscentExit(loop: AscentLoop, alt: number): AscentResult | null {
  const { state, samples, prop, epoch } = loop;
  if (insertionOk(state.t, state.pos, state.vel, epoch)) {
    if (!prop.staged) stageBooster(prop, state.t);
    pushAscentSample(samples, state, "lowEarthOrbit", false, prop, 0);
    return successResult(state, samples, prop, "low Earth orbit", epoch);
  }
  if (alt < -2) return failResult(state, samples, prop, "Ascent impact", alt);
  return null;
}

function ascentLoopOnce(loop: AscentLoop, epoch: EphemerisEpoch): AscentResult | null {
  const alt = altitudeEarth(loop.state.t, loop.state.pos, epoch); const early = earlyAscentExit(loop, alt);
  if (early) return early;
  const modeFail = advanceAscentMode(loop, alt);
  if (modeFail) return modeFail;
  const upperDone = maybeFinishUpper(loop);
  if (upperDone) return upperDone;
  integrateAscentStep(loop, alt, alt < 1.5 ? "launch" : "ascent");
  return null;
}

export function flyAscent(epoch: EphemerisEpoch): AscentResult {
  const loop = initAscentLoop(epoch);
  const th0 = combineThrust(
    boosterThrust(0, loop.state.pos, loop.state.vel, loop.prop, "boost", 0, epoch), null,
  ); pushAscentSample(loop.samples, loop.state, "launch", th0.forceN > 0, loop.prop, th0.forceN);
  while (loop.state.t < 20 * 60) {
    const done = ascentLoopOnce(loop, epoch);
    if (done) return done;
  }
  return ascentTimeout(loop);
}

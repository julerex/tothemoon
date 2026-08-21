/**
 * Theater Super Heavy recovery after stage-out.
 *
 * Force-model path: flip → boostback → coast/entry → landing burn → land.
 * Integrated with the shared RK4 Earth μ + J₂ + drag model (same acceleration
 * as the ship, Earth-only gravity — third-body terms are negligible on a
 * ~5 min suborbital arc). Boostback and landing-burn Δv are mass-coupled on
 * leftover booster propellant.
 *
 * Two profiles:
 * - **chopsticks** — return to launch site / tower catch at Starbase
 * - **gulf** — Flight 13 offshore **hard splash** in the Gulf of America
 *   (subset of landing engines; the booster falls into the ocean)
 *
 * Chopsticks: the last few km blend onto the tower so the catch reads.
 * Gulf: no soft seat — partial landing burn, then a water impact.
 *
 * Times relative to stage epoch follow Flight 5–7 / Flight 13 cadence.
 * Landing burn lights at the public mark (~T+6:27 Flight 13, ~T+6:30 Flight 5)
 * from ~3.5 km AGL (Flight 13 webcast Super Heavy 3.5 km at T+6:25).
 *
 * Samples are Earth-relative (heliocentric body motion is added back at
 * sample time). Scene unit = km. Pure + scrub-deterministic from (stage, age).
 */

import {
  BOOSTER_DRY_KG,
  BOOSTER_THRUST_N,
  EARTH_SURFACE_ALT_KM,
  G0,
  MU_EARTH,
  SPECIFIC_IMPULSE_BOOSTER,
} from "./constants";
import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import {
  earthNorthPole,
  meshLocalToInertial,
  starbasePadState,
} from "./earthFrame";
import {
  earthSurfaceRadiusAlong,
  geodeticToEllipsoidMeshLocal,
  radialHeightAboveEllipsoid,
} from "./wgs84";
import {
  altitudeEarth,
  getBodies,
  rk4Step,
  type CraftState,
} from "./integrator";
import {
  add,
  clone,
  copy,
  dot,
  len,
  madd,
  normalize,
  scale,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

/** Separation kick magnitude (km/s) aft along −velocity (Earth-relative). */
const SEP_DV = 0.035;
/** Extra radial kick outward from Earth (km/s). */
const SEP_RADIAL = 0.01;

/** Recovery landing profile. */
export type RecoveryProfile = "chopsticks" | "gulf";

/**
 * Timing / site schedule for a recovery profile (ages in s after stage-out).
 * Chopsticks defaults match historical RTLS theater; gulf matches Flight 13
 * public T+ table (boostback ~T+2:25–3:03, land ~T+6:27–6:53 after stage ~2:21).
 */
export type RecoverySchedule = {
  profile: RecoveryProfile;
  flipS: number;
  boostbackStartS: number;
  boostbackEndS: number;
  landingStartS: number;
  landingEndS: number;
  holdS: number;
  fadeS: number;
  /** Soft-land / catch height above mean surface (km). */
  landAltKm: number;
  /** Landing-burn start altitude AGL (km). */
  gateAltKm: number;
  /** Extra mid-coast loft (km). */
  coastLoftKm: number;
  /** Landing site lat (rad), east-positive lon (rad). */
  landLat: number;
  landLon: number;
  /**
   * True for Flight 13 gulf: partial landing-burn relight, then a hard
   * ocean splash (no hoverslam seat).
   */
  hardSplash: boolean;
};

/** Flip complete (s after stage) — chopsticks / default export. */
export const BOOSTER_FLIP_S = 6;
/** Boostback ignition (s) — lights during the flip. */
export const BOOSTBACK_START_S = 4;
/** Boostback cutoff (s) — ~38 s multi-engine burn. */
export const BOOSTBACK_END_S = 42;
/** Landing burn start (s) — high above the tower. */
export const LANDING_START_S = 250;
/** Landing burn / catch complete (s). */
export const LANDING_END_S = 278;
/** Hold on chopsticks before fade-out (s). */
export const CATCH_HOLD_S = 75;
/** Fade duration at end of hold (s). */
export const CATCH_FADE_S = 20;

/** Chopsticks catch height above pad (km) — mid-upper booster ~80 m. */
export const CATCH_ALT_KM = 0.08;

/**
 * Gulf of America splash zone (theater).
 * ~80–100 km SE of Starbase into the gulf — clearly offshore, not chopsticks.
 */
export const GULF_LAND_LAT = (25.55 * Math.PI) / 180;
export const GULF_LAND_LON = (-96.15 * Math.PI) / 180;

/** Flight 13–cadence gulf schedule (ages after stage-out). */
export const GULF_SCHEDULE: RecoverySchedule = {
  profile: "gulf",
  flipS: 6,
  boostbackStartS: 4, // T+2:25 if stage ≈ T+2:21
  boostbackEndS: 42, // T+3:03
  landingStartS: 243, // T+6:24 — engines lighting as HUD hits ~3.5 km
  landingEndS: 272, // T+6:53
  holdS: 45,
  fadeS: 22,
  landAltKm: 0.03,
  /** Flight 13 webcast: ~3.5 km AGL at T+6:25 with landing engines already lighting. */
  gateAltKm: 3.5,
  coastLoftKm: 10,
  landLat: GULF_LAND_LAT,
  landLon: GULF_LAND_LON,
  hardSplash: true,
};

/** Default chopsticks / RTLS schedule. */
export const CHOPSTICKS_SCHEDULE: RecoverySchedule = {
  profile: "chopsticks",
  flipS: BOOSTER_FLIP_S,
  boostbackStartS: BOOSTBACK_START_S,
  boostbackEndS: BOOSTBACK_END_S,
  landingStartS: LANDING_START_S,
  landingEndS: LANDING_END_S,
  holdS: CATCH_HOLD_S,
  fadeS: CATCH_FADE_S,
  landAltKm: CATCH_ALT_KM,
  /** Same ~5 km landing-burn gate as gulf / Flight 5–7 catch cadence. */
  gateAltKm: 5.0,
  coastLoftKm: 12,
  // Filled from Starbase pad each sample (lat/lon unused when chopsticks)
  landLat: 0,
  landLon: 0,
  hardSplash: false,
};

export function recoverySchedule(
  profile: RecoveryProfile = "chopsticks",
): RecoverySchedule {
  return profile === "gulf" ? GULF_SCHEDULE : CHOPSTICKS_SCHEDULE;
}

/** Total visible recovery window (s after stage) for a schedule. */
export function boosterVisibleS(sched: RecoverySchedule = CHOPSTICKS_SCHEDULE): number {
  return sched.landingEndS + sched.holdS + sched.fadeS;
}

/** Total visible recovery window (s after stage) — chopsticks default. */
export const BOOSTER_VISIBLE_S = boosterVisibleS(CHOPSTICKS_SCHEDULE);

/**
 * Far-range free-flyer locator window after stage-out (mission s).
 * Short on purpose — reads “where did the booster go?” then gets out of the way.
 */
export const BOOSTER_LOCATOR_S = 30;
/** Soft fade-out at the end of the locator window (s). */
export const BOOSTER_LOCATOR_FADE_S = 6;
/** Soft fade-in right after sep (s). */
export const BOOSTER_LOCATOR_FADE_IN_S = 0.5;
/**
 * Brief boostback ignition flash duration (s from BOOSTBACK_START_S).
 * Theater cue so the reverse burn reads at range; not physical plume scale.
 */
export const BOOSTBACK_FLASH_S = 2.8;
/**
 * Brief landing / catch contact flash duration (s from landingEndS).
 * Theater cue so the booster does not vanish into the ocean / chopsticks.
 */
export const LANDING_CONTACT_FLASH_S = 2.2;

/**
 * Last few km of descent are blended onto the chopsticks / gulf seat.
 * Force-model miss inside this bubble is faked so the booster seats visually.
 */
export const RECOVERY_SEAT_BLEND_KM = 4;

/** Theater leftover booster prop after stage-out (kg) — funds boostback + landing. */
const RECOVERY_PROP_KG = 1_600_000;

/** Detached-booster ballistic factor (km²/kg) — lighter than the ascent stack. */
const BOOSTER_CD_A_OVER_M = 4e-11;

/** Grid-fin theater lateral accel during coast (km/s²). */
const GRIDFIN_A = 0.003;

/** RK4 step (s) while the booster is in free flight. */
const RECOVERY_DT = 0.25;

/** Late-window seat blend so chopsticks still close even on a large miss. */
const SEAT_LATE_S = 8;

export type BoosterRecoveryPhase =
  | "sep"
  | "flip"
  | "boostback"
  | "coast"
  | "landing"
  | "caught"
  | "done";

export type StageState = {
  t: number;
  pos: V3;
  vel: V3;
};

export type BoosterRecoverySample = {
  phase: BoosterRecoveryPhase;
  /** Inertial / heliocentric position (km). */
  pos: V3;
  /** Inertial velocity (km/s). */
  vel: V3;
  /**
   * Unit nose direction (+Z mesh). After the flip this is anti-velocity
   * (engines-first) so burns read engines-into-wind.
   */
  nose: V3;
  /** True during boostback / landing burns. */
  burning: boolean;
  /** Plume throttle in [0, 1]. */
  throttle: number;
  /** Visibility fade in [0, 1]. */
  fade: number;
};

/** Earth-relative sample from the force-model bake. */
export type BoosterRecoveryKeyframe = {
  age: number;
  /** Position relative to Earth center (km). */
  p: V3;
  /** Velocity relative to Earth center velocity (km/s). */
  v: V3;
};

type RelKeyframe = BoosterRecoveryKeyframe;

/** Packed recovery bake: force-model samples + leftover-prop bookkeeping. */
export type BoosterRecoveryBake = {
  keyframes: BoosterRecoveryKeyframe[];
  startPropKg: number;
  leftoverPropKg: number;
  burnedPropKg: number;
};

const _tmp = v3();
const _tmp2 = v3();
const _tmp3 = v3();
const _acc = v3();
const _nose = v3();
const _pos = v3();
const _vel = v3();
const _pRel = v3();
const _vRel = v3();
const _thrustA = v3();
const _aim = v3();
const _up = v3();
const _pole = v3();
const _siteP = v3();
const _siteV = v3();
const _statePos = v3();
const _stateVel = v3();

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

type HermiteWeights = { h00: number; h10: number; h01: number; h11: number };

function hermitePosWeights(u: number): HermiteWeights {
  const u2 = u * u;
  const u3 = u2 * u;
  return { h00: 2 * u3 - 3 * u2 + 1, h10: u3 - 2 * u2 + u, h01: -2 * u3 + 3 * u2, h11: u3 - u2 };
}

function hermiteVelWeights(u: number): HermiteWeights {
  const u2 = u * u;
  return { h00: 6 * u2 - 6 * u, h10: 3 * u2 - 4 * u + 1, h01: -6 * u2 + 6 * u, h11: 3 * u2 - 2 * u };
}

function hermiteEval(
  p0: V3, v0: V3, p1: V3, v1: V3, w: HermiteWeights, dt: number, out: V3,
): void {
  scale(out, p0, w.h00);
  madd(out, out, v0, w.h10 * dt);
  madd(out, out, p1, w.h01);
  madd(out, out, v1, w.h11 * dt);
}

/**
 * Cubic Hermite on [age0, age1].
 * Writes Earth-relative position / velocity.
 */
function hermite(
  age: number,
  a0: number,
  a1: number,
  p0: V3,
  v0: V3,
  p1: V3,
  v1: V3,
  outP: V3,
  outV: V3,
): void {
  const dt = a1 - a0;
  if (dt <= 1e-12) { copy(outP, p1); copy(outV, v1); return; }
  const u = clamp01((age - a0) / dt);
  hermiteEval(p0, v0, p1, v1, hermitePosWeights(u), dt, outP);
  hermiteEval(p0, v0, p1, v1, hermiteVelWeights(u), dt, outV);
  scale(outV, outV, 1 / dt);
}

/** Site relative: chopsticks pad altitude or gulf geodetic. */
function siteRelAt(
  t: number, lat: number, lon: number, altKm: number, chopsticks: boolean,
  out: V3, epoch: EphemerisEpoch,
): V3 {
  if (chopsticks) {
    const pad = starbasePadState(t, epoch);
    madd(_tmp, pad.pos, pad.up, altKm);
    return sub(out, _tmp, bodyPositions(t, epoch).earth);
  }
  geodeticToEllipsoidMeshLocal(lat, lon, altKm, _tmp);
  return meshLocalToInertial(_tmp, t, out, epoch);
}

/**
 * Soft-land / catch point relative to Earth center at mission time t.
 * Chopsticks: above Starbase pad. Gulf: geodetic offshore site.
 */
function landRelAt(
  t: number,
  sched: RecoverySchedule,
  out: V3 = v3(),
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  return siteRelAt(t, sched.landLat, sched.landLon, sched.landAltKm, sched.profile === "chopsticks", out, epoch);
}

/** Surface co-rotating velocity at the land site (Earth-relative). */
function landSiteVelRel(
  t: number,
  sched: RecoverySchedule,
  out: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  siteRelAt(t, sched.landLat, sched.landLon, sched.landAltKm, sched.profile === "chopsticks", _tmp2, epoch);
  siteRelAt(t + 0.25, sched.landLat, sched.landLon, sched.landAltKm, sched.profile === "chopsticks", _tmp3, epoch);
  sub(out, _tmp3, _tmp2);
  return scale(out, out, 4);
}

/**
 * Apply aft + radial separation kicks in Earth-relative frame.
 * Writes pRel / vRel.
 */
export function applySepKicksRel(
  stage: StageState,
  outPRel: V3,
  outVRel: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): void {
  const b = bodyPositions(stage.t, epoch);
  sub(outPRel, stage.pos, b.earth);
  sub(outVRel, stage.vel, b.earthVel);

  // Aft kick along −v_rel
  normalize(_tmp, outVRel);
  madd(outVRel, outVRel, _tmp, -SEP_DV);

  // Radial out
  const r0 = len(outPRel) || 1;
  madd(outVRel, outVRel, outPRel, SEP_RADIAL / r0);
}

/** Blend unit directions with weight `blend` into `out`. */
function blendUnits(a: V3, b: V3, blend: number, out: V3): void {
  set(
    out,
    a.x * (1 - blend) + b.x * blend,
    a.y * (1 - blend) + b.y * blend,
    a.z * (1 - blend) + b.z * blend,
  );
  normalize(out, out);
}

function boosterWetKg(propKg: number): number {
  return BOOSTER_DRY_KG + Math.max(0, propKg);
}

function limitBoosterAccel(propKg: number, aCmd: number): { a: number; forceN: number } {
  const m = boosterWetKg(propKg);
  if (m < 1 || aCmd <= 0) return { a: 0, forceN: 0 };
  const forceN = Math.min(aCmd * m * 1000, BOOSTER_THRUST_N);
  return { a: forceN / m / 1000, forceN };
}

function drainBoosterProp(propKg: number, forceN: number, dt: number): number {
  if (forceN < 1e-3 || dt <= 0) return propKg;
  const dm = (forceN / (SPECIFIC_IMPULSE_BOOSTER * G0)) * dt;
  return Math.max(0, propKg - dm);
}

function siteInertialAt(
  t: number, sched: RecoverySchedule, altKm: number, out: V3, epoch: EphemerisEpoch,
): V3 {
  siteRelAt(t, sched.landLat, sched.landLon, altKm, sched.profile === "chopsticks", _tmp, epoch);
  const b = getBodies(t, epoch);
  return add(out, b.earth, _tmp);
}

function landInertialAt(t: number, sched: RecoverySchedule, out: V3, epoch: EphemerisEpoch): V3 {
  return siteInertialAt(t, sched, sched.landAltKm, out, epoch);
}

function gateInertialAt(t: number, sched: RecoverySchedule, out: V3, epoch: EphemerisEpoch): V3 {
  return siteInertialAt(t, sched, sched.gateAltKm, out, epoch);
}

function landVelInertialAt(t: number, sched: RecoverySchedule, out: V3, epoch: EphemerisEpoch): V3 {
  const b = getBodies(t, epoch);
  landSiteVelRel(t, sched, _tmp, epoch);
  return add(out, b.earthVel, _tmp);
}

function fillUpAt(pos: V3, t: number, epoch: EphemerisEpoch): number {
  const b = getBodies(t, epoch);
  sub(_pRel, pos, b.earth);
  const r = len(_pRel) || 1;
  set(_up, _pRel.x / r, _pRel.y / r, _pRel.z / r);
  earthNorthPole(_pole);
  return radialHeightAboveEllipsoid(_pRel, _pole);
}

/** v so that pos + v·dt + ½ g dt² ≈ target (constant-g estimate). */
function requiredVel(pos: V3, target: V3, dt: number, g: V3, out: V3): V3 {
  sub(out, target, pos);
  scale(out, out, 1 / Math.max(dt, 1e-3));
  madd(out, out, g, -0.5 * dt);
  return out;
}

function pointMassG(pos: V3, t: number, epoch: EphemerisEpoch, out: V3): V3 {
  const b = getBodies(t, epoch);
  sub(out, pos, b.earth);
  const r = len(out) || 1;
  return scale(out, out, -MU_EARTH / (r * r * r));
}

function writeThrustAlong(dir: V3, aMag: number): number {
  if (aMag < 1e-9 || len(dir) < 1e-12) {
    set(_thrustA, 0, 0, 0);
    return 0;
  }
  normalize(_aim, dir);
  scale(_thrustA, _aim, aMag);
  return aMag;
}

/**
 * Boostback: close the velocity-to-be-gained to the landing gate at
 * `landingStartS` so the coast arrives near the gate AGL at the public mark.
 */
function steerBoostback(
  state: CraftState, sched: RecoverySchedule, t0: number, propKg: number, epoch: EphemerisEpoch,
): number {
  const tGate = t0 + sched.landingStartS;
  const dtGate = tGate - state.t;
  if (dtGate < 0.5) return 0;
  gateInertialAt(tGate, sched, _siteP, epoch);
  pointMassG(state.pos, state.t, epoch, _acc);
  requiredVel(state.pos, _siteP, dtGate, _acc, _aim);
  sub(_aim, _aim, state.vel);
  const need = len(_aim);
  if (need < 0.015) return 0;
  const dtBoost = Math.max(0.5, t0 + sched.boostbackEndS - state.t);
  const lim = limitBoosterAccel(propKg, need / dtBoost);
  writeThrustAlong(_aim, lim.a);
  return lim.forceN;
}

/** Grid-fin theater: small lateral accel toward the gate during coast. */
function steerGridFin(
  state: CraftState, sched: RecoverySchedule, t0: number, epoch: EphemerisEpoch,
): void {
  const alt = fillUpAt(state.pos, state.t, epoch);
  if (alt > 90 || alt < sched.gateAltKm) {
    set(_thrustA, 0, 0, 0);
    return;
  }
  gateInertialAt(t0 + sched.landingStartS, sched, _siteP, epoch);
  sub(_aim, _siteP, state.pos);
  const rad = dot(_aim, _up);
  madd(_aim, _aim, _up, -rad);
  if (len(_aim) < 1) {
    set(_thrustA, 0, 0, 0);
    return;
  }
  writeThrustAlong(_aim, GRIDFIN_A);
}

/** Anti-velocity aim, with a light nibble toward the site when close. */
function landingAim(state: CraftState): void {
  set(_tmp2, -_vRel.x, -_vRel.y, -_vRel.z);
  if (len(_tmp2) < 1e-6) copy(_tmp2, _up);
  normalize(_tmp2, _tmp2);
  sub(_tmp3, _siteP, state.pos);
  const dist = len(_tmp3);
  if (dist > 1e-6 && dist < 40) {
    normalize(_tmp3, _tmp3);
    const w = Math.min(0.45, (40 - dist) / 90);
    blendUnits(_tmp2, _tmp3, w, _tmp2);
  }
}

/**
 * Landing burn. Chopsticks: hoverslam to a catch. Gulf: subset of engines
 * (Flight 13 recap — partial relight) so the booster still hits the water.
 */
function steerLanding(
  state: CraftState, sched: RecoverySchedule, t0: number, propKg: number, epoch: EphemerisEpoch,
): number {
  const alt = fillUpAt(state.pos, state.t, epoch);
  landInertialAt(state.t, sched, _siteP, epoch);
  landVelInertialAt(state.t, sched, _siteV, epoch);
  sub(_vRel, state.vel, _siteV);
  landingAim(state);
  if (sched.hardSplash) {
    // ~5 of 13 planned landing engines — not enough to hoverslam.
    const lim = limitBoosterAccel(propKg, 0.015);
    writeThrustAlong(_tmp2, lim.a);
    return lim.forceN;
  }
  const vRad = dot(_vRel, _up);
  const vDown = Math.max(0, -vRad);
  const h = Math.max(alt - sched.landAltKm, 0.04);
  const g = MU_EARTH / ((len(_pRel) || 1) ** 2);
  const aSuicide = (vDown * vDown) / (2 * h) + g;
  madd(_aim, _vRel, _up, -vRad);
  const dtLeft = Math.max(0.8, t0 + sched.landingEndS - state.t);
  const aHoriz = len(_aim) / dtLeft;
  const aCmd = Math.min(0.08, Math.max(aSuicide, aHoriz) + 0.004);
  const lim = limitBoosterAccel(propKg, aCmd);
  writeThrustAlong(_tmp2, lim.a);
  return lim.forceN;
}

function applySeatBlend(
  state: CraftState, age: number, sched: RecoverySchedule, epoch: EphemerisEpoch,
): void {
  if (age < sched.landingStartS) return;
  landInertialAt(state.t, sched, _siteP, epoch);
  landVelInertialAt(state.t, sched, _siteV, epoch);
  const dist = Math.hypot(
    state.pos.x - _siteP.x, state.pos.y - _siteP.y, state.pos.z - _siteP.z,
  );
  const late = smoothstep(sched.landingEndS - SEAT_LATE_S, sched.landingEndS, age);
  const near = 1 - clamp01(dist / RECOVERY_SEAT_BLEND_KM);
  const u = Math.max(late, near * near);
  if (u <= 1e-6) return;
  if (sched.hardSplash) {
    // Slide the ground track onto the gulf; keep altitude and fall speed.
    const alt = fillUpAt(state.pos, state.t, epoch);
    const b = getBodies(state.t, epoch);
    sub(_tmp, _siteP, b.earth);
    if (len(_tmp) > 1e-6) {
      normalize(_tmp, _tmp);
      blendUnits(_up, _tmp, u, _tmp2);
      const r = earthSurfaceRadiusAlong(_tmp2, earthNorthPole(_pole), Math.max(alt, sched.landAltKm));
      set(state.pos, b.earth.x + _tmp2.x * r, b.earth.y + _tmp2.y * r, b.earth.z + _tmp2.z * r);
    }
    return;
  }
  state.pos.x += (_siteP.x - state.pos.x) * u;
  state.pos.y += (_siteP.y - state.pos.y) * u;
  state.pos.z += (_siteP.z - state.pos.z) * u;
  state.vel.x += (_siteV.x - state.vel.x) * u;
  state.vel.y += (_siteV.y - state.vel.y) * u;
  state.vel.z += (_siteV.z - state.vel.z) * u;
}

function clampAboveLand(state: CraftState, sched: RecoverySchedule, epoch: EphemerisEpoch): void {
  const alt = altitudeEarth(state.t, state.pos, epoch);
  if (alt >= sched.landAltKm) return;
  fillUpAt(state.pos, state.t, epoch);
  const b = getBodies(state.t, epoch);
  const r = earthSurfaceRadiusAlong(_pRel, earthNorthPole(_pole), sched.landAltKm);
  set(
    state.pos,
    b.earth.x + _up.x * r,
    b.earth.y + _up.y * r,
    b.earth.z + _up.z * r,
  );
  const vr = dot(sub(_vRel, state.vel, b.earthVel), _up);
  if (vr < 0) madd(state.vel, state.vel, _up, -vr);
}

function pushRelSample(kfs: RelKeyframe[], state: CraftState, t0: number, epoch: EphemerisEpoch): void {
  const b = getBodies(state.t, epoch);
  kfs.push({
    age: state.t - t0,
    p: sub(v3(), state.pos, b.earth),
    v: sub(v3(), state.vel, b.earthVel),
  });
}

function sepCraft(stage: StageState, epoch: EphemerisEpoch): CraftState {
  applySepKicksRel(stage, _pRel, _vRel, epoch);
  const b = getBodies(stage.t, epoch);
  return {
    t: stage.t,
    pos: add(_statePos, b.earth, _pRel),
    vel: add(_stateVel, b.earthVel, _vRel),
  };
}

type RecoveryLoop = {
  state: CraftState;
  sched: RecoverySchedule;
  t0: number;
  epoch: EphemerisEpoch;
  propKg: number;
};

function recoveryThrust(loop: RecoveryLoop, age: number): number {
  set(_thrustA, 0, 0, 0);
  if (age >= loop.sched.boostbackStartS && age < loop.sched.boostbackEndS) {
    return steerBoostback(loop.state, loop.sched, loop.t0, loop.propKg, loop.epoch);
  }
  if (age >= loop.sched.landingStartS && age < loop.sched.landingEndS) {
    return steerLanding(loop.state, loop.sched, loop.t0, loop.propKg, loop.epoch);
  }
  if (age >= loop.sched.boostbackEndS && age < loop.sched.landingStartS) {
    steerGridFin(loop.state, loop.sched, loop.t0, loop.epoch);
  }
  return 0;
}

function stepRecovery(loop: RecoveryLoop, dt: number, forceN: number): void {
  const frozen = clone(_thrustA);
  rk4Step(
    loop.state,
    dt,
    () => (len(frozen) > 1e-12 ? frozen : null),
    { gravity: "earth", epoch: loop.epoch, dragCdAOverM: BOOSTER_CD_A_OVER_M },
  );
  loop.propKg = drainBoosterProp(loop.propKg, forceN, dt);
}

/**
 * Integrate Super Heavy recovery on the Earth μ + J₂ + drag force model.
 * Chopsticks: last few km (and the final {@link SEAT_LATE_S}) seat onto the
 * tower. Gulf: partial landing burn, then a hard ocean splash.
 */
export function bakeBoosterRecovery(
  stage: StageState,
  profile: RecoveryProfile = "chopsticks",
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): BoosterRecoveryBake {
  const sched = recoverySchedule(profile);
  const state = sepCraft(stage, epoch);
  // sepCraft aliases module scratch — snapshot so later site math is safe.
  const loop: RecoveryLoop = {
    state: { t: state.t, pos: clone(state.pos), vel: clone(state.vel) },
    sched,
    t0: stage.t,
    epoch,
    propKg: RECOVERY_PROP_KG,
  };
  const keyframes: RelKeyframe[] = [];
  pushRelSample(keyframes, loop.state, loop.t0, epoch);

  while (loop.state.t - loop.t0 < sched.landingEndS - 1e-9) {
    const age = loop.state.t - loop.t0;
    const dt = Math.min(RECOVERY_DT, sched.landingEndS - age);
    const forceN = recoveryThrust(loop, age);
    stepRecovery(loop, dt, forceN);
    applySeatBlend(loop.state, loop.state.t - loop.t0, sched, epoch);
    clampAboveLand(loop.state, sched, epoch);
    pushRelSample(keyframes, loop.state, loop.t0, epoch);
  }

  return {
    keyframes,
    startPropKg: RECOVERY_PROP_KG,
    leftoverPropKg: loop.propKg,
    burnedPropKg: RECOVERY_PROP_KG - loop.propKg,
  };
}

/**
 * Earth-relative force-model samples for the recovery arc.
 * Targets the moving land site; chopsticks seats, gulf hard-splashes.
 */
export function buildBoosterKeyframes(
  stage: StageState,
  profile: RecoveryProfile = "chopsticks",
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): RelKeyframe[] {
  return bakeBoosterRecovery(stage, profile, epoch).keyframes;
}

function phaseAt(
  age: number,
  sched: RecoverySchedule = CHOPSTICKS_SCHEDULE,
): BoosterRecoveryPhase {
  const vis = boosterVisibleS(sched);
  if (age < 0 || age > vis) return "done";
  if (age < sched.boostbackStartS) return age < 1.5 ? "sep" : "flip";
  if (age < sched.boostbackEndS) return "boostback";
  if (age < sched.landingStartS) return "coast";
  if (age < sched.landingEndS) return "landing";
  if (age <= sched.landingEndS + sched.holdS + sched.fadeS) return "caught";
  return "done";
}

function landingThrottle(age: number, sched: RecoverySchedule): number {
  const u = age - sched.landingStartS;
  const dur = sched.landingEndS - sched.landingStartS;
  const up = smoothstep(0, 1.5, u);
  const mid = 1 - 0.35 * smoothstep(dur * 0.45, dur * 0.85, u);
  const down = 1 - smoothstep(dur - 1.2, dur, u);
  // Flight 13 gulf: subset of the 13-engine landing burn.
  const peak = sched.hardSplash ? 0.28 : 0.72;
  return peak * up * mid * down;
}

function throttleAt(
  age: number,
  phase: BoosterRecoveryPhase,
  sched: RecoverySchedule = CHOPSTICKS_SCHEDULE,
): number {
  if (phase === "boostback") {
    const u = age - sched.boostbackStartS;
    const dur = sched.boostbackEndS - sched.boostbackStartS;
    return 0.55 * smoothstep(0, 2.2, u) * (1 - smoothstep(dur - 2.5, dur, u));
  }
  if (phase === "landing") return landingThrottle(age, sched);
  return 0;
}

function fadeAt(
  age: number,
  sched: RecoverySchedule = CHOPSTICKS_SCHEDULE,
): number {
  if (age < 0) return 0;
  if (age > boosterVisibleS(sched)) return 0;
  const fadeStart = sched.landingEndS + sched.holdS;
  if (age <= fadeStart) return 1;
  return 1 - smoothstep(fadeStart, fadeStart + sched.fadeS, age);
}

/** Pad catch point (inertial) at mission time t — chopsticks only. */
export function catchPointAt(t: number, out: V3 = v3(), epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): V3 {
  const pad = starbasePadState(t, epoch);
  return madd(out, pad.pos, pad.up, CATCH_ALT_KM);
}

/** Gulf splash point (heliocentric inertial) at mission time t. */
export function gulfLandPointAt(t: number, out: V3 = v3(), epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): V3 {
  const b = bodyPositions(t, epoch);
  landRelAt(t, GULF_SCHEDULE, _tmp3, epoch);
  return add(out, b.earth, _tmp3);
}

/** Done / pre-stage sentinel sample. */
function doneSample(): BoosterRecoverySample {
  set(_pos, 0, 0, 0); set(_vel, 0, 0, 0); set(_nose, 0, 0, 1);
  return { phase: "done", pos: _pos, vel: _vel, nose: _nose, burning: false, throttle: 0, fade: 0 };
}

/** Hermite segment index for clamped age. */
function keyframeSegmentIndex(kfs: RelKeyframe[], ageClamped: number): number {
  let i = 0;
  while (i < kfs.length - 2 && ageClamped > kfs[i + 1]!.age) i++;
  return i;
}

function clampAboveEarth(): void {
  const r = len(_pRel);
  earthNorthPole(_pole);
  const minR = earthSurfaceRadiusAlong(_pRel, _pole, EARTH_SURFACE_ALT_KM);
  if (r < minR && r > 1e-6) scale(_pRel, _pRel, minR / r);
}

function stickToLandSite(stage: StageState, age: number, sched: RecoverySchedule, epoch: EphemerisEpoch): void {
  const t = stage.t + age;
  landRelAt(t, sched, _pRel, epoch);
  landSiteVelRel(t, sched, _vRel, epoch);
}

/** Fill Earth-relative p/v from keyframes (or stick to land site after hold). */
function sampleRelPath(
  stage: StageState,
  age: number,
  kfs: RelKeyframe[],
  sched: RecoverySchedule,
  epoch: EphemerisEpoch,
): void {
  const lastAge = kfs[kfs.length - 1]!.age;
  const ageClamped = Math.min(Math.max(age, 0), lastAge);
  const i = keyframeSegmentIndex(kfs, ageClamped);
  hermite(ageClamped, kfs[i]!.age, kfs[i + 1]!.age, kfs[i]!.p, kfs[i]!.v, kfs[i + 1]!.p, kfs[i + 1]!.v, _pRel, _vRel);
  if (age > lastAge) stickToLandSite(stage, age, sched, epoch);
  clampAboveEarth();
}

function noseFlipAlongVel(flipU: number): void {
  normalize(_tmp, _vRel);
  set(_nose, -_tmp.x, -_tmp.y, -_tmp.z);
  blendUnits(_tmp, _nose, flipU, _nose);
}

function noseSettleUp(age: number, phase: BoosterRecoveryPhase, sched: RecoverySchedule): void {
  if (sched.hardSplash) return;
  if (!(phase === "caught" || age >= sched.landingEndS - 2)) return;
  normalize(_tmp, _pRel);
  const settle = smoothstep(sched.landingEndS - 4, sched.landingEndS + 1, age);
  blendUnits(_nose, _tmp, settle, _nose);
}

/** Attitude: flip then engines-first; settle nose-up at catch. */
function sampleNose(
  age: number,
  phase: BoosterRecoveryPhase,
  sched: RecoverySchedule,
): void {
  if (len(_vRel) > 0.02) noseFlipAlongVel(smoothstep(0.5, sched.flipS, age));
  else normalize(_nose, _pRel);
  noseSettleUp(age, phase, sched);
}

function liveBoosterSample(
  phase: BoosterRecoveryPhase, throttle: number, fade: number,
): BoosterRecoverySample {
  return { phase, pos: _pos, vel: _vel, nose: _nose, burning: throttle > 0.02, throttle, fade };
}

/**
 * Sample the booster recovery path at `age = missionT − stage.t`.
 * Vector fields alias internal scratch — copy if you need to retain them.
 */
export function sampleBoosterRecovery(
  stage: StageState,
  age: number,
  keyframes?: RelKeyframe[],
  profile: RecoveryProfile = "chopsticks",
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): BoosterRecoverySample {
  const sched = recoverySchedule(profile); const phase = phaseAt(age, sched);
  if (phase === "done" || age < 0) return doneSample();
  sampleRelPath(stage, age, keyframes ?? buildBoosterKeyframes(stage, profile, epoch), sched, epoch);
  const bt = bodyPositions(stage.t + age, epoch);
  add(_pos, bt.earth, _pRel);
  add(_vel, bt.earthVel, _vRel);
  sampleNose(age, phase, sched);
  return liveBoosterSample(phase, throttleAt(age, phase, sched), fadeAt(age, sched));
}

/** Classify phase for tests / HUD without sampling. */
export function boosterPhaseAt(
  age: number,
  profile: RecoveryProfile = "chopsticks",
): BoosterRecoveryPhase {
  return phaseAt(age, recoverySchedule(profile));
}

/**
 * Dim free-flyer locator strength in [0, 1] after stage-out.
 * Non-zero only for {@link BOOSTER_LOCATOR_S} mission seconds; fades in/out.
 */
export function boosterLocatorStrength(age: number): number {
  if (age < 0 || age > BOOSTER_LOCATOR_S) return 0;
  let s = age < BOOSTER_LOCATOR_FADE_IN_S ? clamp01(age / BOOSTER_LOCATOR_FADE_IN_S) : 1;
  const fadeStart = BOOSTER_LOCATOR_S - BOOSTER_LOCATOR_FADE_S;
  if (age > fadeStart) s *= clamp01((BOOSTER_LOCATOR_S - age) / BOOSTER_LOCATOR_FADE_S);
  return s;
}

/**
 * Theater boostback ignition flash strength in [0, 1].
 * Peaks shortly after boostback start, then decays over {@link BOOSTBACK_FLASH_S}.
 */
export function boostbackFlashStrength(age: number): number {
  const u = age - BOOSTBACK_START_S;
  if (u < 0 || u > BOOSTBACK_FLASH_S) return 0;
  // Fast rise (~0.25 s), quadratic falloff for a soft flash
  const rise = clamp01(u / 0.25);
  const fall = 1 - u / BOOSTBACK_FLASH_S;
  return rise * fall * fall;
}

/**
 * Theater landing / catch contact flash in [0, 1].
 * Lights ~0.4 s before `landingEndS` and decays over {@link LANDING_CONTACT_FLASH_S}.
 *
 * @param age - Seconds after stage-out
 * @param sched - Recovery schedule (chopsticks or gulf)
 */
export function landingContactFlashStrength(
  age: number,
  sched: RecoverySchedule = CHOPSTICKS_SCHEDULE,
): number {
  const u = age - sched.landingEndS;
  if (u < -0.4 || u > LANDING_CONTACT_FLASH_S) return 0;
  const t = u + 0.4;
  const rise = clamp01(t / 0.2);
  const fall = 1 - Math.max(0, u) / LANDING_CONTACT_FLASH_S;
  return rise * fall * fall;
}

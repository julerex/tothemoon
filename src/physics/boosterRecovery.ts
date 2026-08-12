/**
 * Theater Super Heavy recovery after stage-out.
 *
 * Kinematic (not N-body authoritative): flip → boostback burn → coast/entry →
 * landing burn → soft land. Two profiles:
 * - **chopsticks** — return to launch site / tower catch at Starbase
 * - **gulf** — Flight 13 offshore soft landing in the Gulf of America
 *
 * Times relative to stage epoch follow Flight 5–7 / Flight 13 cadence
 * (~4–5 min from stage-out to landing burn).
 *
 * All path math is **Earth-relative** (heliocentric body motion is added back
 * at sample time) so multi-minute coasts stay near the planet.
 *
 * Scene unit = km. Pure + scrub-deterministic from (stage event, age).
 */

import { EARTH_SURFACE_RADIUS_KM, MU_EARTH, R_EARTH } from "./constants";
import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import {
  geodeticToMeshLocal,
  meshLocalToInertial,
  starbasePadState,
} from "./earthFrame";
import {
  add,
  copy,
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
 * Gulf of America soft-landing zone (theater).
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
  landingStartS: 246, // T+6:27
  landingEndS: 272, // T+6:53
  holdS: 45,
  fadeS: 22,
  landAltKm: 0.03,
  gateAltKm: 2.6,
  coastLoftKm: 14,
  landLat: GULF_LAND_LAT,
  landLon: GULF_LAND_LON,
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
  gateAltKm: 2.8,
  coastLoftKm: 12,
  // Filled from Starbase pad each sample (lat/lon unused when chopsticks)
  landLat: 0,
  landLon: 0,
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

/** Earth-relative keyframe (offsets from Earth center / Earth velocity). */
type RelKeyframe = {
  age: number;
  /** Position relative to Earth center (km). */
  p: V3;
  /** Velocity relative to Earth center velocity (km/s). */
  v: V3;
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

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

/** Earth-relative gravity g = −μ r̂ / r². */
function gravityRel(pRel: V3, out: V3): V3 {
  const r = len(pRel) || 1;
  const g = MU_EARTH / (r * r);
  return scale(out, pRel, -g / r);
}

/** p' = p + v Δt + ½ a Δt², v' = v + a Δt. */
function ballisticStep(
  p: V3,
  v: V3,
  a: V3,
  dt: number,
  outP: V3,
  outV: V3,
): void {
  madd(outP, p, v, dt);
  madd(outP, outP, a, 0.5 * dt * dt);
  madd(outV, v, a, dt);
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
  geodeticToMeshLocal(lat, lon, R_EARTH + altKm, _tmp);
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

/** Landing-gate point (high above land site) relative to Earth. */
function gateRelAt(
  t: number,
  sched: RecoverySchedule,
  out: V3 = v3(),
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  return siteRelAt(t, sched.landLat, sched.landLon, sched.gateAltKm, sched.profile === "chopsticks", out, epoch);
}

/** Surface co-rotating velocity at the land site (Earth-relative). */
function landSiteVelRel(
  t: number,
  sched: RecoverySchedule,
  out: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  if (sched.profile === "chopsticks") {
    const pad = starbasePadState(t, epoch);
    const b = bodyPositions(t, epoch);
    return sub(out, pad.vel, b.earthVel);
  }
  // Approximate ocean site as co-rotating with Earth: use pad spin rate scaled
  // via mesh-local position difference from Earth center after spin.
  const pad = starbasePadState(t, epoch);
  const b = bodyPositions(t, epoch);
  // Use pad's Earth-relative surface velocity magnitude pattern: ω×r ≈ pad.vel−earthVel
  // scaled by land site radius ratio (same order).
  sub(out, pad.vel, b.earthVel);
  return out;
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

/**
 * Build Earth-relative Hermite keyframes for the recovery arc.
 * Targets the moving land site so Earth rotation is honored.
 */
/** Clamp velocity magnitude in place. */
function clampVelMag(v: V3, maxMag: number): void {
  const mag = len(v);
  if (mag > maxMag) scale(v, v, maxMag / mag);
}

/** Coast velocity from p0 → p1 under constant gravity accel. */
function coastVelBetween(
  p0: V3,
  p1: V3,
  dt: number,
  out: V3,
): void {
  gravityRel(p0, _acc);
  sub(out, p1, p0);
  madd(out, out, _acc, -0.5 * dt * dt);
  scale(out, out, 1 / Math.max(dt, 1e-6));
}

/** Blend unit directions with weight `blend` into `_tmp`. */
function blendUnits(a: V3, b: V3, blend: number, out: V3): void {
  set(
    out,
    a.x * (1 - blend) + b.x * blend,
    a.y * (1 - blend) + b.y * blend,
    a.z * (1 - blend) + b.z * blend,
  );
  normalize(out, out);
}

/** Blend ballistic direction toward gate for post-boostback aim. */
function blendTowardGate(pBall: V3, pGate: V3, blend: number, out: V3): void {
  const rBall = len(pBall) || 1;
  normalize(_tmp2, pBall);
  normalize(_tmp3, pGate);
  blendUnits(_tmp2, _tmp3, blend, _tmp);
  scale(out, _tmp, rBall);
}

/** Mid-coast lofted keyframe between boostback end and landing gate. */
function midCoastKeyframe(
  pBB1: V3, vBB1: V3, pGate: V3, sched: RecoverySchedule,
): { ageMid: number; pMid: V3; vMid: V3 } {
  const coastDt = sched.landingStartS - sched.boostbackEndS; const ageMid = sched.boostbackEndS + coastDt * 0.4;
  const pMid = v3(); const vMid = v3();
  gravityRel(pBB1, _acc);
  ballisticStep(pBB1, vBB1, _acc, ageMid - sched.boostbackEndS, pMid, vMid);
  scale(pMid, normalize(_tmp, pMid), (len(pMid) || 1) + sched.coastLoftKm);
  coastVelBetween(pMid, pGate, sched.landingStartS - ageMid, vMid);
  clampVelMag(vMid, 2.2);
  return { ageMid, pMid, vMid };
}

function softGateHoriz(out: V3, radial: V3): void {
  const vRad = out.x * radial.x + out.y * radial.y + out.z * radial.z;
  set(_tmp2, out.x - radial.x * vRad, out.y - radial.y * vRad, out.z - radial.z * vRad);
  set(out, radial.x * vRad + _tmp2.x * 0.4, radial.y * vRad + _tmp2.y * 0.4, radial.z * vRad + _tmp2.z * 0.4);
}

/** Gate velocity into soft land (mostly radial, capped). */
function gateVelToCatch(pGate: V3, pCatch: V3, landDt: number, out: V3): void {
  normalize(_tmp, pGate);
  gravityRel(pGate, _acc);
  sub(out, pCatch, pGate);
  madd(out, out, _acc, -0.5 * landDt * landDt);
  scale(out, out, 1 / Math.max(landDt, 1e-6));
  softGateHoriz(out, _tmp);
  clampVelMag(out, 0.2);
}

/**
 * Build Earth-relative Hermite keyframes for the recovery arc.
 * Targets the moving land site so Earth rotation is honored.
 */
function boostbackKeyframes(
  p0: V3, v0: V3, pGate: V3, sched: RecoverySchedule,
): { pBB0: V3; vBB0: V3; pBB1: V3; vBB1: V3 } {
  gravityRel(p0, _acc); const pBB0 = v3(); const vBB0 = v3(); const pBall = v3(); const vBall = v3();
  const pBB1 = v3(); const vBB1 = v3();
  ballisticStep(p0, v0, _acc, sched.boostbackStartS, pBB0, vBB0);
  ballisticStep(p0, v0, _acc, sched.boostbackEndS, pBall, vBall);
  blendTowardGate(pBall, pGate, sched.profile === "gulf" ? 0.38 : 0.55, pBB1);
  coastVelBetween(pBB1, pGate, sched.landingStartS - sched.boostbackEndS, vBB1);
  clampVelMag(vBB1, sched.profile === "gulf" ? 2.6 : 2.4);
  return { pBB0, vBB0, pBB1, vBB1 };
}

function landingHoldKeyframes(
  t0: number, pGate: V3, pCatch: V3, sched: RecoverySchedule, epoch: EphemerisEpoch,
): { vGate: V3; vCatch: V3; pHold: V3; vHold: V3 } {
  const vGate = v3(); gateVelToCatch(pGate, pCatch, sched.landingEndS - sched.landingStartS, vGate);
  const vCatch = v3();
  landSiteVelRel(t0 + sched.landingEndS, sched, vCatch, epoch);
  const tHold = t0 + sched.landingEndS + sched.holdS;
  const pHold = landRelAt(tHold, sched, undefined, epoch);
  const vHold = v3();
  landSiteVelRel(tHold, sched, vHold, epoch);
  return { vGate, vCatch, pHold, vHold };
}

function packBoosterKeyframes(
  sched: RecoverySchedule,
  p0: V3, v0: V3,
  bb: ReturnType<typeof boostbackKeyframes>,
  mid: ReturnType<typeof midCoastKeyframe>,
  pGate: V3, pCatch: V3,
  land: ReturnType<typeof landingHoldKeyframes>,
): RelKeyframe[] {
  return [
    { age: 0, p: p0, v: v0 }, { age: sched.boostbackStartS, p: bb.pBB0, v: bb.vBB0 },
    { age: sched.boostbackEndS, p: bb.pBB1, v: bb.vBB1 }, { age: mid.ageMid, p: mid.pMid, v: mid.vMid },
    { age: sched.landingStartS, p: pGate, v: land.vGate }, { age: sched.landingEndS, p: pCatch, v: land.vCatch },
    { age: sched.landingEndS + sched.holdS, p: land.pHold, v: land.vHold },
  ];
}

export function buildBoosterKeyframes(
  stage: StageState,
  profile: RecoveryProfile = "chopsticks",
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): RelKeyframe[] {
  const sched = recoverySchedule(profile); const p0 = v3(); const v0 = v3();
  applySepKicksRel(stage, p0, v0, epoch);
  const pGate = gateRelAt(stage.t + sched.landingStartS, sched, undefined, epoch);
  const pCatch = landRelAt(stage.t + sched.landingEndS, sched, undefined, epoch);
  const bb = boostbackKeyframes(p0, v0, pGate, sched);
  const mid = midCoastKeyframe(bb.pBB1, bb.vBB1, pGate, sched);
  const land = landingHoldKeyframes(stage.t, pGate, pCatch, sched, epoch);
  return packBoosterKeyframes(sched, p0, v0, bb, mid, pGate, pCatch, land);
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
  return 0.72 * up * mid * down;
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

/** Gulf soft-land point (heliocentric inertial) at mission time t. */
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
  const minR = EARTH_SURFACE_RADIUS_KM;
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

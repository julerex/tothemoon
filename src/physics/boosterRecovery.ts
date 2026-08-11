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

import { MU_EARTH, R_EARTH } from "./constants";
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
  if (dt <= 1e-12) {
    copy(outP, p1);
    copy(outV, v1);
    return;
  }
  const u = clamp01((age - a0) / dt);
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  scale(outP, p0, h00);
  madd(outP, outP, v0, h10 * dt);
  madd(outP, outP, p1, h01);
  madd(outP, outP, v1, h11 * dt);

  const d00 = 6 * u2 - 6 * u;
  const d10 = 3 * u2 - 4 * u + 1;
  const d01 = -6 * u2 + 6 * u;
  const d11 = 3 * u2 - 2 * u;
  scale(outV, p0, d00);
  madd(outV, outV, v0, d10 * dt);
  madd(outV, outV, p1, d01);
  madd(outV, outV, v1, d11 * dt);
  scale(outV, outV, 1 / dt);
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
  const b = bodyPositions(t, epoch);
  if (sched.profile === "chopsticks") {
    const pad = starbasePadState(t, epoch);
    madd(_tmp, pad.pos, pad.up, sched.landAltKm);
    return sub(out, _tmp, b.earth);
  }
  // meshLocal → Earth-centered inertial (already relative to Earth origin)
  geodeticToMeshLocal(
    sched.landLat,
    sched.landLon,
    R_EARTH + sched.landAltKm,
    _tmp,
  );
  return meshLocalToInertial(_tmp, t, out, epoch);
}

/** Landing-gate point (high above land site) relative to Earth. */
function gateRelAt(
  t: number,
  sched: RecoverySchedule,
  out: V3 = v3(),
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  const b = bodyPositions(t, epoch);
  if (sched.profile === "chopsticks") {
    const pad = starbasePadState(t, epoch);
    madd(_tmp, pad.pos, pad.up, sched.gateAltKm);
    return sub(out, _tmp, b.earth);
  }
  geodeticToMeshLocal(
    sched.landLat,
    sched.landLon,
    R_EARTH + sched.gateAltKm,
    _tmp,
  );
  return meshLocalToInertial(_tmp, t, out, epoch);
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
export function buildBoosterKeyframes(
  stage: StageState,
  profile: RecoveryProfile = "chopsticks",
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): RelKeyframe[] {
  const sched = recoverySchedule(profile);
  const t0 = stage.t;
  const p0 = v3();
  const v0 = v3();
  applySepKicksRel(stage, p0, v0, epoch);

  gravityRel(p0, _acc);

  // Short ballistic to boostback start
  const pBB0 = v3();
  const vBB0 = v3();
  ballisticStep(p0, v0, _acc, sched.boostbackStartS, pBB0, vBB0);

  // Pure-ballistic reference at boostback end
  const pBall = v3();
  const vBall = v3();
  ballisticStep(p0, v0, _acc, sched.boostbackEndS, pBall, vBall);

  const tLand = t0 + sched.landingStartS;
  const tCatch = t0 + sched.landingEndS;
  const pGate = gateRelAt(tLand, sched, undefined, epoch);
  const pCatch = landRelAt(tCatch, sched, undefined, epoch);

  // Post-boostback: pull ground-track toward landing site while keeping altitude.
  // Gulf: weaker pull-back than RTLS so the booster stays downrange offshore.
  const rBall = len(pBall) || 1;
  normalize(_tmp2, pBall);
  normalize(_tmp3, pGate);
  const blend = sched.profile === "gulf" ? 0.38 : 0.55;
  set(
    _tmp,
    _tmp2.x * (1 - blend) + _tmp3.x * blend,
    _tmp2.y * (1 - blend) + _tmp3.y * blend,
    _tmp2.z * (1 - blend) + _tmp3.z * blend,
  );
  normalize(_tmp, _tmp);
  const pBB1 = v3();
  scale(pBB1, _tmp, rBall);

  // Velocity after boostback: coast under gravity to the landing gate
  const coastDt = sched.landingStartS - sched.boostbackEndS;
  gravityRel(pBB1, _acc);
  const vBB1 = v3();
  sub(vBB1, pGate, pBB1);
  madd(vBB1, vBB1, _acc, -0.5 * coastDt * coastDt);
  scale(vBB1, vBB1, 1 / Math.max(coastDt, 1e-6));

  const vBB1Mag = len(vBB1);
  const V_BB_MAX = sched.profile === "gulf" ? 2.6 : 2.4;
  if (vBB1Mag > V_BB_MAX) scale(vBB1, vBB1, V_BB_MAX / vBB1Mag);

  const ageMid = sched.boostbackEndS + coastDt * 0.4;
  const pMid = v3();
  const vMid = v3();
  gravityRel(pBB1, _acc);
  ballisticStep(pBB1, vBB1, _acc, ageMid - sched.boostbackEndS, pMid, vMid);
  const rMid = len(pMid) || 1;
  normalize(_tmp, pMid);
  scale(pMid, _tmp, rMid + sched.coastLoftKm);
  const dt2 = sched.landingStartS - ageMid;
  gravityRel(pMid, _acc);
  sub(vMid, pGate, pMid);
  madd(vMid, vMid, _acc, -0.5 * dt2 * dt2);
  scale(vMid, vMid, 1 / Math.max(dt2, 1e-6));
  const vMidMag = len(vMid);
  if (vMidMag > 2.2) scale(vMid, vMid, 2.2 / vMidMag);

  normalize(_tmp, pGate);
  const landDt = sched.landingEndS - sched.landingStartS;
  gravityRel(pGate, _acc);
  const vGate = v3();
  sub(vGate, pCatch, pGate);
  madd(vGate, vGate, _acc, -0.5 * landDt * landDt);
  scale(vGate, vGate, 1 / Math.max(landDt, 1e-6));
  const vRad = vGate.x * _tmp.x + vGate.y * _tmp.y + vGate.z * _tmp.z;
  set(
    _tmp2,
    vGate.x - _tmp.x * vRad,
    vGate.y - _tmp.y * vRad,
    vGate.z - _tmp.z * vRad,
  );
  set(
    vGate,
    _tmp.x * vRad + _tmp2.x * 0.4,
    _tmp.y * vRad + _tmp2.y * 0.4,
    _tmp.z * vRad + _tmp2.z * 0.4,
  );
  const vGateMag = len(vGate);
  if (vGateMag > 0.2) scale(vGate, vGate, 0.2 / vGateMag);

  const vCatch = v3();
  landSiteVelRel(tCatch, sched, vCatch, epoch);

  const tHold = t0 + sched.landingEndS + sched.holdS;
  const pHold = landRelAt(tHold, sched, undefined, epoch);
  const vHold = v3();
  landSiteVelRel(tHold, sched, vHold, epoch);

  return [
    { age: 0, p: p0, v: v0 },
    { age: sched.boostbackStartS, p: pBB0, v: vBB0 },
    { age: sched.boostbackEndS, p: pBB1, v: vBB1 },
    { age: ageMid, p: pMid, v: vMid },
    { age: sched.landingStartS, p: pGate, v: vGate },
    { age: sched.landingEndS, p: pCatch, v: vCatch },
    { age: sched.landingEndS + sched.holdS, p: pHold, v: vHold },
  ];
}

function phaseAt(
  age: number,
  sched: RecoverySchedule = CHOPSTICKS_SCHEDULE,
): BoosterRecoveryPhase {
  const vis = boosterVisibleS(sched);
  if (age < 0) return "done";
  if (age > vis) return "done";
  if (age < sched.boostbackStartS) return age < 1.5 ? "sep" : "flip";
  if (age < sched.boostbackEndS) return "boostback";
  if (age < sched.landingStartS) return "coast";
  if (age < sched.landingEndS) return "landing";
  if (age <= sched.landingEndS + sched.holdS + sched.fadeS) return "caught";
  return "done";
}

function throttleAt(
  age: number,
  phase: BoosterRecoveryPhase,
  sched: RecoverySchedule = CHOPSTICKS_SCHEDULE,
): number {
  if (phase === "boostback") {
    const u = age - sched.boostbackStartS;
    const dur = sched.boostbackEndS - sched.boostbackStartS;
    const up = smoothstep(0, 2.2, u);
    const down = 1 - smoothstep(dur - 2.5, dur, u);
    return 0.55 * up * down;
  }
  if (phase === "landing") {
    const u = age - sched.landingStartS;
    const dur = sched.landingEndS - sched.landingStartS;
    const up = smoothstep(0, 1.5, u);
    const mid = 1 - 0.35 * smoothstep(dur * 0.45, dur * 0.85, u);
    const down = 1 - smoothstep(dur - 1.2, dur, u);
    return 0.72 * up * mid * down;
  }
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
  const sched = recoverySchedule(profile);
  const phase = phaseAt(age, sched);
  if (phase === "done" || age < 0) {
    set(_pos, 0, 0, 0);
    set(_vel, 0, 0, 0);
    set(_nose, 0, 0, 1);
    return {
      phase: "done",
      pos: _pos,
      vel: _vel,
      nose: _nose,
      burning: false,
      throttle: 0,
      fade: 0,
    };
  }

  const kfs = keyframes ?? buildBoosterKeyframes(stage, profile, epoch);
  const lastAge = kfs[kfs.length - 1]!.age;
  const ageClamped = Math.min(Math.max(age, 0), lastAge);

  let i = 0;
  while (i < kfs.length - 2 && ageClamped > kfs[i + 1]!.age) i++;
  const a = kfs[i]!;
  const b = kfs[i + 1]!;
  hermite(ageClamped, a.age, b.age, a.p, a.v, b.p, b.v, _pRel, _vRel);

  // After hold keyframe (fade window): stick to moving land site
  if (age > lastAge) {
    const t = stage.t + age;
    landRelAt(t, sched, _pRel, epoch);
    landSiteVelRel(t, sched, _vRel, epoch);
  }

  // Surface clamp in relative frame
  const r = len(_pRel);
  const minR = R_EARTH + 0.05;
  if (r < minR && r > 1e-6) {
    scale(_pRel, _pRel, minR / r);
  }

  // Lift back to heliocentric / inertial
  const t = stage.t + age;
  const bt = bodyPositions(t, epoch);
  add(_pos, bt.earth, _pRel);
  add(_vel, bt.earthVel, _vRel);

  // Attitude: ascent nose-along-v_rel → flip → engines-first (nose anti-v_rel)
  const flipU = smoothstep(0.5, sched.flipS, age);
  const speed = len(_vRel);
  if (speed > 0.02) {
    normalize(_tmp, _vRel);
    set(_nose, -_tmp.x, -_tmp.y, -_tmp.z);
    set(
      _nose,
      _tmp.x * (1 - flipU) + _nose.x * flipU,
      _tmp.y * (1 - flipU) + _nose.y * flipU,
      _tmp.z * (1 - flipU) + _nose.z * flipU,
    );
    normalize(_nose, _nose);
  } else {
    normalize(_nose, _pRel); // radial out
  }

  // Settle nose-up at soft land / catch
  if (phase === "caught" || age >= sched.landingEndS - 2) {
    normalize(_tmp, _pRel);
    const settle = smoothstep(sched.landingEndS - 4, sched.landingEndS + 1, age);
    set(
      _nose,
      _nose.x * (1 - settle) + _tmp.x * settle,
      _nose.y * (1 - settle) + _tmp.y * settle,
      _nose.z * (1 - settle) + _tmp.z * settle,
    );
    normalize(_nose, _nose);
  }

  const throttle = throttleAt(age, phase, sched);
  return {
    phase,
    pos: _pos,
    vel: _vel,
    nose: _nose,
    burning: throttle > 0.02,
    throttle,
    fade: fadeAt(age, sched),
  };
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
  let s = 1;
  if (age < BOOSTER_LOCATOR_FADE_IN_S) {
    s = clamp01(age / BOOSTER_LOCATOR_FADE_IN_S);
  }
  const fadeStart = BOOSTER_LOCATOR_S - BOOSTER_LOCATOR_FADE_S;
  if (age > fadeStart) {
    s *= clamp01((BOOSTER_LOCATOR_S - age) / BOOSTER_LOCATOR_FADE_S);
  }
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

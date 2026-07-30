/**
 * Theater Super Heavy recovery after stage-out.
 *
 * Kinematic (not N-body authoritative): flip → boostback burn → coast/entry →
 * landing burn → tower catch at Starbase. Times relative to stage epoch follow
 * Flight 5–7 / Flight 13 RTLS cadence (~4–5 min pad return).
 *
 * All path math is **Earth-relative** ( heliocentric body motion is added back
 * at sample time) so multi-minute coasts stay near the planet.
 *
 * Scene unit = km. Pure + scrub-deterministic from (stage event, age).
 */

import { MU_EARTH, R_EARTH } from "./constants";
import { bodyPositions } from "./bodies";
import { starbasePadState } from "./earthFrame";
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

/** Flip complete (s after stage). */
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

/** Total visible recovery window (s after stage). */
export const BOOSTER_VISIBLE_S =
  LANDING_END_S + CATCH_HOLD_S + CATCH_FADE_S;

/** Chopsticks catch height above pad (km) — mid-upper booster ~80 m. */
export const CATCH_ALT_KM = 0.08;
/** Landing-burn start altitude AGL (km). */
const LANDING_GATE_ALT_KM = 2.8;
/** Extra loft on mid-coast (km) for a readable arc. */
const COAST_LOFT_KM = 12;

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

/** Pad catch point relative to Earth center at mission time t. */
function catchRelAt(t: number, out: V3 = v3()): V3 {
  const pad = starbasePadState(t);
  const b = bodyPositions(t);
  madd(_tmp, pad.pos, pad.up, CATCH_ALT_KM);
  return sub(out, _tmp, b.earth);
}

/** Landing-gate point (high above pad) relative to Earth. */
function gateRelAt(t: number, out: V3 = v3()): V3 {
  const pad = starbasePadState(t);
  const b = bodyPositions(t);
  madd(_tmp, pad.pos, pad.up, LANDING_GATE_ALT_KM);
  return sub(out, _tmp, b.earth);
}

/**
 * Apply aft + radial separation kicks in Earth-relative frame.
 * Writes pRel / vRel.
 */
export function applySepKicksRel(
  stage: StageState,
  outPRel: V3,
  outVRel: V3,
): void {
  const b = bodyPositions(stage.t);
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
 * Targets the moving Starbase pad so Earth rotation is honored.
 */
export function buildBoosterKeyframes(stage: StageState): RelKeyframe[] {
  const t0 = stage.t;
  const p0 = v3();
  const v0 = v3();
  applySepKicksRel(stage, p0, v0);

  gravityRel(p0, _acc);

  // Short ballistic to boostback start
  const pBB0 = v3();
  const vBB0 = v3();
  ballisticStep(p0, v0, _acc, BOOSTBACK_START_S, pBB0, vBB0);

  // Pure-ballistic reference at boostback end
  const pBall = v3();
  const vBall = v3();
  ballisticStep(p0, v0, _acc, BOOSTBACK_END_S, pBall, vBall);

  const tLand = t0 + LANDING_START_S;
  const tCatch = t0 + LANDING_END_S;
  const pGate = gateRelAt(tLand);
  const pCatch = catchRelAt(tCatch);

  // Post-boostback: kill most downrange progress vs pure ballistic.
  // Blend ground-track toward pad while keeping ballistic altitude.
  const rBall = len(pBall) || 1;
  normalize(_tmp2, pBall);
  normalize(_tmp3, pGate);
  // Stronger pull-back than a pure residual — RTLS theater wants a clear return
  const blend = 0.55;
  set(
    _tmp,
    _tmp2.x * (1 - blend) + _tmp3.x * blend,
    _tmp2.y * (1 - blend) + _tmp3.y * blend,
    _tmp2.z * (1 - blend) + _tmp3.z * blend,
  );
  normalize(_tmp, _tmp);
  const pBB1 = v3();
  // Keep altitude near ballistic (boostback is mostly horizontal Δv)
  scale(pBB1, _tmp, rBall);

  // Velocity after boostback: coast under gravity to the landing gate
  const coastDt = LANDING_START_S - BOOSTBACK_END_S;
  gravityRel(pBB1, _acc);
  const vBB1 = v3();
  sub(vBB1, pGate, pBB1);
  madd(vBB1, vBB1, _acc, -0.5 * coastDt * coastDt);
  scale(vBB1, vBB1, 1 / Math.max(coastDt, 1e-6));

  // Cap post-boostback speed — real SH is a few km/s, not orbital
  const vBB1Mag = len(vBB1);
  const V_BB_MAX = 2.4; // km/s Earth-relative
  if (vBB1Mag > V_BB_MAX) scale(vBB1, vBB1, V_BB_MAX / vBB1Mag);

  // Mid-coast loft for a readable arc (re-solve not required — Hermite softens)
  const ageMid = BOOSTBACK_END_S + coastDt * 0.4;
  const pMid = v3();
  const vMid = v3();
  gravityRel(pBB1, _acc);
  ballisticStep(pBB1, vBB1, _acc, ageMid - BOOSTBACK_END_S, pMid, vMid);
  // Lift mid altitude
  const rMid = len(pMid) || 1;
  normalize(_tmp, pMid);
  scale(pMid, _tmp, rMid + COAST_LOFT_KM);
  // Aim mid velocity toward gate for a smooth second half
  const dt2 = LANDING_START_S - ageMid;
  gravityRel(pMid, _acc);
  sub(vMid, pGate, pMid);
  madd(vMid, vMid, _acc, -0.5 * dt2 * dt2);
  scale(vMid, vMid, 1 / Math.max(dt2, 1e-6));
  const vMidMag = len(vMid);
  if (vMidMag > 2.2) scale(vMid, vMid, 2.2 / vMidMag);

  // Landing-gate velocity: mostly radial-down, modest tangential
  // Pad up in Earth-relative frame ≈ normalize(pGate) for near-surface
  normalize(_tmp, pGate); // outward
  const landDt = LANDING_END_S - LANDING_START_S;
  gravityRel(pGate, _acc);
  const vGate = v3();
  sub(vGate, pCatch, pGate);
  madd(vGate, vGate, _acc, -0.5 * landDt * landDt);
  scale(vGate, vGate, 1 / Math.max(landDt, 1e-6));
  // Damp horizontal for a vertical suicide-burn look
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
  // Cap descent rate (~0.15 km/s ≈ 150 m/s at gate — hot but theater-readable)
  const vGateMag = len(vGate);
  if (vGateMag > 0.2) scale(vGate, vGate, 0.2 / vGateMag);

  // Catch: co-rotate with pad (Earth-relative vel of surface point)
  // v_surf ≈ ω × r; pad.vel - earthVel is that
  const padCatch = starbasePadState(tCatch);
  const bCatch = bodyPositions(tCatch);
  const vCatch = v3();
  sub(vCatch, padCatch.vel, bCatch.earthVel);

  // Hold end
  const tHold = t0 + LANDING_END_S + CATCH_HOLD_S;
  const pHold = catchRelAt(tHold);
  const padHold = starbasePadState(tHold);
  const bHold = bodyPositions(tHold);
  const vHold = v3();
  sub(vHold, padHold.vel, bHold.earthVel);

  return [
    { age: 0, p: p0, v: v0 },
    { age: BOOSTBACK_START_S, p: pBB0, v: vBB0 },
    { age: BOOSTBACK_END_S, p: pBB1, v: vBB1 },
    { age: ageMid, p: pMid, v: vMid },
    { age: LANDING_START_S, p: pGate, v: vGate },
    { age: LANDING_END_S, p: pCatch, v: vCatch },
    { age: LANDING_END_S + CATCH_HOLD_S, p: pHold, v: vHold },
  ];
}

function phaseAt(age: number): BoosterRecoveryPhase {
  if (age < 0) return "done";
  if (age > BOOSTER_VISIBLE_S) return "done";
  if (age < BOOSTBACK_START_S) return age < 1.5 ? "sep" : "flip";
  if (age < BOOSTBACK_END_S) return "boostback";
  if (age < LANDING_START_S) return "coast";
  if (age < LANDING_END_S) return "landing";
  if (age <= LANDING_END_S + CATCH_HOLD_S + CATCH_FADE_S) return "caught";
  return "done";
}

function throttleAt(age: number, phase: BoosterRecoveryPhase): number {
  if (phase === "boostback") {
    const u = age - BOOSTBACK_START_S;
    const dur = BOOSTBACK_END_S - BOOSTBACK_START_S;
    const up = smoothstep(0, 2.2, u);
    const down = 1 - smoothstep(dur - 2.5, dur, u);
    return 0.55 * up * down;
  }
  if (phase === "landing") {
    const u = age - LANDING_START_S;
    const dur = LANDING_END_S - LANDING_START_S;
    const up = smoothstep(0, 1.5, u);
    const mid = 1 - 0.35 * smoothstep(dur * 0.45, dur * 0.85, u);
    const down = 1 - smoothstep(dur - 1.2, dur, u);
    return 0.72 * up * mid * down;
  }
  return 0;
}

function fadeAt(age: number): number {
  if (age < 0) return 0;
  if (age > BOOSTER_VISIBLE_S) return 0;
  const fadeStart = LANDING_END_S + CATCH_HOLD_S;
  if (age <= fadeStart) return 1;
  return 1 - smoothstep(fadeStart, fadeStart + CATCH_FADE_S, age);
}

/** Pad catch point (inertial) at mission time t. */
export function catchPointAt(t: number, out: V3 = v3()): V3 {
  const pad = starbasePadState(t);
  return madd(out, pad.pos, pad.up, CATCH_ALT_KM);
}

/**
 * Sample the booster recovery path at `age = missionT − stage.t`.
 * Vector fields alias internal scratch — copy if you need to retain them.
 */
export function sampleBoosterRecovery(
  stage: StageState,
  age: number,
  keyframes?: RelKeyframe[],
): BoosterRecoverySample {
  const phase = phaseAt(age);
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

  const kfs = keyframes ?? buildBoosterKeyframes(stage);
  const lastAge = kfs[kfs.length - 1]!.age;
  const ageClamped = Math.min(Math.max(age, 0), lastAge);

  let i = 0;
  while (i < kfs.length - 2 && ageClamped > kfs[i + 1]!.age) i++;
  const a = kfs[i]!;
  const b = kfs[i + 1]!;
  hermite(ageClamped, a.age, b.age, a.p, a.v, b.p, b.v, _pRel, _vRel);

  // After hold keyframe (fade window): stick to moving catch point
  if (age > lastAge) {
    const t = stage.t + age;
    const pad = starbasePadState(t);
    const bt = bodyPositions(t);
    madd(_tmp, pad.pos, pad.up, CATCH_ALT_KM);
    sub(_pRel, _tmp, bt.earth);
    sub(_vRel, pad.vel, bt.earthVel);
  }

  // Surface clamp in relative frame
  const r = len(_pRel);
  const minR = R_EARTH + 0.05;
  if (r < minR && r > 1e-6) {
    scale(_pRel, _pRel, minR / r);
  }

  // Lift back to heliocentric / inertial
  const t = stage.t + age;
  const bt = bodyPositions(t);
  add(_pos, bt.earth, _pRel);
  add(_vel, bt.earthVel, _vRel);

  // Attitude: ascent nose-along-v_rel → flip → engines-first (nose anti-v_rel)
  const flipU = smoothstep(0.5, BOOSTER_FLIP_S, age);
  const speed = len(_vRel);
  if (speed > 0.02) {
    normalize(_tmp, _vRel); // prograde (Earth-relative)
    set(_nose, -_tmp.x, -_tmp.y, -_tmp.z); // engines-first
    set(
      _nose,
      _tmp.x * (1 - flipU) + _nose.x * flipU,
      _tmp.y * (1 - flipU) + _nose.y * flipU,
      _tmp.z * (1 - flipU) + _nose.z * flipU,
    );
    normalize(_nose, _nose);
  } else {
    const pad = starbasePadState(t);
    copy(_nose, pad.up);
  }

  // Settle nose-up into the catch
  if (phase === "caught" || age >= LANDING_END_S - 2) {
    const pad = starbasePadState(t);
    const settle = smoothstep(LANDING_END_S - 4, LANDING_END_S + 1, age);
    set(
      _nose,
      _nose.x * (1 - settle) + pad.up.x * settle,
      _nose.y * (1 - settle) + pad.up.y * settle,
      _nose.z * (1 - settle) + pad.up.z * settle,
    );
    normalize(_nose, _nose);
  }

  const throttle = throttleAt(age, phase);
  return {
    phase,
    pos: _pos,
    vel: _vel,
    nose: _nose,
    burning: throttle > 0.02,
    throttle,
    fade: fadeAt(age),
  };
}

/** Classify phase for tests / HUD without sampling. */
export function boosterPhaseAt(age: number): BoosterRecoveryPhase {
  return phaseAt(age);
}

/**
 * Pure recovery theater poses — chopsticks close (RTLS) and Gulf site gates.
 *
 * **No THREE.** Scrub-safe from booster age after stage-out. Scene unit = 1 km.
 *
 * Chopsticks close only for the `"chopsticks"` profile. Flight 13 gulf leaves
 * the arms at rest (catch is offshore).
 *
 * @see earthTheater.updateMechazillaRecovery — impure applicator
 * @see docs/VISUAL_REALISM.md — V8 recovery catch
 */

import {
  CHOPSTICKS_SCHEDULE,
  GULF_SCHEDULE,
  type BoosterRecoveryPhase,
  type RecoveryProfile,
  type RecoverySchedule,
} from "../physics/boosterRecovery";

/** Mission-time input for chopsticks animation. */
export type ChopstickRecoveryState = Readonly<{
  /** Seconds after stage-out (may be negative). */
  age: number;
  profile: RecoveryProfile;
}>;

/** Derived chopsticks pose (0 = rest open). */
export type ChopstickPose = Readonly<{
  /** 0 rest-open, 1 closed around the booster. */
  close: number;
  /**
   * Yaw pulled inward from rest (rad). Applicator subtracts
   * `sign(restYaw) * yawInRad` so both arms swing toward the tower face.
   */
  yawInRad: number;
  /** Extra pitch (rad); negative clamps the beams down onto the booster. */
  pitchRad: number;
  /** Carriage drop in pad km (negative = settle). */
  carriageDy: number;
}>;

/**
 * Smoothstep close amount for chopsticks. Starts ~5 s before catch, settles
 * ~2 s after `landingEndS`. Zero for the gulf profile.
 */
export function chopstickCloseAmount(
  age: number,
  profile: RecoveryProfile,
): number {
  if (profile !== "chopsticks" || !Number.isFinite(age)) return 0;
  const t0 = CHOPSTICKS_SCHEDULE.landingEndS - 5;
  const t1 = CHOPSTICKS_SCHEDULE.landingEndS + 1.8;
  if (age <= t0) return 0;
  if (age >= t1) return 1;
  const u = (age - t0) / (t1 - t0);
  return u * u * (3 - 2 * u);
}

/**
 * Derive chopsticks close / carriage settle for one frame.
 *
 * @param state - Booster age + recovery profile
 */
export function deriveChopstickPose(state: ChopstickRecoveryState): ChopstickPose {
  const close = chopstickCloseAmount(state.age, state.profile);
  return {
    close,
    yawInRad: 0.042 * close,
    pitchRad: -0.05 * close,
    carriageDy: -0.0035 * close,
  };
}

/**
 * Gulf site plate visible during landing / caught, or shortly before the burn.
 */
export function gulfSiteVisible(
  phase: BoosterRecoveryPhase | string,
  age: number,
  sched: RecoverySchedule = GULF_SCHEDULE,
): boolean {
  if (phase === "landing" || phase === "caught") return true;
  return Number.isFinite(age) && age >= sched.landingStartS - 90;
}

/**
 * Theater AGL (km) along the gulf landing burn — linear gate → land.
 * Used to drive spray without sampling the recovery path twice.
 */
export function gulfLandingAltKm(
  age: number,
  sched: RecoverySchedule = GULF_SCHEDULE,
): number {
  if (!Number.isFinite(age) || age >= sched.landingEndS) return sched.landAltKm;
  if (age <= sched.landingStartS) return sched.gateAltKm;
  const u = (age - sched.landingStartS) / (sched.landingEndS - sched.landingStartS);
  return sched.gateAltKm + (sched.landAltKm - sched.gateAltKm) * u;
}

/**
 * Map booster recovery phase onto splash spray curves (descent vs splashdown).
 */
export function gulfSprayPhase(
  phase: BoosterRecoveryPhase | string,
): "descent" | "splashdown" | "entry" {
  if (phase === "caught" || phase === "done") return "splashdown";
  if (phase === "landing") return "descent";
  return "entry";
}

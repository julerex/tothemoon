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
  boosterVisibleS,
  CHOPSTICKS_SCHEDULE,
  GULF_SCHEDULE,
  type BoosterRecoveryPhase,
  type RecoveryProfile,
  type RecoverySchedule,
} from "../physics/boosterRecovery";
import {
  CHOPSTICK_CATCH_DROP_KM,
  CHOPSTICK_OPEN_YAW_RAD,
} from "./earthTheater/mechazillaDims";
import {
  clampRange,
  contactPose,
  discLayerPose,
  oceanGlitterOpacity,
  sheetLayerPose,
  type SplashSprayDerived,
} from "./terminalFx";

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
    yawInRad: CHOPSTICK_OPEN_YAW_RAD * 0.9 * close,
    pitchRad: -0.05 * close,
    carriageDy: CHOPSTICK_CATCH_DROP_KM * close,
  };
}

/** Seconds before landing-burn start to show the gulf site plate. */
const GULF_SITE_LEAD_S = 90;
/**
 * Hard-splash steam after `landingEndS`. Brief and local — not the Indian
 * Ocean ship-splash bloom (that disc grows to tens of km over ~90 s).
 */
export const GULF_STEAM_HOLD_S = 16;

/**
 * Gulf site plate visible during landing / caught, shortly before the burn,
 * and not after the booster recovery window ends.
 */
export function gulfSiteVisible(
  phase: BoosterRecoveryPhase | string,
  age: number,
  sched: RecoverySchedule = GULF_SCHEDULE,
): boolean {
  if (!Number.isFinite(age) || age > boosterVisibleS(sched)) return false;
  if (phase === "landing" || phase === "caught") return true;
  return age >= sched.landingStartS - GULF_SITE_LEAD_S;
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

/**
 * Local gulf steam is on during the landing burn and a short post-splash hold.
 * Off during the 90 s site-plate lead-in and after the booster fades.
 */
export function gulfSprayActive(
  phase: BoosterRecoveryPhase | string,
  age: number,
  sched: RecoverySchedule = GULF_SCHEDULE,
): boolean {
  if (!Number.isFinite(age) || age > boosterVisibleS(sched)) return false;
  if (phase === "landing") return true;
  if (phase === "caught" || phase === "done") {
    return age <= sched.landingEndS + GULF_STEAM_HOLD_S;
  }
  return false;
}

/** Mission-time input for gulf site spray / glitter. */
export type GulfSprayState = Readonly<{
  missionT: number;
  landT: number;
  recoveryPhase: BoosterRecoveryPhase | string;
  /** Seconds after stage-out. */
  age: number;
}>;

/**
 * Hard-splash steam envelope (km). Stays inside the gulf site ring so Earth-cam
 * does not grow a white disc over the Gulf of America.
 */
function gulfSteamBase(
  age: number,
  sched: RecoverySchedule,
): { expand: number; opacity: number } {
  if (age >= sched.landingEndS) {
    const dt = Math.max(0, age - sched.landingEndS);
    const u = Math.min(1, dt / 5);
    const spike = 1 + 0.5 * Math.exp(-dt / 1.1);
    return {
      expand: 0.55 + u * 0.7,
      opacity: 0.42 * spike * Math.exp(-dt / GULF_STEAM_HOLD_S),
    };
  }
  const alt = gulfLandingAltKm(age, sched);
  return {
    expand: clampRange(0.45 + (sched.gateAltKm - alt) * 0.2, 0.45, 1.15),
    opacity: clampRange(0.1 + (sched.gateAltKm - alt) * 0.06, 0.08, 0.32),
  };
}

/**
 * Derive gulf site visibility, local steam, and glitter (single pure entry).
 *
 * @param state - Mission clock + booster recovery sample
 */
export function deriveGulfSpray(
  state: GulfSprayState,
  sched: RecoverySchedule = GULF_SCHEDULE,
): SplashSprayDerived {
  const siteVisible = gulfSiteVisible(state.recoveryPhase, state.age, sched);
  const active = siteVisible && gulfSprayActive(state.recoveryPhase, state.age, sched);
  const altEarth = gulfLandingAltKm(state.age, sched);
  const base = gulfSteamBase(state.age, sched);
  const splashAge = state.missionT - state.landT;
  const sheet = sheetLayerPose(splashAge, base.opacity, altEarth, active);
  return {
    siteVisible,
    active,
    base,
    inner: discLayerPose(base, active, 0.7, 1.4),
    outer: discLayerPose(base, active, 1.35, 0.55),
    sheet: {
      ...sheet,
      expand: Math.min(sheet.expand, 1.4),
      height: Math.min(sheet.height, 1.8),
    },
    contact: contactPose(altEarth, active),
    glitter: siteVisible ? oceanGlitterOpacity(altEarth, state.missionT) : 0,
    ocean: 0,
    clouds: 0,
  };
}

/**
 * Detached-booster theater poses (pure).
 *
 * No THREE: {@link deriveStagingVisual} turns the recovery age into flash and
 * locator poses, and the plume helpers turn throttle into a fill fraction.
 * `stagingFx.ts` writes the results onto the cloned Super Heavy mesh.
 *
 * Scrub-deterministic — every scalar is a function of mission time and the
 * force-model recovery sample from `physics/boosterRecovery.ts`.
 *
 * @see stagingFx.ts — impure applicator
 * @see plumeRegime.ts — regime lookup and thrust lag
 */

import {
  boostbackFlashStrength,
  boosterLocatorStrength,
  boosterVisibleS,
  landingContactFlashStrength,
  recoverySchedule,
  type RecoveryProfile,
} from "../physics/boosterRecovery";
import type { PlumeLook } from "./plumeRegime";

/** Staging flash lifetime (mission s). */
export const STAGE_FLASH_S = 3.5;

/**
 * Peak material opacity for the free-flyer locator vs body locators (~1.0).
 * Dimmer so the ship label remains the primary subject in system views.
 */
export const LOCATOR_OPACITY = 0.55;

/** Strengths below this leave their cue hidden. */
const CUE_MIN = 0.02;

/** Booster fades out of the theater below this remaining fade. */
const FADE_MIN = 0.02;

type Xyz = Readonly<{ x: number; y: number; z: number }>;

/** Additive flash sphere pose (scale in mesh units, opacity in [0, 1]). */
export type FlashPose = Readonly<{
  visible: boolean;
  scale: number;
  opacity: number;
}>;

const HIDDEN_FLASH: FlashPose = Object.freeze({ visible: false, scale: 0, opacity: 0 });

/**
 * Separation flash: expands and fades over {@link STAGE_FLASH_S}.
 * `atCraft` keeps the first frames pinned to the ship before the booster drifts.
 */
export type StageFlashPose = FlashPose & Readonly<{ atCraft: boolean }>;

export function stageFlashPose(age: number): StageFlashPose {
  if (!(age >= 0) || age > STAGE_FLASH_S) {
    return Object.freeze({ ...HIDDEN_FLASH, atCraft: false });
  }
  const u = age / STAGE_FLASH_S;
  return Object.freeze({
    visible: true,
    atCraft: age < 0.05,
    scale: 0.15 + u * 2.2,
    opacity: 0.9 * (1 - u) * (1 - u),
  });
}

/** Boostback ignition flash, offset off the engine end along −nose. */
export type BoostbackFlashPose = FlashPose & Readonly<{ noseOffset: number }>;

export function boostbackFlashPose(age: number): BoostbackFlashPose {
  const strength = boostbackFlashStrength(age);
  if (strength < CUE_MIN) return Object.freeze({ ...HIDDEN_FLASH, noseOffset: 0 });
  return Object.freeze({
    visible: true,
    noseOffset: 0.04,
    scale: 0.06 + strength * 0.55,
    opacity: 0.75 * strength,
  });
}

/** Contact flash at the chopsticks catch / gulf hard splash. */
export function landingFlashPose(age: number, profile: RecoveryProfile): FlashPose {
  const strength = landingContactFlashStrength(age, recoverySchedule(profile));
  if (strength < CUE_MIN) return HIDDEN_FLASH;
  return Object.freeze({
    visible: true,
    scale: 0.07 + strength * 0.7,
    opacity: 0.8 * strength,
  });
}

/**
 * Dim amber locator opacity for ~30 s after stage-out, when the mesh is
 * sub-pixel. Returns 0 while the locator should stay hidden.
 */
export function boosterLocatorOpacity(age: number): number {
  const strength = boosterLocatorStrength(age);
  return strength < CUE_MIN ? 0 : LOCATOR_OPACITY * strength;
}

/** Flash + locator poses for one frame of the recovery timeline. */
export type StagingVisual = Readonly<{
  flash: StageFlashPose;
  boostbackFlash: BoostbackFlashPose;
  landingFlash: FlashPose;
  /** 0 hides the locator. */
  locatorOpacity: number;
}>;

export function deriveStagingVisual(age: number, profile: RecoveryProfile): StagingVisual {
  return Object.freeze({
    flash: stageFlashPose(age),
    boostbackFlash: boostbackFlashPose(age),
    landingFlash: landingFlashPose(age, profile),
    locatorOpacity: boosterLocatorOpacity(age),
  });
}

/**
 * Age since stage-out while the booster is on stage, else null.
 * Null covers both "not yet staged" and "past the recovery window".
 */
export function recoveryAge(
  missionT: number,
  stageT: number,
  profile: RecoveryProfile,
): number | null {
  const age = missionT - stageT;
  if (age < 0 || age > boosterVisibleS(recoverySchedule(profile))) return null;
  return age;
}

/** Whether the booster mesh is still worth drawing. */
export function boosterMeshVisible(sample: { fade: number; phase: string }): boolean {
  return sample.fade >= FADE_MIN && sample.phase !== "done";
}

/** Mesh scale multiplier from the recovery fade (never fully zero). */
export function boosterFadeScale(fade: number): number {
  return Math.max(fade, 0.001);
}

const UP_Y: Xyz = Object.freeze({ x: 0, y: 1, z: 0 });
const UP_X: Xyz = Object.freeze({ x: 1, y: 0, z: 0 });

/**
 * Up axis for the booster look-at basis. Swaps to +X when the nose is nearly
 * parallel to +Y, where a +Y up vector would be degenerate.
 *
 * @param nose Unit nose direction
 */
export function boosterUpAxis(nose: Xyz): Xyz {
  return Math.abs(nose.y) > 0.95 ? UP_X : UP_Y;
}

/**
 * Plume fill target from booster throttle.
 *
 * The peak-thrust reference cancels out (thrust = throttle · reference), so the
 * target is throttle² clamped at unit throttle — boostback and landing burns
 * share one curve.
 */
export function recoveryPlumeTarget(throttle: number): number {
  return Math.min(1, throttle) * throttle;
}

/** Exhaust point-light pose for the detached booster. */
export type RecoveryLightPose = Readonly<{
  intensity: number;
  distance: number;
}>;

export function recoveryLightPose(
  u: number,
  look: PlumeLook,
  flicker: number,
): RecoveryLightPose {
  return Object.freeze({
    intensity: (1.2 + 2.0 * u) * look.lightI * flicker,
    distance: (0.14 + 0.16 * u) * look.lightDist,
  });
}

/** Single-sprite fallback pose for craft meshes without layered plumes. */
export type LegacyPlumePose = Readonly<{
  scaleX: number;
  scaleY: number;
  opacity: number;
  /** Craft-local Z offset (mesh units). */
  z: number;
}>;

export function legacyPlumePose(
  u: number,
  look: PlumeLook,
  flicker: number,
): LegacyPlumePose {
  const s = (0.3 + 0.4 * u) * look.radial * flicker;
  return Object.freeze({
    scaleX: s,
    scaleY: s * look.length,
    opacity: (0.3 + 0.35 * u) * look.opacity * flicker,
    z: -0.1 - 0.05 * u,
  });
}

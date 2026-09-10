/**
 * Super Heavy landing-burn engine count (theater).
 *
 * Flight 13 gulf: official recap is a partial relight of the inner 13, then a
 * hard splash. NSF / Wikipedia: 10 of 13 relit, then 8, then 5.
 * Chopsticks catch still commands the full inner 13.
 *
 * Engine indices match `meshBooster` ring order: 3 inner + 10 mid + 20 outer.
 */

/** Inner + mid rings commanded for a Super Heavy landing burn. */
export const BOOSTER_LANDING_ENGINES = 13;
/** Center three (gimbal) Raptors. */
export const BOOSTER_INNER_ENGINES = 3;
/** Mid-ring Raptors on the landing set. */
export const BOOSTER_MID_ENGINES = 10;
/** Outer ring — ascent / boostback only; not part of the landing set. */
export const BOOSTER_OUTER_ENGINES = 20;
/** Full Raptor 3 cluster. */
export const BOOSTER_ENGINE_COUNT =
  BOOSTER_INNER_ENGINES + BOOSTER_MID_ENGINES + BOOSTER_OUTER_ENGINES;

/** Seconds of the 10-engine then 8-engine steps (NSF sequence, not a telemetry log). */
const GULF_TEN_S = 4;
const GULF_EIGHT_S = 8;

export type LandingEngineWindow = {
  landingStartS: number;
  landingEndS: number;
};

/**
 * Flight 13 gulf landing-burn Raptor count at recovery age.
 * 0 outside the burn window.
 */
export function gulfLandingEngineCount(
  ageS: number,
  window: LandingEngineWindow,
): number {
  if (ageS < window.landingStartS || ageS >= window.landingEndS) return 0;
  const u = ageS - window.landingStartS;
  if (u < GULF_TEN_S) return 10;
  if (u < GULF_EIGHT_S) return 8;
  return 5;
}

/**
 * Visual throttle peak for the gulf landing plume (lit / 13).
 * Chopsticks keep their own peak in `boosterRecovery`.
 */
export function gulfLandingThrottlePeak(
  ageS: number,
  window: LandingEngineWindow,
): number {
  return gulfLandingEngineCount(ageS, window) / BOOSTER_LANDING_ENGINES;
}

/**
 * Whether landing-set engine `index` is among the `litCount` that stayed lit.
 * Inner 3 stay lit until the count drops below 3; remaining slots fill the mid ring.
 * Outer-ring indices (13+) are always dark on a landing burn.
 */
export function boosterLandingBellLit(index: number, litCount: number): boolean {
  if (index < 0 || index >= BOOSTER_LANDING_ENGINES) return false;
  if (litCount <= 0) return false;
  if (index < BOOSTER_INNER_ENGINES) return index < Math.min(litCount, BOOSTER_INNER_ENGINES);
  return index - BOOSTER_INNER_ENGINES < Math.max(0, litCount - BOOSTER_INNER_ENGINES);
}

/**
 * Per-bell active flag for the detached Super Heavy clone.
 * Boostback lights all 33 (Flight 13 V3). Landing lights a subset of the inner 13.
 * When not burning, bells stay full opacity.
 */
export function boosterEngineLit(
  index: number,
  opts: { burning: boolean; phase: string; litCount: number },
): boolean {
  if (!opts.burning) return true;
  if (opts.phase === "boostback") return true;
  if (opts.phase !== "landing") return true;
  return boosterLandingBellLit(index, opts.litCount);
}

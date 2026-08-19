/**
 * Pure terminal FX — lunar dust and ocean splash strengths / layer poses.
 *
 * ## Architecture
 *
 * ```
 * LunarDustState / SplashSprayState
 *         ↓
 * deriveLunarDust() / deriveSplashSpray()
 *         ↓
 * LandingFx / SplashFx  (THREE applicators only)
 * ```
 *
 * **No THREE** in this module: scrub-safe, unit-testable, shared by both
 * mission theaters. Scene unit = **1 km**.
 *
 * Looks are theater-grade (pad-deluge tier pattern: inner spray, outer mist,
 * brief vertical sheet) — not CFD or ops imagery.
 *
 * @see landingFx.ts / splashFx.ts — impure applicators
 * @see docs/VISUAL_REALISM.md — V6 terminal FX
 */

export { clamp01, clampRange } from "./terminalFxMath";
export type {
  ContactCuePose,
  ExpandOpacity,
  LunarDustDerived,
  LunarDustState,
  SplashSprayDerived,
  SplashSprayState,
  TerminalLayerId,
  TerminalLayerPose,
} from "./terminalLunarFx";
export {
  BEACON_PULSE_RATE,
  CONTACT_FADE_ALT_KM,
  TERMINAL_ALT_GATE_KM,
  beaconPulseOpacity,
  contactCueExpand,
  contactCueOpacity,
  deriveLunarDust,
  descentDust,
  descentSpray,
  dustActive,
  dustExpandOpacity,
  landedDust,
  landingWashStrength,
  nearMoonPhase,
  nearSplash,
  sheetLayerPose,
  shouldShowSplashSite,
  splashdownSpray,
  sprayExpandOpacity,
} from "./terminalLunarFx";
export {
  OCEAN_CHOP_AMP_KM,
  OCEAN_SWELL_AMP_KM,
  WEATHER_CLOUD_ALT_KM,
  WEATHER_CLOUD_FADE_KM,
  WEATHER_CLOUD_FULL_KM,
  deriveSplashSpray,
  hullWetStrength,
  oceanChopHeightKm,
  oceanGlitterOpacity,
  oceanSwellHeightKm,
  splashOceanPlateOpacity,
  splashWeatherCloudOpacity,
} from "./terminalSplashFx";

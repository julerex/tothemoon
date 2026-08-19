/** Splash / ocean terminal FX helpers. */

import { clamp01 } from "./terminalFxMath";
import type {
  ExpandOpacity,
  SplashSprayDerived,
  SplashSprayState,
} from "./terminalLunarFx";
import {
  TERMINAL_ALT_GATE_KM,
  contactPose,
  discLayerPose,
  nearSplash,
  sheetLayerPose,
  shouldShowSplashSite,
  sprayExpandOpacity,
} from "./terminalLunarFx";


const SPLASH_INNER_EXPAND=0.62;
const SPLASH_INNER_OPACITY=1.75;
const SPLASH_OUTER_EXPAND=2.15;
const SPLASH_OUTER_OPACITY=0.78;

/**
 * Typical cumulus deck the ship falls through on terminal descent (km AGL).
 * Weather altitude — not the V19 LEO shell (~51 km).
 */
export const WEATHER_CLOUD_ALT_KM = 2;

/** Weather-deck fully on at and below this craft altitude (km). */
export const WEATHER_CLOUD_FULL_KM = 55;
/**
 * Weather-deck gone above this so a far Earth-cam does not grow a white
 * patch on Blue Marble (#14).
 */
export const WEATHER_CLOUD_FADE_KM = 130;

/** Long-period theater swell amplitude (km) — about 4.5 m. */
export const OCEAN_SWELL_AMP_KM = 0.0045;
/** Near-field chop amplitude on the inner splash plate (km) — about 2.2 m. */
export const OCEAN_CHOP_AMP_KM = 0.0022;

/**
 * Local sunlit sea plate at the splash zone [0, 1].
 * Full hull-down (the globe PBR ocean goes black at dawn); fade out by ~75 km
 * so Earth-cam does not grow a bright disc.
 */
export function splashOceanPlateOpacity(altKm: number): number {
  if (!Number.isFinite(altKm) || altKm < 0) return 0;
  if (altKm <= 18) return 1;
  if (altKm >= 75) return 0;
  return clamp01((75 - altKm) / (75 - 18));
}

/**
 * Puffy weather-deck opacity [0, 1] from craft altitude.
 * Full through descent and splash; fades before Earth-cam framing so this
 * stays a local splash-zone cue, not a globe cloud overlay.
 */
export function splashWeatherCloudOpacity(altKm: number): number {
  if (!Number.isFinite(altKm) || altKm < 0) return 0;
  if (altKm <= WEATHER_CLOUD_FULL_KM) return 1;
  if (altKm >= WEATHER_CLOUD_FADE_KM) return 0;
  return clamp01(
    (WEATHER_CLOUD_FADE_KM - altKm) / (WEATHER_CLOUD_FADE_KM - WEATHER_CLOUD_FULL_KM),
  );
}

/**
 * Long-period draped swell height (km). Scrub-deterministic. Keep in sync
 * with the splash ocean vertex shader.
 */
export function oceanSwellHeightKm(
  xKm: number,
  zKm: number,
  missionT: number,
): number {
  if (!Number.isFinite(xKm) || !Number.isFinite(zKm) || !Number.isFinite(missionT)) {
    return 0;
  }
  const a = Math.sin(xKm * 0.22 + zKm * 0.14 + missionT * 0.65) * OCEAN_SWELL_AMP_KM;
  const b =
    Math.sin(xKm * -0.16 + zKm * 0.25 + missionT * 0.88) * OCEAN_SWELL_AMP_KM * 0.55;
  const c =
    Math.sin(xKm * 0.41 + zKm * -0.11 + missionT * 1.15) * OCEAN_SWELL_AMP_KM * 0.28;
  return a + b + c;
}

/**
 * Short chop on the inner splash plate (km). Aliases on the 80 km plate —
 * inner mesh only. Keep in sync with the splash ocean vertex shader.
 */
export function oceanChopHeightKm(
  xKm: number,
  zKm: number,
  missionT: number,
): number {
  if (!Number.isFinite(xKm) || !Number.isFinite(zKm) || !Number.isFinite(missionT)) {
    return 0;
  }
  const a = Math.sin(xKm * 10.4 + zKm * 7.1 + missionT * 1.45) * OCEAN_CHOP_AMP_KM;
  const b =
    Math.sin(xKm * -8.2 + zKm * 12.6 + missionT * 1.9) * OCEAN_CHOP_AMP_KM * 0.64;
  return a + b;
}

/**
 * Ocean sun-glint on splash / Gulf plates [0, 1].
 * Strongest hull-down (~0.1–20 km); soft out to ~60 km. Scrub-safe shimmer.
 */
export function oceanGlitterOpacity(altKm: number, missionT: number): number {
  if (!Number.isFinite(altKm) || altKm > 60 || altKm < 0) return 0;
  const env =
    altKm < 20
      ? 0.4 + 0.55 * clamp01(1 - altKm / 20)
      : 0.4 * clamp01((60 - altKm) / 40);
  const shimmer = 0.72 + 0.28 * Math.sin(missionT * 3.1 + 0.4);
  return clamp01(env * shimmer);
}

/**
 * Post-contact wet / charred hull roughness punch [0, 1].
 * Full on splashdown; ramps in the last half-km of descent.
 */
export function hullWetStrength(
  phase: string | undefined,
  altEarthKm: number | undefined,
): number {
  if (phase === "splashdown") return 1;
  if (phase !== "descent" || altEarthKm == null || !Number.isFinite(altEarthKm)) {
    return 0;
  }
  if (altEarthKm >= 0.5) return 0;
  return clamp01(1 - altEarthKm / 0.5);
}

function splashLayersFromBase(
  base: ExpandOpacity,
  active: boolean,
  age: number,
  altKm: number,
): Pick<SplashSprayDerived, "inner" | "outer" | "sheet" | "contact"> {
  return {
    inner: discLayerPose(base, active, SPLASH_INNER_EXPAND, SPLASH_INNER_OPACITY),
    outer: discLayerPose(base, active, SPLASH_OUTER_EXPAND, SPLASH_OUTER_OPACITY),
    sheet: sheetLayerPose(age, base.opacity, altKm, active),
    contact: contactPose(altKm, active),
  };
}

/**
 * Derive all splash spray poses from mission state (single pure entry point).
 *
 * @param state - Mission spray input
 * @returns Immutable bundle (same inputs → same outputs)
 */
export function deriveSplashSpray(state: SplashSprayState): SplashSprayDerived {
  const siteVisible = shouldShowSplashSite(state.phase, state.missionT, state.landT);
  const active = nearSplash(state.phase, state.altEarth) && state.altEarth < TERMINAL_ALT_GATE_KM;
  const base = sprayExpandOpacity(
    state.missionT, state.landT, state.phase, state.altEarth,
  );
  const age = state.missionT - state.landT;
  return {
    siteVisible,
    active,
    base,
    ...splashLayersFromBase(base, active, age, state.altEarth),
    glitter: siteVisible
      ? oceanGlitterOpacity(state.altEarth, state.missionT)
      : 0,
    ocean: siteVisible ? splashOceanPlateOpacity(state.altEarth) : 0,
    clouds: siteVisible ? splashWeatherCloudOpacity(state.altEarth) : 0,
  };
}

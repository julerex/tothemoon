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

/** Clamp a number into [0, 1]; non-finite → 0. */
export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

/**
 * Clamp `x` into `[lo, hi]`. Non-finite → `lo`.
 *
 * @param x - Sample
 * @param lo - Inclusive lower bound
 * @param hi - Inclusive upper bound
 */
export function clampRange(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/** Horizontal expand (km-ish disc radius) + material opacity. */
export type ExpandOpacity = Readonly<{
  expand: number;
  opacity: number;
}>;

/** One terminal layer (inner spray / outer mist / vertical sheet). */
export type TerminalLayerId = "inner" | "outer" | "sheet";

/** Fully derived pose for one terminal layer — ready for THREE apply. */
export type TerminalLayerPose = Readonly<{
  visible: boolean;
  /** Horizontal scale (km). */
  expand: number;
  /** Vertical scale for sheets (km); unused for discs. */
  height: number;
  opacity: number;
}>;

/** Cheap ground-contact disc under the craft (not a shadow frustum). */
export type ContactCuePose = Readonly<{
  visible: boolean;
  expand: number;
  opacity: number;
}>;

/** Mission-time input for lunar dust. */
export type LunarDustState = Readonly<{
  missionT: number;
  landT: number;
  phase: string;
  burning: boolean;
  altMoon: number;
}>;

/** Mission-time input for ocean spray. */
export type SplashSprayState = Readonly<{
  missionT: number;
  landT: number;
  phase: string;
  altEarth: number;
}>;

/** Derived lunar dust bundle for one frame. */
export type LunarDustDerived = Readonly<{
  siteVisible: boolean;
  active: boolean;
  base: ExpandOpacity;
  inner: TerminalLayerPose;
  outer: TerminalLayerPose;
  sheet: TerminalLayerPose;
  contact: ContactCuePose;
}>;

/** Derived splash spray bundle for one frame. */
export type SplashSprayDerived = Readonly<{
  siteVisible: boolean;
  active: boolean;
  base: ExpandOpacity;
  inner: TerminalLayerPose;
  outer: TerminalLayerPose;
  sheet: TerminalLayerPose;
  contact: ContactCuePose;
  /** Ocean sun-glint strength [0, 1] for splash / Gulf plates. */
  glitter: number;
  /** Local sunlit sea plate [0, 1] — splash zone only. */
  ocean: number;
  /**
   * Cumulus deck at {@link WEATHER_CLOUD_ALT_KM} [0, 1]. Stays on through
   * splash so the recovery drone still has clouds overhead.
   */
  clouds: number;
}>;

/** Dust / spray visible below this altitude (km). */
export const TERMINAL_ALT_GATE_KM = 40;
/** Contact-cue fully off above this altitude (km). */
export const CONTACT_FADE_ALT_KM = 3;

const INNER_EXPAND = 0.42;
const INNER_OPACITY = 1.18;
const OUTER_EXPAND = 1.62;
const OUTER_OPACITY = 0.42;

/** Splash steam denser / wider than lunar dust (V17 contact cloud). */
const SPLASH_INNER_EXPAND = 0.62;
const SPLASH_INNER_OPACITY = 1.75;
const SPLASH_OUTER_EXPAND = 2.15;
const SPLASH_OUTER_OPACITY = 0.78;

/**
 * Powered-descent lunar dust envelope from altitude (km).
 *
 * Expand grows as the ship nears the surface; opacity ramps in below ~20 km.
 */
export function descentDust(altMoon: number): ExpandOpacity {
  return {
    expand: clampRange(8 + (25 - altMoon) * 0.8, 4, 35),
    opacity: clampRange(0.15 + (20 - altMoon) * 0.02, 0.1, 0.55),
  };
}

/**
 * Post-touchdown lunar dust: brief opacity spike then exponential fade.
 *
 * Expand keeps drifting out over ~120 s. Opacity peaks at `landT` then
 * decays with τ ≈ 200 s (plus a ~1.6 s spike envelope).
 *
 * @param missionT - Mission clock (s)
 * @param landT - Touchdown mission time (s)
 */
export function landedDust(missionT: number, landT: number): ExpandOpacity {
  const age = Math.max(0, missionT - landT);
  const u = Math.min(1, age / 120);
  const spike = 1 + 0.7 * Math.exp(-age / 1.6);
  return {
    expand: 18 + u * 40,
    opacity: 0.5 * spike * Math.exp(-age / 200),
  };
}

/**
 * Route lunar dust to descent vs landed curves.
 *
 * @returns Fallback `{ expand: 6, opacity: 0.12 }` when neither gate matches
 */
export function dustExpandOpacity(
  missionT: number,
  landT: number,
  phase: string,
  burning: boolean,
  altMoon: number,
): ExpandOpacity {
  if (phase === "descent" && burning) return descentDust(altMoon);
  if (phase === "landed") return landedDust(missionT, landT);
  return { expand: 6, opacity: 0.12 };
}

/** Phases that show the lunar site plate outright. */
const LUNAR_SITE_PHASES: ReadonlySet<string> = new Set([
  "approach", "braking", "descent", "landed",
]);

/** Phases whose low-altitude passes raise dust. */
const LUNAR_DUST_PHASES: ReadonlySet<string> = new Set(["descent", "landed"]);

/** Site plate also appears this long before landing, whatever the phase (s). */
const LUNAR_SITE_LEAD_S = 3600;

/**
 * Site plate visible from ~1 h before landing through terminal phases.
 */
export function nearMoonPhase(phase: string, missionT: number, landT: number): boolean {
  return LUNAR_SITE_PHASES.has(phase) || missionT >= landT - LUNAR_SITE_LEAD_S;
}

/**
 * Dust layers on during low-alt descent/landed, or any time after `"landed"`.
 */
export function dustActive(phase: string, altMoon: number): boolean {
  const low = LUNAR_DUST_PHASES.has(phase) && altMoon < TERMINAL_ALT_GATE_KM;
  return low || phase === "landed";
}

/**
 * Post-splash spray: spike at contact then fade — denser white steam (V17).
 */
export function splashdownSpray(missionT: number, landT: number): ExpandOpacity {
  const age = Math.max(0, missionT - landT);
  const u = Math.min(1, age / 90);
  const spike = 1 + 0.85 * Math.exp(-age / 1.5);
  return {
    expand: 14 + u * 58,
    opacity: 0.82 * spike * Math.exp(-age / 170),
  };
}

/**
 * Terminal-descent spray from Earth altitude (km) — denser near water.
 */
export function descentSpray(altEarth: number): ExpandOpacity {
  return {
    expand: clampRange(7 + (20 - altEarth) * 1.35, 4, 34),
    opacity: clampRange(0.18 + (15 - altEarth) * 0.035, 0.1, 0.72),
  };
}

/**
 * Route splash spray to splashdown vs descent curves.
 */
export function sprayExpandOpacity(
  missionT: number,
  landT: number,
  phase: string,
  altEarth: number,
): ExpandOpacity {
  if (phase === "splashdown" || missionT >= landT) return splashdownSpray(missionT, landT);
  if (phase === "descent") return descentSpray(altEarth);
  return { expand: 5, opacity: 0.1 };
}

/** Phases that show the splash site outright. */
const SPLASH_SITE_PHASES: ReadonlySet<string> = new Set([
  "entry", "descent", "splashdown",
]);

/** Phases whose spray is on regardless of altitude. */
const SPLASH_SPRAY_PHASES: ReadonlySet<string> = new Set(["descent", "splashdown"]);

/** Splash site also appears this long before splash, whatever the phase (s). */
const SPLASH_SITE_LEAD_S = 2400;

/** Late entry raises spray only below this altitude (km). */
const ENTRY_SPRAY_ALT_KM = 25;

/**
 * Splash site visible from ~40 min before splash through terminal phases.
 */
export function shouldShowSplashSite(phase: string, missionT: number, landT: number): boolean {
  return SPLASH_SITE_PHASES.has(phase) || missionT >= landT - SPLASH_SITE_LEAD_S;
}

/**
 * Spray layers on during descent/splashdown, or late entry below 25 km.
 */
export function nearSplash(phase: string, altEarth: number): boolean {
  return (
    SPLASH_SPRAY_PHASES.has(phase) ||
    (phase === "entry" && altEarth < ENTRY_SPRAY_ALT_KM)
  );
}

/**
 * Dark contact disc opacity from altitude. Off above {@link CONTACT_FADE_ALT_KM}.
 *
 * @param altKm - Height above the landing / splash surface (km)
 */
export function contactCueOpacity(altKm: number): number {
  if (!Number.isFinite(altKm) || altKm > CONTACT_FADE_ALT_KM) return 0;
  return clamp01((CONTACT_FADE_ALT_KM - altKm) / CONTACT_FADE_ALT_KM) * 0.35;
}

/**
 * Contact disc radius (km). Shrinks slightly as the craft settles.
 *
 * @param altKm - Height above the surface (km)
 */
export function contactCueExpand(altKm: number): number {
  return 0.28 + 0.55 * clamp01(1 - altKm / CONTACT_FADE_ALT_KM);
}

/**
 * Descent-burn engine wash on the lunar surface [0, 1].
 * Brightens dust and a local point light — theater, not a radiance model.
 */
export function landingWashStrength(
  phase: string,
  burning: boolean,
  altMoon: number,
): number {
  if (!(phase === "descent" && burning)) return 0;
  if (!Number.isFinite(altMoon) || altMoon > 25) return 0;
  return clamp01((25 - altMoon) / 25);
}

/** Beacon pulse angular rate (rad per wall millisecond). */
export const BEACON_PULSE_RATE = 0.004;

/**
 * Site-beacon opacity: breathes while the craft is within `nearKm`, otherwise
 * holds `idleOpacity`.
 *
 * Driven by wall clock rather than mission time on purpose — the beacon keeps
 * pulsing while playback is paused, so it is the one terminal cue that is not
 * scrub-deterministic.
 *
 * @param wallMs - Wall clock (ms), e.g. `performance.now()`
 * @param distKm - Craft distance to the site (km)
 * @param nearKm - Pulse only inside this range (km)
 * @param idleOpacity - Steady opacity when far away
 */
export function beaconPulseOpacity(
  wallMs: number,
  distKm: number,
  nearKm: number,
  idleOpacity: number,
): number {
  if (!(distKm < nearKm)) return idleOpacity;
  return 0.55 + 0.35 * Math.sin(wallMs * BEACON_PULSE_RATE);
}

function discLayerPose(
  base: ExpandOpacity,
  active: boolean,
  expandMul: number,
  opacityMul: number,
): TerminalLayerPose {
  const opacity = base.opacity * opacityMul;
  return {
    visible: active && opacity > 0.01,
    expand: base.expand * expandMul,
    height: 0,
    opacity,
  };
}

/**
 * Vertical sheet: brief window around touchdown / splash, taller at contact.
 *
 * @param age - `missionT - landT` (s); negative during late descent
 * @param baseOpacity - Envelope from the disc curve
 * @param altKm - Surface altitude (km); sheet stays off until low
 * @param active - Parent dust/spray gate
 */
export function sheetLayerPose(
  age: number,
  baseOpacity: number,
  altKm: number,
  active: boolean,
): TerminalLayerPose {
  const near = altKm < 8 || age >= 0;
  const inWindow = age > -6 && age < 22;
  const fade = Math.exp(-Math.max(0, age) / 10);
  const pre = age < 0 ? 0.55 : 1;
  const opacity = baseOpacity * 1.15 * fade * pre;
  const visible = active && near && inWindow && opacity > 0.02;
  return {
    visible,
    expand: 6 + 8 * clamp01((age + 4) / 10),
    height: 3.5 + 11 * Math.exp(-Math.max(0, age) / 8),
    opacity,
  };
}

function contactPose(altKm: number, active: boolean): ContactCuePose {
  const opacity = contactCueOpacity(altKm);
  return {
    visible: active && opacity > 0.01,
    expand: contactCueExpand(altKm),
    opacity,
  };
}

function layersFromBase(
  base: ExpandOpacity,
  active: boolean,
  age: number,
  altKm: number,
): Pick<LunarDustDerived, "inner" | "outer" | "sheet" | "contact"> {
  return {
    inner: discLayerPose(base, active, INNER_EXPAND, INNER_OPACITY),
    outer: discLayerPose(base, active, OUTER_EXPAND, OUTER_OPACITY),
    sheet: sheetLayerPose(age, base.opacity, altKm, active),
    contact: contactPose(altKm, active),
  };
}

/**
 * Derive all lunar dust poses from mission state (single pure entry point).
 *
 * @param state - Mission dust input
 * @returns Immutable bundle (same inputs → same outputs)
 */
export function deriveLunarDust(state: LunarDustState): LunarDustDerived {
  const siteVisible = nearMoonPhase(state.phase, state.missionT, state.landT);
  const active = dustActive(state.phase, state.altMoon);
  const base = dustExpandOpacity(
    state.missionT, state.landT, state.phase, state.burning, state.altMoon,
  );
  const age = state.missionT - state.landT;
  return {
    siteVisible,
    active,
    base,
    ...layersFromBase(base, active, age, state.altMoon),
  };
}

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

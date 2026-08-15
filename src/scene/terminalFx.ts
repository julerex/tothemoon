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
}>;

/** Dust / spray visible below this altitude (km). */
export const TERMINAL_ALT_GATE_KM = 40;
/** Contact-cue fully off above this altitude (km). */
export const CONTACT_FADE_ALT_KM = 3;

const INNER_EXPAND = 0.42;
const INNER_OPACITY = 1.18;
const OUTER_EXPAND = 1.62;
const OUTER_OPACITY = 0.42;

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

/**
 * Site plate visible from ~1 h before landing through terminal phases.
 */
export function nearMoonPhase(phase: string, missionT: number, landT: number): boolean {
  return (
    phase === "approach" ||
    phase === "braking" ||
    phase === "descent" ||
    phase === "landed" ||
    missionT >= landT - 3600
  );
}

/**
 * Dust layers on during low-alt descent/landed, or any time after `"landed"`.
 */
export function dustActive(phase: string, altMoon: number): boolean {
  const low = (phase === "descent" || phase === "landed") && altMoon < TERMINAL_ALT_GATE_KM;
  return low || phase === "landed";
}

/**
 * Post-splash spray: spike at contact then faster fade than lunar dust.
 */
export function splashdownSpray(missionT: number, landT: number): ExpandOpacity {
  const age = Math.max(0, missionT - landT);
  const u = Math.min(1, age / 80);
  const spike = 1 + 0.7 * Math.exp(-age / 1.4);
  return {
    expand: 12 + u * 50,
    opacity: 0.55 * spike * Math.exp(-age / 150),
  };
}

/**
 * Terminal-descent spray from Earth altitude (km).
 */
export function descentSpray(altEarth: number): ExpandOpacity {
  return {
    expand: clampRange(6 + (20 - altEarth) * 1.2, 4, 30),
    opacity: clampRange(0.12 + (15 - altEarth) * 0.025, 0.08, 0.5),
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

/**
 * Splash site visible from ~40 min before splash through terminal phases.
 */
export function shouldShowSplashSite(phase: string, missionT: number, landT: number): boolean {
  return (
    phase === "entry" ||
    phase === "descent" ||
    phase === "splashdown" ||
    missionT >= landT - 2400
  );
}

/**
 * Spray layers on during descent/splashdown, or late entry below 25 km.
 */
export function nearSplash(phase: string, altEarth: number): boolean {
  return (
    phase === "descent" ||
    phase === "splashdown" ||
    (phase === "entry" && altEarth < 25)
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
    ...layersFromBase(base, active, age, state.altEarth),
  };
}

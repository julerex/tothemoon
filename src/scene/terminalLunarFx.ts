/**
 * Pure terminal FX — lunar dust and ocean splash strengths / layer poses.
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

import { clamp01, clampRange } from "./terminalFxMath";

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

export function discLayerPose(
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

export function contactPose(altKm: number, active: boolean): ContactCuePose {
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


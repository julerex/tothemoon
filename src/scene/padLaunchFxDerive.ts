/**
 * Pad launch FX derive — mission-state scalars (flame, steam, haze, vent, floods).
 *
 * Scrub-safe: all time dependence uses mission `t`, not wall-clock.
 */

import { clamp01, smoothstep } from "./padLaunchFxMath";
import { ENGINE_START_T, FLAME_DIVERTER_T } from "./padLaunchFxSpecs";

/**
 * Mission-time pad FX input (from the active sample + lighting).
 *
 * Liftoff is `missionT === 0`. Negative values are the pre-liftoff countdown
 * window (tank-farm vent steam, pad-ops floods). Callers typically pass the
 * same fields already available on the mission sample / theater tick.
 */
export type LaunchPadFxState = {
  /**
   * Mission clock seconds. Liftoff = 0; negative = T− hold
   * (e.g. transport u maps −300…0 before light).
   */
  missionT: number;
  /**
   * Timeline phase id (`launch`, `ascent`, `coast`, …).
   * Gates flame / steam to pad-relevant phases.
   */
  phase: string;
  /**
   * Whether engines are thrusting this sample.
   * Flame trench FX require `true` and `missionT >= 0`.
   */
  burning: boolean;
  /** Altitude above Earth surface (km). Fades pad FX as the stack climbs. */
  altEarth: number;
  /**
   * Sun elevation cue at Starbase: ≈1 high day, ≈0 civil twilight,
   * negative ≈ night. Usually `sun · localUp` at the pad. Defaults to a
   * mild daytime when omitted so daylight missions stay readable.
   */
  sunElev?: number;
};

/**
 * Day / night blend for pad floods and steam backlighting.
 * `day + night === 1` (within float error).
 */
export type PadDayNight = Readonly<{
  /** 1 = high midday sun, 0 = deep night. */
  day: number;
  /** 1 − day. */
  night: number;
}>;

/**
 * Map sun elevation to a soft day/night pair for flood balance.
 *
 * Twilight band is roughly elev ∈ [−0.08, 0.22] (smoothstep). Outside that
 * range the pad is fully day or fully night. Missing elev defaults to mild day
 * so tests / older callers do not go pitch-black.
 *
 * @param sunElev - `sun · padUp`, or `undefined` for default day
 */
export function padDayNight(sunElev: number | undefined): PadDayNight {
  const elev = sunElev ?? 0.4;
  const day = smoothstep(-0.08, 0.22, elev);
  return { day, night: 1 - day };
}

/**
 * Flame-trench intensity bundle: gate + fade + flicker + final strength.
 * Shared by flame mesh, tongues, plume point light, and ground bloom.
 */
export type PadFlameBundle = Readonly<{
  /** True when engines should light the trench (phase + burn + t≥0). */
  active: boolean;
  /** Altitude fade in [0, 1]; ~0 by ~18 km. */
  altFade: number;
  /** Deterministic flicker mult (~0.86–1); uses max(0, missionT). */
  flicker: number;
  /** Final strength: `active ? altFade * flicker : 0`. */
  strength: number;
}>;

/**
 * Flame / tongue / plume-light strength from mission state.
 *
 * Active only while burning on pad-like phases (`launch`, early `ascent`
 * below 25 km) and after liftoff (`missionT >= 0`). Flicker is a cheap dual
 * sine of mission time (scrub-stable).
 */
function padFlameActive(state: LaunchPadFxState): boolean {
  const onPadPhase =
    state.phase === "launch" ||
    (state.phase === "ascent" && state.altEarth < 25);
  return state.burning && onPadPhase && state.missionT >= 0;
}

function padFlameFlicker(missionT: number): number {
  // Prelaunch (t < 0) does not flicker flame — clamp for the sin clock only
  const t = Math.max(0, missionT);
  return 0.9 + 0.06 * Math.sin(t * 41.2) + 0.04 * Math.sin(t * 77.5 + 0.7);
}

export function padFlameStrength(state: LaunchPadFxState): PadFlameBundle {
  const active = padFlameActive(state);
  const altFade = clamp01(1 - state.altEarth / 18);
  const flicker = padFlameFlicker(state.missionT);
  const strength = active ? altFade * flicker : 0;
  return { active, altFade, flicker, strength };
}

function onPadLaunchPhase(state: LaunchPadFxState): boolean {
  return state.phase === "launch" || state.phase === "ascent";
}

/**
 * Water-deluge / flame-deflector envelope.
 *
 * SpaceX countdown lights the **flame diverter** at T−17: water is forced
 * through the steel plate under the OLM (sound suppression + thermal
 * protection). Independent of the `burning` flag so T− hold still shows the
 * rush of water (prelaunch theaters force `burning` false).
 *
 * @returns Deluge jet strength in [0, 1]
 */
export function padDelugeStrength(state: LaunchPadFxState): number {
  if (!onPadLaunchPhase(state) || state.altEarth >= 8 || state.missionT >= 40) {
    return 0;
  }
  if (state.missionT < FLAME_DIVERTER_T) return 0;
  const rise = smoothstep(FLAME_DIVERTER_T, FLAME_DIVERTER_T + 4, state.missionT);
  const fall = 1 - smoothstep(10, 36, state.missionT);
  return rise * fall;
}

/**
 * Deluge steam envelope — water flashing plus engine-warmed cloud.
 *
 * Pre-liftoff: flame-diverter mist, punching up at engine start (T−3).
 * Post-liftoff: hangs through thicker atmosphere (~30 km fade, hard cut 35 km)
 * while engines burn. True-scale cloud around the OLM, not a multi-km fog.
 *
 * @returns Steam strength in [0, 1]
 */
export function padSteamStrength(state: LaunchPadFxState): number {
  if (state.altEarth >= 35 || state.missionT >= 180) return 0;
  if (!onPadLaunchPhase(state)) return 0;
  if (state.missionT < 0) {
    const deluge = padDelugeStrength(state);
    const ignite = smoothstep(ENGINE_START_T, -0.4, state.missionT);
    return clamp01(deluge * (0.7 + 0.3 * ignite));
  }
  if (!state.burning) return 0;
  return clamp01(1 - state.altEarth / 30);
}

/**
 * Heat-haze peak over the trench (visual V3).
 *
 * Strongest in the first seconds after light (`missionT` small), then eases
 * over ~25 s, and dies by ~4 km altitude. Multiplied by flame strength so
 * haze never appears without thrust.
 *
 * @param flameStrength - From {@link padFlameStrength}.strength
 * @param missionT - Mission clock (s)
 * @param altEarth - Altitude (km)
 * @returns Peak scalar ≥ 0 used by {@link hazeSpritePose}
 */
export function padHazePeak(
  flameStrength: number,
  missionT: number,
  altEarth: number,
): number {
  // Clamp time fade into [0.15, 1] so residual shimmer lasts past peak roar
  const timeFade = Math.min(
    1,
    Math.max(0.15, 1 - Math.max(0, missionT) / 25),
  );
  const altFade = clamp01(1 - altEarth / 4);
  return flameStrength * timeFade * altFade;
}

/**
 * Tank-farm vent steam strength.
 *
 * - **T− hold** (`missionT < 0`): full webcast-style plume with slow sin pulse  
 * - **Post-liftoff** (t &lt; 90 s, alt &lt; 12 km): linear ease-out  
 * - **Engines lit** (`flameStrength > 0.2`): ×0.55 so deluge owns the frame  
 *
 * @param state - Mission pad state
 * @param flameStrength - Current trench flame strength
 * @param animT - Animation clock (defaults to `state.missionT`; may be negative)
 * @returns Vent strength ≥ 0
 */
export function padVentStrength(
  state: LaunchPadFxState,
  flameStrength: number,
  animT: number = state.missionT,
): number {
  let ventStr = 0;
  if (state.missionT < 0) {
    // Full hold plume (SpaceX webcast look)
    ventStr = 0.85 + 0.15 * Math.sin(animT * 0.7);
  } else if (state.missionT < 90 && state.altEarth < 12) {
    ventStr = clamp01(1 - state.missionT / 90) * 0.75;
  }
  if (flameStrength > 0.2) ventStr *= 0.55;
  const deluge = padDelugeStrength(state);
  if (deluge > 0.15) ventStr *= 1 - 0.92 * deluge;
  return ventStr;
}

/**
 * Whether pad-ops lighting is on, plus the night-led flood base intensity.
 * `floodBase` is already day/night weighted (tiny residual in full day).
 */
export type PadOpsLights = Readonly<{
  /** True while the stack is near the complex or on countdown. */
  padOps: boolean;
  /** Spot base intensity before per-index / plume dimming. */
  floodBase: number;
}>;

/**
 * Flood / pad-ops gate and night-led flood base intensity (visual V0.1).
 *
 * Floods are strong at night and very restrained by day so sun + geometry
 * read cleanly. Ops stay on through countdown, early ascent near pad, and
 * briefly after liftoff on the launch phase.
 */
function isNearPadOps(state: LaunchPadFxState): boolean {
  return (
    state.phase === "launch" ||
    (state.phase === "ascent" && state.altEarth < 8) ||
    state.missionT < 30 ||
    state.missionT < 0 ||
    (state.phase === "launch" && state.missionT < 120)
  );
}

export function padOpsLights(
  state: LaunchPadFxState,
  dayNight: PadDayNight,
): PadOpsLights {
  const padOps = isNearPadOps(state);
  const floodBase = padOps ? 0.04 * dayNight.day + 1.2 * dayNight.night : 0;
  return { padOps, floodBase };
}

/**
 * Full derived scalar bundle for one pad FX tick.
 * Produced by {@link derivePadFx}; consumed by `updateStarbaseLaunchFx`.
 */
export type PadFxDerived = Readonly<{
  /** Mission-time animation clock (may be negative on hold). */
  animT: number;
  day: number;
  night: number;
  flame: PadFlameBundle;
  /** Deluge steam envelope [0, 1]. */
  steamStr: number;
  /** Flame-diverter water-jet envelope [0, 1]. */
  delugeStr: number;
  /** Heat-haze peak scalar. */
  hazePeak: number;
  /** Tank-farm vent envelope. */
  ventStr: number;
  padOps: boolean;
  floodBase: number;
}>;

/**
 * Derive all pad FX scalars from mission state (single pure entry point).
 *
 * Prefer this over calling individual strength helpers when applying a full
 * frame so day/night, flame, steam, haze, vent, and floods stay consistent.
 *
 * @param state - Mission pad input
 * @returns Immutable derived bundle (same inputs → same outputs)
 */
function padFxScalars(state: LaunchPadFxState, flame: PadFlameBundle, animT: number) {
  return {
    steamStr: padSteamStrength(state),
    delugeStr: padDelugeStrength(state),
    hazePeak: padHazePeak(flame.strength, state.missionT, state.altEarth),
    ventStr: padVentStrength(state, flame.strength, animT),
  };
}

export function derivePadFx(state: LaunchPadFxState): PadFxDerived {
  const animT = state.missionT;
  const { day, night } = padDayNight(state.sunElev);
  const flame = padFlameStrength(state);
  const lights = padOpsLights(state, { day, night });
  return { animT, day, night, flame, ...padFxScalars(state, flame, animT), ...lights };
}

/**
 * Pure Super Heavy cryo frost + ice-shed FX (visual V14.2).
 *
 * Webcast stills: frost sheets on the booster at T+0; flakes and mist peeling
 * at T+16. Strengths and flake poses are scrub-safe (mission `t` / phase /
 * altitude only — no `performance.now()`).
 *
 * ```
 * FrostFxState  →  frostStrength() / iceShedStrength()  →  iceFlakePose()
 *                              ↓
 *                    craft.updateCraftVisuals  (THREE only)
 * ```
 *
 * Theater-grade: translucent barrel patches + sparse billboards, not CFD ice.
 *
 * @see craft.updateCraftVisuals — impure applicator
 * @see docs/VISUAL_REALISM.md — V14 ascent frost / ice shed
 */

import { clamp01, smoothstep, type SpritePose } from "./padLaunchFx";

/**
 * Mission-time frost input (subset of craft visual state).
 * Liftoff is `missionT === 0`; negative values are the T− hold.
 */
export type FrostFxState = {
  missionT: number;
  /** Timeline phase id (`launch`, `ascent`, `coast`, …). */
  phase: string | undefined;
  /** Engines thrusting this sample (ice shed only while burning). */
  burning: boolean;
  /** Altitude above Earth (km). Frost is gone by vacuum. */
  altEarth: number;
};

/** One frost band on the Super Heavy barrel (fractions of booster height). */
export type FrostPatchSpec = Readonly<{
  /** Band center as a fraction of booster height (0 = engines, 1 = interstage). */
  zFrac: number;
  /** Band height as a fraction of booster height. */
  hFrac: number;
  /** Radius multiplier vs the 9 m barrel. */
  rMul: number;
  /** Animation phase so bands do not pulse in lockstep. */
  phase: number;
}>;

/**
 * Translucent frost sheets on Super Heavy (not the ship).
 * Sparse enough that stainless still reads between bands.
 */
export const FROST_PATCHES: readonly FrostPatchSpec[] = [
  { zFrac: 0.48, hFrac: 0.82, rMul: 1.014, phase: 0.0 },
  { zFrac: 0.18, hFrac: 0.16, rMul: 1.02, phase: 0.2 },
  { zFrac: 0.36, hFrac: 0.2, rMul: 1.022, phase: 1.1 },
  { zFrac: 0.55, hFrac: 0.18, rMul: 1.018, phase: 2.0 },
  { zFrac: 0.72, hFrac: 0.14, rMul: 1.021, phase: 2.8 },
  { zFrac: 0.86, hFrac: 0.1, rMul: 1.017, phase: 3.6 },
];

/** One ice-flake billboard peeling off the booster during dense-atmosphere burn. */
export type IceFlakeSpec = Readonly<{
  /** Azimuth around +Z (rad). */
  ang: number;
  /** Rest radius in craft mesh units (just outside the barrel). */
  r0: number;
  /** Rest height in craft mesh units (booster-local +Z). */
  z0: number;
  /** Rest uniform scale (mesh units). */
  scale: number;
  /** Animation phase. */
  phase: number;
}>;

/**
 * Sparse ice chips around Super Heavy. Count stays small so chase/pad cams
 * read “shedding frost,” not a particle blizzard.
 */
export const ICE_FLAKES: readonly IceFlakeSpec[] = [
  { ang: 0.4, r0: 0.13, z0: 0.35, scale: 0.055, phase: 0.3 },
  { ang: 1.3, r0: 0.125, z0: 0.62, scale: 0.048, phase: 1.0 },
  { ang: 2.2, r0: 0.14, z0: 0.88, scale: 0.062, phase: 1.7 },
  { ang: 3.05, r0: 0.12, z0: 1.12, scale: 0.05, phase: 2.4 },
  { ang: 3.9, r0: 0.135, z0: 0.48, scale: 0.058, phase: 3.1 },
  { ang: 4.7, r0: 0.128, z0: 1.35, scale: 0.046, phase: 3.8 },
  { ang: 5.5, r0: 0.142, z0: 0.72, scale: 0.06, phase: 4.5 },
  { ang: 0.9, r0: 0.118, z0: 1.52, scale: 0.052, phase: 5.2 },
  { ang: 2.7, r0: 0.15, z0: 0.22, scale: 0.05, phase: 5.9 },
  { ang: 5.1, r0: 0.122, z0: 1.05, scale: 0.049, phase: 6.4 },
];

function onPadAscent(phase: string | undefined, missionT: number): boolean {
  if (phase === "launch" || phase === "ascent") return true;
  // Countdown hold is still launch-adjacent even if phase is unset
  return missionT < 0;
}

/**
 * Frost sheet envelope on Super Heavy.
 *
 * - **T− hold:** near-full cryo coating  
 * - **Liftoff → max-Q:** linear ease-out (sheets peel as ice shed takes over)  
 * - **Gone** by ~50 km or ~2 min, or off pad/ascent
 *
 * @returns Frost opacity envelope in [0, 1]
 */
export function frostStrength(state: FrostFxState): number {
  if (!onPadAscent(state.phase, state.missionT)) return 0;
  if (state.altEarth >= 50) return 0;
  if (state.missionT >= 120) return 0;
  const altFade = clamp01(1 - state.altEarth / 40);
  if (state.missionT < 0) {
    return (0.88 + 0.1 * Math.sin(state.missionT * 0.45)) * altFade;
  }
  const timeFade = clamp01(1 - state.missionT / 90);
  return 0.95 * timeFade * altFade;
}

/**
 * Ice-flake shed envelope — peaks in the first tens of seconds after light
 * while frost is still present, then dies before vacuum.
 *
 * @returns Ice-shed strength in [0, 1]
 */
export function iceShedStrength(state: FrostFxState): number {
  if (!state.burning) return 0;
  if (!onPadAscent(state.phase, state.missionT)) return 0;
  if (state.missionT < 2 || state.missionT > 80) return 0;
  if (state.altEarth >= 35) return 0;
  const altFade = clamp01(1 - state.altEarth / 30);
  const rise = smoothstep(2, 10, state.missionT);
  const fall = 1 - smoothstep(40, 72, state.missionT);
  return rise * fall * altFade;
}

/**
 * Per-band frost opacity. Stays translucent so stainless oil-canning still
 * reads between sheets.
 */
export function frostPatchOpacity(
  frostStr: number,
  phase: number,
  animT: number,
): number {
  const wobble = 0.9 + 0.1 * Math.sin(animT * 0.55 + phase);
  return 0.88 * frostStr * wobble;
}

function flakeRadius(spec: IceFlakeSpec, iceStr: number, animT: number): number {
  return (
    spec.r0 +
    iceStr * (0.12 + 0.04 * spec.scale * 10) +
    0.018 * Math.sin(animT * 1.6 + spec.phase)
  );
}

function flakePosition(spec: IceFlakeSpec, iceStr: number, animT: number): SpritePose["position"] {
  const r = flakeRadius(spec, iceStr, animT);
  return {
    x: Math.cos(spec.ang) * r,
    y: Math.sin(spec.ang) * r,
    z: spec.z0 - iceStr * 0.1 + 0.02 * Math.sin(animT * 2.1 + spec.phase),
  };
}

/**
 * Pose for one ice-flake billboard. Flakes drift outward and slightly aft
 * (toward the engines, −Z in craft mesh) as shed strength rises.
 */
export function iceFlakePose(
  spec: IceFlakeSpec,
  iceStr: number,
  animT: number,
): SpritePose {
  const wobble = 0.78 + 0.22 * Math.sin(animT * 3.4 + spec.phase);
  const grow = spec.scale * (0.85 + iceStr * 1.15);
  return {
    opacity: 0.62 * iceStr * wobble,
    scale: { x: grow * 1.35, y: grow * 1.05 },
    position: flakePosition(spec, iceStr, animT),
  };
}

/**
 * Pad launch FX poses and mesh/light scalars — sprite poses and visual helpers.
 *
 * No THREE dependency; consumed by `updateStarbaseLaunchFx`.
 */

import { clamp01, type Scale2, type SpritePose, type Vec3 } from "./padLaunchFxMath";

/**
 * Rest / identity fields stored on each steam sprite's `userData` at create time.
 * `tier` selects outer-ring opacity/loft multipliers.
 */
export type SteamSpriteBase = Readonly<{
  baseAng: number;
  baseR: number;
  baseY: number;
  baseScale: number;
  phase: number;
  /** 0 = OLM lip, higher = lofted tiers. */
  tier: number;
}>;

/**
 * Pose for one deluge-ring steam sprite.
 *
 * Slow azimuthal drift + vertical loft scale with `steamStr`. Night slightly
 * boosts opacity so steam reads against floods. Outer tiers thin out.
 *
 * @param base - Rest pose from construction `userData`
 * @param steamStr - From {@link padSteamStrength}
 * @param night - From {@link padDayNight}
 * @param animT - Mission-time clock
 */
function steamOpacity(base: SteamSpriteBase, steamStr: number, night: number, animT: number): number {
  const tierOp = 1 - base.tier * 0.16;
  const wobble = 0.88 + 0.12 * Math.sin(animT * 3.1 + base.phase);
  // Thin + mid-gray (see steamTintRgb) so stacked rings stay under bloom.
  return (0.18 + 0.08 * night) * steamStr * wobble * tierOp;
}

function steamGrow(base: SteamSpriteBase, steamStr: number, animT: number): number {
  return base.baseScale * (0.95 + steamStr * 0.55) + 0.006 * Math.sin(animT * 2.2 + base.phase);
}

function steamPosition(base: SteamSpriteBase, steamStr: number, animT: number): Vec3 {
  const r = base.baseR + steamStr * (0.01 + base.tier * 0.006) + 0.003 * Math.sin(animT * 1.7 + base.phase);
  const ang = base.baseAng + animT * 0.04;
  return {
    x: Math.cos(ang) * r,
    y: base.baseY + steamStr * (0.008 + base.tier * 0.006) + 0.003 * Math.sin(animT * 2.5 + base.phase),
    z: Math.sin(ang) * r,
  };
}

export function steamSpritePose(
  base: SteamSpriteBase,
  steamStr: number,
  night: number,
  animT: number,
): SpritePose {
  const grow = steamGrow(base, steamStr, animT);
  return {
    opacity: steamOpacity(base, steamStr, night, animT),
    scale: { x: grow, y: grow },
    position: steamPosition(base, steamStr, animT),
  };
}

/**
 * Rest fields for a deluge sheet curtain (from {@link DELUGE_SHEETS} + userData).
 */
export type SheetSpriteBase = Readonly<{
  baseX: number;
  baseY: number;
  baseZ: number;
  baseSx: number;
  baseSy: number;
  phase: number;
}>;

/**
 * Pose for one trench-aligned deluge sheet (stretched billboard).
 * Vertical scale pulses harder than horizontal so curtains “breathe.”
 */
function sheetScale(base: SheetSpriteBase, steamStr: number, animT: number): Scale2 {
  const sx = base.baseSx * (1.0 + steamStr * 0.65);
  const sy = base.baseSy * (0.9 + steamStr * 0.55 + 0.06 * Math.sin(animT * 3.3 + base.phase));
  return { x: sx, y: sy };
}

function sheetPosition(base: SheetSpriteBase, steamStr: number, animT: number): Vec3 {
  return {
    x: base.baseX + 0.003 * Math.sin(animT * 2.1 + base.phase),
    y: base.baseY + steamStr * 0.014 + 0.004 * Math.sin(animT * 2.8 + base.phase),
    z: base.baseZ + 0.002 * Math.cos(animT * 1.9 + base.phase),
  };
}

export function sheetSpritePose(
  base: SheetSpriteBase,
  steamStr: number,
  night: number,
  animT: number,
): SpritePose {
  const wobble = 0.85 + 0.15 * Math.sin(animT * 4.2 + base.phase);
  return {
    opacity: (0.20 + 0.08 * night) * steamStr * wobble,
    scale: sheetScale(base, steamStr, animT),
    position: sheetPosition(base, steamStr, animT),
  };
}

/**
 * Pose for a ground-hugging steam sheet (visual V14.3).
 * Wider than tall; loft is tiny so the cloud stays on the apron.
 */
export function groundSheetPose(
  base: SheetSpriteBase,
  steamStr: number,
  night: number,
  animT: number,
): SpritePose {
  const wobble = 0.86 + 0.14 * Math.sin(animT * 3.6 + base.phase);
  const sx = base.baseSx * (1.1 + steamStr * 0.8);
  const sy = base.baseSy * (0.95 + steamStr * 0.35 + 0.04 * Math.sin(animT * 2.4 + base.phase));
  return {
    opacity: (0.22 + 0.08 * night) * steamStr * wobble,
    scale: { x: sx, y: sy },
    position: {
      x: base.baseX + 0.004 * Math.sin(animT * 1.8 + base.phase),
      y: base.baseY + steamStr * 0.006 + 0.002 * Math.sin(animT * 2.2 + base.phase),
      z: base.baseZ + 0.003 * Math.cos(animT * 1.6 + base.phase),
    },
  };
}

/**
 * Rest fields for a heat-haze sprite (`baseZ` along trench, fixed `phase`).
 */
export type HazeSpriteBase = Readonly<{
  baseZ: number;
  phase: number;
}>;

/**
 * Pose for one heat-haze shimmer above the trench.
 *
 * Additive-style opacity (caller uses additive blending). Fast sin rates give
 * a refractive shimmer without real distortion — theater cue only.
 *
 * @param hazePeak - From {@link padHazePeak}
 */
function hazeScale(base: HazeSpriteBase, hazePeak: number, animT: number): Scale2 {
  return {
    x: 0.024 + 0.02 * hazePeak + 0.006 * Math.sin(animT * 11 + base.phase),
    y: 0.018 + 0.028 * hazePeak + 0.008 * Math.sin(animT * 14.2 + base.phase * 1.3),
  };
}

function hazePosition(base: HazeSpriteBase, hazePeak: number, animT: number): Vec3 {
  return {
    x: 0.003 * Math.sin(animT * 9.1 + base.phase),
    y: 0.012 + hazePeak * 0.018 + 0.004 * Math.sin(animT * 12.5 + base.phase),
    z: base.baseZ + 0.002 * Math.cos(animT * 8.3 + base.phase),
  };
}

export function hazeSpritePose(
  base: HazeSpriteBase,
  hazePeak: number,
  animT: number,
): SpritePose {
  const shimmer = 0.75 + 0.25 * Math.sin(animT * 18.5 + base.phase);
  return {
    opacity: 0.22 * hazePeak * shimmer,
    scale: hazeScale(base, hazePeak, animT),
    position: hazePosition(base, hazePeak, animT),
  };
}

/**
 * Rest fields for a tank-farm vent sprite (anchors from {@link VENT_ANCHORS}).
 */
export type VentSpriteBase = Readonly<{
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
}>;

/**
 * Pose for one tank-farm vent plume sprite.
 * Taller than wide (scale Y > X) so hold steam reads as rising columns.
 */
function ventPosition(base: VentSpriteBase, ventStr: number, animT: number): Vec3 {
  return {
    x: base.baseX + 0.012 * Math.sin(animT * 0.4 + base.phase),
    y: base.baseY + ventStr * 0.08 + 0.02 * Math.sin(animT * 1.1 + base.phase),
    z: base.baseZ + 0.01 * Math.cos(animT * 0.35 + base.phase),
  };
}

export function ventSpritePose(
  base: VentSpriteBase,
  ventStr: number,
  night: number,
  animT: number,
): SpritePose {
  const wobble = 0.8 + 0.2 * Math.sin(animT * 1.8 + base.phase);
  const grow = 0.08 + ventStr * 0.18 + 0.03 * Math.sin(animT * 1.4 + base.phase);
  return {
    opacity: (0.45 + 0.16 * night) * ventStr * wobble,
    scale: { x: grow * 1.15, y: grow * 1.4 },
    position: ventPosition(base, ventStr, animT),
  };
}

/**
 * Visibility + opacity + Y-scale for trench flame / tongue meshes.
 * `scaleY` is applied as `(1, scaleY, 1)` on the mesh.
 */
export type FlameVisual = Readonly<{
  visible: boolean;
  opacity: number;
  scaleY: number;
}>;

/**
 * Primary trench flame sheet visual from flame strength.
 * Hidden below a small threshold to avoid additive noise when “off.”
 */
export function flameVisual(strength: number): FlameVisual {
  return {
    visible: strength > 0.02,
    opacity: 0.14 * strength,
    scaleY: 0.7 + 0.5 * strength,
  };
}

/**
 * Secondary flame-tongue cones (slightly later visibility gate than the sheet).
 */
export function tongueVisual(strength: number): FlameVisual {
  return {
    visible: strength > 0.05,
    opacity: 0.08 * strength,
    scaleY: 0.6 + 0.7 * strength,
  };
}

/** Tight ground-bloom sprite under the engines (not a multi-km landmark). */
export type BloomVisual = Readonly<{
  visible: boolean;
  opacity: number;
  /** Uniform sprite scale (km). */
  scale: number;
}>;

/**
 * Tight ground bloom under the plume — restrained so the pad deck does not
 * wash out. Opacity includes flicker so the glow breathes with the flame.
 */
export function bloomVisual(strength: number, flicker: number): BloomVisual {
  return {
    visible: strength > 0.04,
    opacity: 0.055 * strength * flicker,
    scale: 0.032 + 0.03 * strength,
  };
}

/**
 * How strongly 33 engines warm the deluge cloud (visual V14.3).
 * 0 = cool gray steam; 1 = orange-pink core like T+0 webcast stills.
 */
export function steamWarmth(flameStrength: number): number {
  return clamp01(flameStrength * 0.35);
}

/**
 * Steam sprite RGB. Cool metal-white at rest; lerps toward engine-lit
 * orange-pink as {@link steamWarmth} rises.
 *
 * @returns RGB in 0–1
 */
export function steamTintRgb(
  warmth: number,
  night: number,
): readonly [number, number, number] {
  const w = clamp01(warmth);
  const coolR = 0.54 + 0.06 * night;
  const coolG = 0.57 + 0.04 * night;
  const coolB = 0.61;
  return [
    coolR + (0.78 - coolR) * w,
    coolG + (0.48 - coolG) * w,
    coolB + (0.36 - coolB) * w,
  ];
}

/**
 * Per-flood SpotLight intensity.
 *
 * Dims while the plume is roaring (avoids double-wash) and weights index 0
 * as the primary tower flood slightly brighter than secondary fixtures.
 *
 * @param floodBase - From {@link padOpsLights}
 * @param flameStrength - From {@link padFlameStrength}.strength
 * @param index - Flood index (`0` = primary)
 */
export function floodSpotIntensity(
  floodBase: number,
  flameStrength: number,
  index: number,
): number {
  const plumeDim = 1 - 0.35 * flameStrength;
  const weight = 0.85 + 0.15 * (index === 0 ? 1 : 0.75);
  return floodBase * plumeDim * weight;
}

/**
 * Spot light `distance` (km reach). Slightly longer at night so the apron reads.
 */
export function floodSpotDistance(night: number): number {
  return 0.28 + 0.1 * night;
}

/**
 * Cool ambient fill under/around the stack.
 * Night-led; tiny day residual; pulls back when flame strength is high.
 */
export function padFillIntensity(
  padOps: boolean,
  day: number,
  night: number,
  flameStrength: number,
): number {
  if (!padOps) return 0;
  return 0.03 * day + 0.55 * night * (1 - 0.7 * flameStrength);
}

/**
 * Fill light color as hex: warm when engines light the pad, cool metal-halide otherwise.
 */
export function padFillColorHex(flameStrength: number): number {
  return flameStrength > 0.1 ? 0xffe0c8 : 0xdde6f4;
}

/** Fill light `distance` (km); a bit larger at night. */
export function padFillDistance(night: number): number {
  return 0.22 + 0.08 * night;
}

/** Warm plume point-light intensity under the engines only. */
export function plumeLightIntensity(strength: number): number {
  return 0.28 * strength;
}

/** Plume point-light reach (km). */
export function plumeLightDistance(strength: number): number {
  return 0.06 + 0.04 * strength;
}

/**
 * Plume light RGB (0–1). Green channel rides flicker so the glow is not static orange.
 */
export function plumeLightRgb(
  flicker: number,
): Readonly<[number, number, number]> {
  // Trench glow stays engine-orange inside the steam (webcast T+0)
  return [1, 0.5 + 0.1 * flicker, 0.32];
}

/**
 * Emissive intensity for the small flood fixture meshes (so lamps read as real sources).
 */
export function floodFixtureEmissive(floodBase: number): number {
  return 0.15 + floodBase * 1.4;
}

/**
 * OLM ring work-lamp color hex.
 * Bright cool white at night ops; dimmer day ops; dark gray when pad ops off.
 */
export function olmLampColorHex(padOps: boolean, night: number): number {
  if (!padOps) return 0x444444;
  return night > 0.5 ? 0xf4f8ff : 0xc8d0dc;
}

/**
 * Tower beacon opacity from **wall-clock** time.
 *
 * This is the only intentional non-mission-time FX on the pad (UI pulse while
 * the page is open). Do not use for scrub-critical effects.
 *
 * @param wallT - Seconds from `performance.now()` / app clock (not mission t)
 */
export function padBeaconOpacity(wallT: number): number {
  return 0.55 + 0.4 * Math.sin(wallT * 4);
}

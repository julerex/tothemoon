/**
 * Pure pad launch FX — strengths and sprite poses from mission state.
 *
 * No THREE: scrub-safe, unit-testable. `earthTheater.updateStarbaseLaunchFx`
 * maps these values onto scene objects.
 *
 * Theater-grade (not CFD / ops imagery). All time dependence uses mission `t`
 * so scrubbing never desyncs from wall-clock-only animation.
 */

// ---------------------------------------------------------------------------
// Math (local, no THREE dependency)
// ---------------------------------------------------------------------------

/** Clamp to [0, 1]. */
export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

/** Hermite smoothstep on [edge0, edge1] → [0, 1]. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;
export type Scale2 = Readonly<{ x: number; y: number }>;

export type SpritePose = Readonly<{
  opacity: number;
  position: Vec3;
  scale: Scale2;
}>;

// ---------------------------------------------------------------------------
// Mission state input
// ---------------------------------------------------------------------------

/**
 * Mission-time pad FX input. Liftoff = 0; negative = pre-liftoff countdown
 * (tank-farm vent steam / pad-ops lights).
 */
export type LaunchPadFxState = {
  missionT: number;
  phase: string;
  burning: boolean;
  /** Altitude above Earth surface (km). */
  altEarth: number;
  /**
   * Sun elevation factor at Starbase: 1 = high day, 0 = civil twilight,
   * negative ≈ night. From sun·localUp.
   */
  sunElev?: number;
};

// ---------------------------------------------------------------------------
// Layout specs (data) — construction + pose bases share one source of truth
// ---------------------------------------------------------------------------

export type SteamTierSpec = Readonly<{
  n: number;
  r0: number;
  y0: number;
  scale: number;
  color: number;
}>;

/** Multi-tier deluge ring around OLM (V3). */
export const STEAM_TIERS: readonly SteamTierSpec[] = [
  { n: 10, r0: 0.028, y0: 0.012, scale: 0.07, color: 0xe0e6ec },
  { n: 8, r0: 0.045, y0: 0.028, scale: 0.11, color: 0xd0d6de },
  { n: 6, r0: 0.062, y0: 0.05, scale: 0.15, color: 0xc4cad2 },
];

export type DelugeSheetSpec = Readonly<{
  pos: readonly [number, number, number];
  sx: number;
  sy: number;
  phase: number;
}>;

/** Sheet curtains along trench (V3 volumetric deluge). */
export const DELUGE_SHEETS: readonly DelugeSheetSpec[] = [
  { pos: [0.012, 0.018, 0], sx: 0.055, sy: 0.04, phase: 0.2 },
  { pos: [-0.012, 0.016, 0], sx: 0.05, sy: 0.038, phase: 1.1 },
  { pos: [0, 0.022, 0.022], sx: 0.04, sy: 0.045, phase: 2.0 },
  { pos: [0, 0.02, -0.022], sx: 0.042, sy: 0.042, phase: 2.8 },
  { pos: [0.008, 0.03, 0.01], sx: 0.06, sy: 0.05, phase: 3.5 },
  { pos: [-0.006, 0.032, -0.008], sx: 0.058, sy: 0.048, phase: 4.2 },
];

/** Tank-farm vent sprite anchors (km, pad frame). */
export const VENT_ANCHORS: readonly (readonly [number, number, number])[] = [
  [0.095, 0.014, 0.035],
  [0.11, 0.016, 0.05],
  [0.085, 0.013, 0.055],
  [0.12, 0.018, 0.04],
  [0.1, 0.015, 0.07],
  [0.13, 0.017, 0.055],
  [0.075, 0.012, 0.04],
  [0.115, 0.02, 0.065],
  [0.14, 0.015, 0.08],
  [0.09, 0.014, 0.085],
];

/** Heat-haze count and spacing along trench Z. */
export const HAZE_COUNT = 5;
export const HAZE_Z0 = -0.018;
export const HAZE_DZ = 0.009;

/**
 * Expand steam tiers into per-sprite construction records (pure, deterministic).
 */
export function expandSteamSprites(
  tiers: readonly SteamTierSpec[] = STEAM_TIERS,
): readonly {
  ang: number;
  r0: number;
  y0: number;
  scale: number;
  color: number;
  phase: number;
  tier: number;
}[] {
  const out: {
    ang: number;
    r0: number;
    y0: number;
    scale: number;
    color: number;
    phase: number;
    tier: number;
  }[] = [];
  let steamIdx = 0;
  for (let ti = 0; ti < tiers.length; ti++) {
    const tier = tiers[ti]!;
    for (let i = 0; i < tier.n; i++) {
      const ang = (i / tier.n) * Math.PI * 2 + steamIdx * 0.17;
      out.push({
        ang,
        r0: tier.r0,
        y0: tier.y0,
        scale: tier.scale,
        color: tier.color,
        phase: steamIdx * 0.85,
        tier: ti,
      });
      steamIdx++;
    }
  }
  return out;
}

/** Z positions for heat-haze sprites. */
export function hazeBaseZs(
  count = HAZE_COUNT,
  z0 = HAZE_Z0,
  dz = HAZE_DZ,
): readonly number[] {
  return Array.from({ length: count }, (_, i) => z0 + i * dz);
}

// ---------------------------------------------------------------------------
// Aggregate strengths (pure of mission state)
// ---------------------------------------------------------------------------

export type PadDayNight = Readonly<{ day: number; night: number }>;

/**
 * Day factor: 1 midday, 0 deep night (soft twilight band around elev ≈ 0).
 */
export function padDayNight(sunElev: number | undefined): PadDayNight {
  const elev = sunElev ?? 0.4;
  const day = smoothstep(-0.08, 0.22, elev);
  return { day, night: 1 - day };
}

export type PadFlameBundle = Readonly<{
  /** Engines lighting trench while still near pad. */
  active: boolean;
  /** Altitude fade in [0, 1]. */
  altFade: number;
  /** Deterministic flicker mult (~0.8–1). */
  flicker: number;
  /** Final trench flame strength (0 when not burning on pad). */
  strength: number;
}>;

/** Flame / tongue / plume-light strength from mission state. */
export function padFlameStrength(state: LaunchPadFxState): PadFlameBundle {
  const onPadPhase =
    state.phase === "launch" ||
    (state.phase === "ascent" && state.altEarth < 25);
  const active = state.burning && onPadPhase && state.missionT >= 0;
  const altFade = clamp01(1 - state.altEarth / 18);
  const t = Math.max(0, state.missionT);
  const flicker =
    0.9 + 0.06 * Math.sin(t * 41.2) + 0.04 * Math.sin(t * 77.5 + 0.7);
  const strength = active ? altFade * flicker : 0;
  return { active, altFade, flicker, strength };
}

/**
 * Deluge steam strength — hangs longer than hard flame (true-scale around OLM).
 */
export function padSteamStrength(state: LaunchPadFxState): number {
  if (!state.burning || state.altEarth >= 35 || state.missionT >= 180) {
    return 0;
  }
  if (state.phase !== "launch" && state.phase !== "ascent") return 0;
  return clamp01(1 - state.altEarth / 30);
}

/**
 * Heat haze peak over trench — strongest early after light, fades with altitude.
 */
export function padHazePeak(
  flameStrength: number,
  missionT: number,
  altEarth: number,
): number {
  const timeFade = Math.min(
    1,
    Math.max(0.15, 1 - Math.max(0, missionT) / 25),
  );
  const altFade = clamp01(1 - altEarth / 4);
  return flameStrength * timeFade * altFade;
}

/**
 * Tank-farm vent steam: full on countdown hold, eases after liftoff.
 * Dims when engines light so deluge owns the frame.
 */
export function padVentStrength(
  state: LaunchPadFxState,
  flameStrength: number,
  animT: number = state.missionT,
): number {
  let ventStr = 0;
  if (state.missionT < 0) {
    ventStr = 0.85 + 0.15 * Math.sin(animT * 0.7);
  } else if (state.missionT < 90 && state.altEarth < 12) {
    ventStr = clamp01(1 - state.missionT / 90) * 0.75;
  }
  if (flameStrength > 0.2) ventStr *= 0.55;
  return ventStr;
}

export type PadOpsLights = Readonly<{
  padOps: boolean;
  floodBase: number;
}>;

/** Flood / pad-ops gate and night-led flood base intensity. */
export function padOpsLights(
  state: LaunchPadFxState,
  dayNight: PadDayNight,
): PadOpsLights {
  const nearPad =
    state.phase === "launch" ||
    (state.phase === "ascent" && state.altEarth < 8) ||
    state.missionT < 30;
  const padOps =
    nearPad ||
    state.missionT < 0 ||
    (state.phase === "launch" && state.missionT < 120);
  const floodBase = padOps
    ? 0.04 * dayNight.day + 1.2 * dayNight.night
    : 0;
  return { padOps, floodBase };
}

/** Full derived bundle used by the scene applicator. */
export type PadFxDerived = Readonly<{
  animT: number;
  day: number;
  night: number;
  flame: PadFlameBundle;
  steamStr: number;
  hazePeak: number;
  ventStr: number;
  padOps: boolean;
  floodBase: number;
}>;

/** Derive all pad FX scalars from mission state (one pure entry point). */
export function derivePadFx(state: LaunchPadFxState): PadFxDerived {
  const animT = state.missionT;
  const { day, night } = padDayNight(state.sunElev);
  const flame = padFlameStrength(state);
  const steamStr = padSteamStrength(state);
  const hazePeak = padHazePeak(flame.strength, state.missionT, state.altEarth);
  const ventStr = padVentStrength(state, flame.strength, animT);
  const { padOps, floodBase } = padOpsLights(state, { day, night });
  return {
    animT,
    day,
    night,
    flame,
    steamStr,
    hazePeak,
    ventStr,
    padOps,
    floodBase,
  };
}

// ---------------------------------------------------------------------------
// Per-sprite poses (pure)
// ---------------------------------------------------------------------------

export type SteamSpriteBase = Readonly<{
  baseAng: number;
  baseR: number;
  baseY: number;
  baseScale: number;
  phase: number;
  tier: number;
}>;

export function steamSpritePose(
  base: SteamSpriteBase,
  steamStr: number,
  night: number,
  animT: number,
): SpritePose {
  const tierOp = 1 - base.tier * 0.18;
  const wobble = 0.85 + 0.15 * Math.sin(animT * 3.1 + base.phase);
  const opacity = (0.26 + 0.14 * night) * steamStr * wobble * tierOp;
  const grow =
    base.baseScale * (0.85 + steamStr * 0.9) +
    0.015 * Math.sin(animT * 2.2 + base.phase);
  const r =
    base.baseR +
    steamStr * (0.04 + base.tier * 0.02) +
    0.008 * Math.sin(animT * 1.7 + base.phase);
  const ang = base.baseAng + animT * 0.05;
  return {
    opacity,
    scale: { x: grow, y: grow },
    position: {
      x: Math.cos(ang) * r,
      y:
        base.baseY +
        steamStr * (0.04 + base.tier * 0.025) +
        0.01 * Math.sin(animT * 2.5 + base.phase),
      z: Math.sin(ang) * r,
    },
  };
}

export type SheetSpriteBase = Readonly<{
  baseX: number;
  baseY: number;
  baseZ: number;
  baseSx: number;
  baseSy: number;
  phase: number;
}>;

export function sheetSpritePose(
  base: SheetSpriteBase,
  steamStr: number,
  night: number,
  animT: number,
): SpritePose {
  const wobble = 0.8 + 0.2 * Math.sin(animT * 4.2 + base.phase);
  const opacity = (0.32 + 0.12 * night) * steamStr * wobble;
  const sx = base.baseSx * (0.9 + steamStr * 0.55);
  const sy =
    base.baseSy *
    (0.85 + steamStr * 0.7 + 0.08 * Math.sin(animT * 3.3 + base.phase));
  return {
    opacity,
    scale: { x: sx, y: sy },
    position: {
      x: base.baseX + 0.004 * Math.sin(animT * 2.1 + base.phase),
      y:
        base.baseY +
        steamStr * 0.025 +
        0.006 * Math.sin(animT * 2.8 + base.phase),
      z: base.baseZ + 0.003 * Math.cos(animT * 1.9 + base.phase),
    },
  };
}

export type HazeSpriteBase = Readonly<{
  baseZ: number;
  phase: number;
}>;

export function hazeSpritePose(
  base: HazeSpriteBase,
  hazePeak: number,
  animT: number,
): SpritePose {
  const shimmer = 0.75 + 0.25 * Math.sin(animT * 18.5 + base.phase);
  const opacity = 0.22 * hazePeak * shimmer;
  const sx =
    0.024 + 0.02 * hazePeak + 0.006 * Math.sin(animT * 11 + base.phase);
  const sy =
    0.018 +
    0.028 * hazePeak +
    0.008 * Math.sin(animT * 14.2 + base.phase * 1.3);
  return {
    opacity,
    scale: { x: sx, y: sy },
    position: {
      x: 0.003 * Math.sin(animT * 9.1 + base.phase),
      y: 0.012 + hazePeak * 0.018 + 0.004 * Math.sin(animT * 12.5 + base.phase),
      z: base.baseZ + 0.002 * Math.cos(animT * 8.3 + base.phase),
    },
  };
}

export type VentSpriteBase = Readonly<{
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
}>;

export function ventSpritePose(
  base: VentSpriteBase,
  ventStr: number,
  night: number,
  animT: number,
): SpritePose {
  const wobble = 0.8 + 0.2 * Math.sin(animT * 1.8 + base.phase);
  const opacity = (0.35 + 0.2 * night) * ventStr * wobble;
  const grow =
    0.08 + ventStr * 0.18 + 0.03 * Math.sin(animT * 1.4 + base.phase);
  return {
    opacity,
    scale: { x: grow * 1.15, y: grow * 1.4 },
    position: {
      x: base.baseX + 0.012 * Math.sin(animT * 0.4 + base.phase),
      y:
        base.baseY +
        ventStr * 0.08 +
        0.02 * Math.sin(animT * 1.1 + base.phase),
      z: base.baseZ + 0.01 * Math.cos(animT * 0.35 + base.phase),
    },
  };
}

// ---------------------------------------------------------------------------
// Mesh / light scalars (pure)
// ---------------------------------------------------------------------------

export type FlameVisual = Readonly<{
  visible: boolean;
  opacity: number;
  scaleY: number;
}>;

export function flameVisual(strength: number): FlameVisual {
  return {
    visible: strength > 0.02,
    opacity: 0.4 * strength,
    scaleY: 0.7 + 0.5 * strength,
  };
}

export function tongueVisual(strength: number): FlameVisual {
  return {
    visible: strength > 0.05,
    opacity: 0.28 * strength,
    scaleY: 0.6 + 0.7 * strength,
  };
}

export type BloomVisual = Readonly<{
  visible: boolean;
  opacity: number;
  scale: number;
}>;

export function bloomVisual(strength: number, flicker: number): BloomVisual {
  return {
    visible: strength > 0.04,
    opacity: 0.35 * strength * flicker,
    scale: 0.08 + 0.1 * strength,
  };
}

/** Spot intensity mult for flood index (0 = primary, others slightly dimmer). */
export function floodSpotIntensity(
  floodBase: number,
  flameStrength: number,
  index: number,
): number {
  const plumeDim = 1 - 0.35 * flameStrength;
  const weight = 0.85 + 0.15 * (index === 0 ? 1 : 0.75);
  return floodBase * plumeDim * weight;
}

export function floodSpotDistance(night: number): number {
  return 0.28 + 0.1 * night;
}

export function padFillIntensity(
  padOps: boolean,
  day: number,
  night: number,
  flameStrength: number,
): number {
  if (!padOps) return 0;
  return 0.03 * day + 0.55 * night * (1 - 0.4 * flameStrength);
}

/** Warm when burning, cool otherwise. */
export function padFillColorHex(flameStrength: number): number {
  return flameStrength > 0.1 ? 0xffe0c8 : 0xdde6f4;
}

export function padFillDistance(night: number): number {
  return 0.22 + 0.08 * night;
}

export function plumeLightIntensity(strength: number): number {
  return 2.2 * strength;
}

export function plumeLightDistance(strength: number): number {
  return 0.14 + 0.1 * strength;
}

export function plumeLightRgb(
  flicker: number,
): Readonly<[number, number, number]> {
  return [1, 0.55 + 0.1 * flicker, 0.28];
}

export function floodFixtureEmissive(floodBase: number): number {
  return 0.15 + floodBase * 1.4;
}

/** OLM work-lamp color hex; dark when pad ops off. */
export function olmLampColorHex(padOps: boolean, night: number): number {
  if (!padOps) return 0x444444;
  return night > 0.5 ? 0xf4f8ff : 0xc8d0dc;
}

/** Beacon opacity from wall-clock (UI pulse; only non-mission-time FX). */
export function padBeaconOpacity(wallT: number): number {
  return 0.55 + 0.4 * Math.sin(wallT * 4);
}

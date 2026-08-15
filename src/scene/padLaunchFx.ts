/**
 * Pure pad launch FX — strengths and sprite poses from mission state.
 *
 * ## Architecture
 *
 * ```
 * LaunchPadFxState  →  derivePadFx()  →  *SpritePose() / *Visual()
 *                                              ↓
 *                         earthTheater.updateStarbaseLaunchFx  (THREE only)
 * ```
 *
 * **No THREE** in this module: scrub-safe, unit-testable, shared by both
 * mission theaters (lunar + Flight 13). Scene unit = **1 km**.
 *
 * ## Scrub safety
 *
 * All time dependence uses **mission** `t` (may be negative during the T−
 * countdown hold). Do not call `performance.now()` here — wall-clock is only
 * allowed for the tower beacon pulse (`padBeaconOpacity`), which is UI chrome.
 *
 * ## Theater grade
 *
 * Looks are tuned for trench / pad cameras, not CFD or ops imagery. Opacity
 * and scale tables favor watchability over physical fidelity.
 *
 * @see earthTheater.updateStarbaseLaunchFx — impure applicator
 * @see docs/VISUAL_REALISM.md — V3 pad close-up; V14 steam punch
 */

// ---------------------------------------------------------------------------
// Math (local, no THREE dependency)
// ---------------------------------------------------------------------------

/**
 * Clamp a number into [0, 1].
 *
 * @param x - Input; non-finite values map to `0`
 * @returns Value in [0, 1]
 */
export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

/**
 * Hermite smoothstep on the interval [edge0, edge1] → [0, 1].
 *
 * GLSL-style argument order `(edge0, edge1, x)`, unlike Three's
 * `MathUtils.smoothstep(x, min, max)`.
 *
 * @param edge0 - Lower edge of the transition (maps to 0)
 * @param edge1 - Upper edge of the transition (maps to 1)
 * @param x - Sample value
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Immutable 3-vector in pad-local km (or any consistent frame). */
export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

/** Sprite XY scale (Three sprites ignore Z stretch for billboards). */
export type Scale2 = Readonly<{ x: number; y: number }>;

/**
 * Fully derived sprite state for one frame — ready for THREE apply.
 * Opacity may be 0; callers still set visibility on the parent group.
 */
export type SpritePose = Readonly<{
  /** Material opacity in [0, ~1]; not pre-clamped past 1. */
  opacity: number;
  /** Pad-local position (km). */
  position: Vec3;
  /** Billboard scale (km-ish sprite size). */
  scale: Scale2;
}>;

// ---------------------------------------------------------------------------
// Mission state input
// ---------------------------------------------------------------------------

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
   * (e.g. transport u maps −120…0 before light).
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

// ---------------------------------------------------------------------------
// Layout specs (data) — construction + pose bases share one source of truth
// ---------------------------------------------------------------------------

/**
 * One radial tier of deluge steam sprites around the OLM.
 * Used by both `createStarbasePad` (mesh build) and pose helpers.
 */
export type SteamTierSpec = Readonly<{
  /** Number of sprites evenly spaced on the ring. */
  n: number;
  /** Ring radius (km) at rest. */
  r0: number;
  /** Height above pad deck (km). */
  y0: number;
  /** Base uniform sprite scale (km). */
  scale: number;
  /** THREE color hex for the sprite material. */
  color: number;
}>;

/**
 * Multi-tier deluge ring around the OLM (visual V3).
 *
 * - Tier 0 — tight, bright lip steam  
 * - Tier 1 — mid plume  
 * - Tier 2 — lofted translucent cloud  
 *
 * Outer tiers get lower opacity via `steamSpritePose` (`tier` index).
 */
export const STEAM_TIERS: readonly SteamTierSpec[] = [
  { n: 10, r0: 0.024, y0: 0.007, scale: 0.085, color: 0xe8eef4 },
  { n: 8, r0: 0.04, y0: 0.016, scale: 0.13, color: 0xdce4ec },
  { n: 6, r0: 0.056, y0: 0.028, scale: 0.17, color: 0xd0d8e0 },
];

/**
 * One deluge “sheet” curtain sprite (stretched billboard along the trench).
 * `phase` is a fixed time offset so sheets do not animate in lockstep.
 */
export type DelugeSheetSpec = Readonly<{
  /** Rest pose [x, y, z] in pad km. */
  pos: readonly [number, number, number];
  /** Rest scale X (km). */
  sx: number;
  /** Rest scale Y (km). */
  sy: number;
  /** Animation phase offset (radians-ish into sin chains). */
  phase: number;
}>;

/**
 * Sheet curtains along the flame-trench long axis (visual V3 volumetric deluge).
 * Paired with the multi-tier ring for denser steam under trench cam.
 */
export const DELUGE_SHEETS: readonly DelugeSheetSpec[] = [
  { pos: [0.012, 0.014, 0], sx: 0.062, sy: 0.038, phase: 0.2 },
  { pos: [-0.012, 0.012, 0], sx: 0.058, sy: 0.036, phase: 1.1 },
  { pos: [0, 0.016, 0.022], sx: 0.048, sy: 0.042, phase: 2.0 },
  { pos: [0, 0.015, -0.022], sx: 0.05, sy: 0.04, phase: 2.8 },
  { pos: [0.008, 0.022, 0.01], sx: 0.068, sy: 0.048, phase: 3.5 },
  { pos: [-0.006, 0.024, -0.008], sx: 0.065, sy: 0.046, phase: 4.2 },
];

/**
 * Extra ground-hugging steam sheets (visual V14.3).
 * Sit lower and wider than {@link DELUGE_SHEETS} so T+0 reads as an opaque
 * volume around the OLM, not a floating ring.
 */
export const GROUND_SHEETS: readonly DelugeSheetSpec[] = [
  { pos: [0, 0.005, 0], sx: 0.095, sy: 0.026, phase: 0.4 },
  { pos: [0.02, 0.006, 0.012], sx: 0.072, sy: 0.022, phase: 1.3 },
  { pos: [-0.018, 0.006, -0.014], sx: 0.07, sy: 0.02, phase: 2.2 },
  { pos: [0.004, 0.007, 0.032], sx: 0.062, sy: 0.02, phase: 3.0 },
  { pos: [-0.004, 0.007, -0.03], sx: 0.06, sy: 0.02, phase: 3.9 },
];

/**
 * Tank-farm vent sprite anchors in pad-local km (+X / +Z ≈ east/north of OLM).
 * Positions sit over the white horizontal tank rows from the satellite layout.
 */
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

/** Number of heat-haze billboards along the trench. */
export const HAZE_COUNT = 5;
/** First haze sprite Z (km, pad frame; trench runs roughly ±Z). */
export const HAZE_Z0 = -0.018;
/** Spacing between haze sprites along Z (km). */
export const HAZE_DZ = 0.009;

/** One expanded steam sprite ready for mesh construction. */
export type ExpandedSteamSprite = Readonly<{
  /** Rest angle around +Y (rad). */
  ang: number;
  r0: number;
  y0: number;
  scale: number;
  color: number;
  /** Fixed animation phase so sprites desync. */
  phase: number;
  /** Index into `STEAM_TIERS` (0 = lip, higher = loft). */
  tier: number;
}>;

/**
 * Expand steam tier specs into per-sprite construction records.
 *
 * Pure and deterministic: same tiers always yield the same angles/phases so
 * create and update stay in lockstep. Slight angular offset by index avoids
 * a perfect regular polygon that looks synthetic.
 *
 * @param tiers - Defaults to {@link STEAM_TIERS}
 * @returns Flat list of sprites (length = sum of `n` over tiers)
 */
function pushSteamTier(
  out: ExpandedSteamSprite[],
  tier: SteamTierSpec,
  ti: number,
  steamIdx: number,
): number {
  for (let i = 0; i < tier.n; i++) {
    const ang = (i / tier.n) * Math.PI * 2 + steamIdx * 0.17;
    out.push({
      ang, r0: tier.r0, y0: tier.y0, scale: tier.scale,
      color: tier.color, phase: steamIdx * 0.85, tier: ti,
    });
    steamIdx++;
  }
  return steamIdx;
}

export function expandSteamSprites(
  tiers: readonly SteamTierSpec[] = STEAM_TIERS,
): readonly ExpandedSteamSprite[] {
  const out: ExpandedSteamSprite[] = [];
  let steamIdx = 0;
  for (let ti = 0; ti < tiers.length; ti++) {
    steamIdx = pushSteamTier(out, tiers[ti]!, ti, steamIdx);
  }
  return out;
}

/**
 * Z positions for heat-haze sprites along the trench.
 *
 * @param count - Sprite count (default {@link HAZE_COUNT})
 * @param z0 - First Z (default {@link HAZE_Z0})
 * @param dz - Step along Z (default {@link HAZE_DZ})
 */
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

/**
 * Deluge steam envelope strength — hangs longer than hard flame.
 *
 * Stays up through thicker atmosphere theater (~30 km fade, hard cut 35 km)
 * and the first three minutes after liftoff, but only on `launch` / `ascent`
 * while engines burn. True-scale cloud around the OLM, not a multi-km fog.
 *
 * @returns Steam strength in [0, 1]
 */
export function padSteamStrength(state: LaunchPadFxState): number {
  if (!state.burning || state.altEarth >= 35 || state.missionT >= 180) {
    return 0;
  }
  if (state.phase !== "launch" && state.phase !== "ascent") return 0;
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

// ---------------------------------------------------------------------------
// Per-sprite poses (pure)
// ---------------------------------------------------------------------------

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
  const tierOp = 1 - base.tier * 0.14;
  const wobble = 0.88 + 0.12 * Math.sin(animT * 3.1 + base.phase);
  return (0.52 + 0.16 * night) * steamStr * wobble * tierOp;
}

function steamGrow(base: SteamSpriteBase, steamStr: number, animT: number): number {
  return base.baseScale * (1.05 + steamStr * 1.05) + 0.012 * Math.sin(animT * 2.2 + base.phase);
}

function steamPosition(base: SteamSpriteBase, steamStr: number, animT: number): Vec3 {
  const r = base.baseR + steamStr * (0.022 + base.tier * 0.012) + 0.006 * Math.sin(animT * 1.7 + base.phase);
  const ang = base.baseAng + animT * 0.04;
  return {
    x: Math.cos(ang) * r,
    y: base.baseY + steamStr * (0.018 + base.tier * 0.014) + 0.006 * Math.sin(animT * 2.5 + base.phase),
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
    opacity: (0.55 + 0.14 * night) * steamStr * wobble,
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
    opacity: (0.62 + 0.12 * night) * steamStr * wobble,
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
    opacity: (0.52 + 0.18 * night) * ventStr * wobble,
    scale: { x: grow * 1.15, y: grow * 1.4 },
    position: ventPosition(base, ventStr, animT),
  };
}

// ---------------------------------------------------------------------------
// Mesh / light scalars (pure)
// ---------------------------------------------------------------------------

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
    opacity: 0.55 * strength,
    scaleY: 0.7 + 0.5 * strength,
  };
}

/**
 * Secondary flame-tongue cones (slightly later visibility gate than the sheet).
 */
export function tongueVisual(strength: number): FlameVisual {
  return {
    visible: strength > 0.05,
    opacity: 0.28 * strength,
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
 * Ground bloom under the plume — true-scale, only while burning strongly.
 * Opacity includes flicker so the pad glow breathes with the flame.
 */
export function bloomVisual(strength: number, flicker: number): BloomVisual {
  return {
    visible: strength > 0.04,
    opacity: 0.52 * strength * flicker,
    scale: 0.11 + 0.14 * strength,
  };
}

/**
 * How strongly 33 engines warm the deluge cloud (visual V14.3).
 * 0 = cool gray steam; 1 = orange-pink core like T+0 webcast stills.
 */
export function steamWarmth(flameStrength: number): number {
  return clamp01(flameStrength * 1.15);
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
  const coolR = 0.86 + 0.06 * night;
  const coolG = 0.89 + 0.04 * night;
  const coolB = 0.93;
  return [
    coolR + (1.0 - coolR) * w,
    coolG + (0.68 - coolG) * w,
    coolB + (0.52 - coolB) * w,
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
  return 0.03 * day + 0.55 * night * (1 - 0.4 * flameStrength);
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
  return 2.2 * strength;
}

/** Plume point-light reach (km). */
export function plumeLightDistance(strength: number): number {
  return 0.14 + 0.1 * strength;
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

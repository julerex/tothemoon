/**
 * Pad launch FX layout specs — tier rings, sheet curtains, vent anchors.
 *
 * Construction and pose helpers share one source of truth for rest poses.
 */

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

/** One low-poly cryo-cloud cluster (pad-local km). */
export type VentCloudSpec = Readonly<{
  x: number;
  y: number;
  z: number;
  /** Cluster size (km) — keep well under the old ~0.26 km sprite fog wall. */
  scale: number;
  phase: number;
  lobes: number;
}>;

/** Ground-hugging OLM wrap — T−42 still steam around the booster base. */
const OLM_WRAP_CLOUDS: readonly VentCloudSpec[] = [
  { x: -0.030, y: 0.009, z: 0.006, scale: 0.026, phase: 0.2, lobes: 6 },
  { x: -0.044, y: 0.010, z: -0.012, scale: 0.028, phase: 1.0, lobes: 7 },
  { x: -0.022, y: 0.008, z: -0.022, scale: 0.024, phase: 1.8, lobes: 5 },
  { x: 0.016, y: 0.007, z: -0.024, scale: 0.020, phase: 2.5, lobes: 5 },
  { x: 0.010, y: 0.006, z: 0.026, scale: 0.018, phase: 3.2, lobes: 4 },
  { x: -0.018, y: 0.009, z: 0.020, scale: 0.022, phase: 4.0, lobes: 5 },
  { x: -0.008, y: 0.007, z: -0.008, scale: 0.016, phase: 4.7, lobes: 4 },
  { x: -0.056, y: 0.011, z: 0.004, scale: 0.024, phase: 5.4, lobes: 6 },
];

function tankFarmClouds(): VentCloudSpec[] {
  return VENT_ANCHORS.map((a, i) => ({
    x: a[0],
    y: a[1] * 0.55 + 0.004,
    z: a[2],
    scale: 0.013 + (i % 3) * 0.003,
    phase: i * 1.1,
    lobes: 4 + (i % 3),
  }));
}

/** Prelaunch cryo banks: OLM wrap + tank-farm vents. */
export const VENT_CLOUD_SPECS: readonly VentCloudSpec[] = [
  ...OLM_WRAP_CLOUDS,
  ...tankFarmClouds(),
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

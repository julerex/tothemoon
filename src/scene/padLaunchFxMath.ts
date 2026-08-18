/**
 * Pure pad launch FX math — clamp, smoothstep, and shared vector types.
 *
 * No THREE dependency; shared by derive, pose, and layout modules.
 */

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

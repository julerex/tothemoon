/**
 * WASD view-plane pan plus T/B vertical pan from held keys.
 *
 * Forward is W minus S along look. Lateral is A minus D along camera-right:
 * A pans screen-right, D pans screen-left. Vertical is T minus B along local
 * up (ecliptic north at Sun / Earth / Moon; pad surface normal at Starbase /
 * aerial / launch tower; camera.up otherwise).
 */

export type PanKey = "w" | "a" | "s" | "d" | "t" | "b";

export type PanHeldKeys = Readonly<{
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  t: boolean;
  b: boolean;
}>;

export type PanAxes = Readonly<{
  /** +1 = pan toward look, −1 = pan away. */
  fwd: number;
  /** +1 = pan along camera-right, −1 = pan along camera-left. */
  right: number;
  /** +1 = pan along local up (T), −1 = pan along local down (B). */
  up: number;
}>;

/**
 * Map held WASD + T/B keys to a pan vector in {−1, 0, +1} per axis.
 * Opposite keys on the same axis cancel.
 */
export function panAxesFromHeld(held: PanHeldKeys): PanAxes {
  return {
    fwd: (held.w ? 1 : 0) - (held.s ? 1 : 0),
    right: (held.a ? 1 : 0) - (held.d ? 1 : 0),
    up: (held.t ? 1 : 0) - (held.b ? 1 : 0),
  };
}

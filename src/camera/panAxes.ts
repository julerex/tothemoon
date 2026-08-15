/**
 * WASD view-plane pan axes from held keys.
 *
 * Forward is W minus S along look. Lateral is A minus D along camera-right:
 * A pans screen-right, D pans screen-left.
 */

export type PanHeldKeys = Readonly<{
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
}>;

export type PanAxes = Readonly<{
  /** +1 = pan toward look, −1 = pan away. */
  fwd: number;
  /** +1 = pan along camera-right, −1 = pan along camera-left. */
  right: number;
}>;

/**
 * Map held WASD keys to a view-plane pan vector in {−1, 0, +1} per axis.
 * Opposite keys on the same axis cancel.
 */
export function panAxesFromHeld(held: PanHeldKeys): PanAxes {
  return {
    fwd: (held.w ? 1 : 0) - (held.s ? 1 : 0),
    right: (held.a ? 1 : 0) - (held.d ? 1 : 0),
  };
}

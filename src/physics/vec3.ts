/**
 * Minimal mutable 3-vector helpers for the integrator and guidance.
 *
 * Convention: callers pass an `out` vector for results (except pure queries
 * like `len` / `dot` / `dist`). Units are typically km or km/s.
 */

/** Mutable 3-vector (km or km/s in mission physics). */
export type V3 = { x: number; y: number; z: number };

/** Allocate a new vector (default zero). */
export function v3(x = 0, y = 0, z = 0): V3 {
  return { x, y, z };
}

/** Copy `a` into `out`; returns `out`. */
export function copy(out: V3, a: V3): V3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

/** Set components of `out`; returns `out`. */
export function set(out: V3, x: number, y: number, z: number): V3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** Component-wise `out = a + b`. */
export function add(out: V3, a: V3, b: V3): V3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

/** Component-wise `out = a − b`. */
export function sub(out: V3, a: V3, b: V3): V3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

/** `out = a · s` (scalar multiply). */
export function scale(out: V3, a: V3, s: number): V3 {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

/** Multiply-add: `out = a + b · s`. */
export function madd(out: V3, a: V3, b: V3, s: number): V3 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
}

/** Euclidean length ‖a‖. */
export function len(a: V3): number {
  return Math.hypot(a.x, a.y, a.z);
}

/** Squared length (avoids sqrt when only comparisons are needed). */
export function lenSq(a: V3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

/**
 * Unit vector in the direction of `a`.
 * Zero-length input yields `(1,0,0)`-scale via `L = 1` (avoids NaN).
 */
export function normalize(out: V3, a: V3): V3 {
  const L = len(a) || 1;
  out.x = a.x / L;
  out.y = a.y / L;
  out.z = a.z / L;
  return out;
}

/** Euclidean distance ‖a − b‖. */
export function dist(a: V3, b: V3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Cross product `out = a × b` (safe if `out` aliases `a` or `b`). */
export function cross(out: V3, a: V3, b: V3): V3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** Dot product a · b. */
export function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Shallow clone (new object). */
export function clone(a: V3): V3 {
  return { x: a.x, y: a.y, z: a.z };
}

/** Minimal mutable 3-vector for the integrator (km or km/s). */
export type V3 = { x: number; y: number; z: number };

export function v3(x = 0, y = 0, z = 0): V3 {
  return { x, y, z };
}

export function copy(out: V3, a: V3): V3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function set(out: V3, x: number, y: number, z: number): V3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function add(out: V3, a: V3, b: V3): V3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function sub(out: V3, a: V3, b: V3): V3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function scale(out: V3, a: V3, s: number): V3 {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

export function madd(out: V3, a: V3, b: V3, s: number): V3 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
}

export function len(a: V3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function lenSq(a: V3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function normalize(out: V3, a: V3): V3 {
  const L = len(a) || 1;
  out.x = a.x / L;
  out.y = a.y / L;
  out.z = a.z / L;
  return out;
}

export function dist(a: V3, b: V3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function cross(out: V3, a: V3, b: V3): V3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function clone(a: V3): V3 {
  return { x: a.x, y: a.y, z: a.z };
}

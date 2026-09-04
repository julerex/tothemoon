/**
 * Procedural mottled concrete albedo for the Starbase site apron.
 *
 * Periodic in UV so RepeatWrapping tiles without a seam. Low-frequency
 * pour patches, mid-scale weathering, aggregate speckle, and a 4×4 slab
 * joint grid — theater-grade, not a photo texture.
 */
import * as THREE from "three";

/** One repeating map covers this many km of apron (planar UV). */
export const CONCRETE_TILE_KM = 0.08;

/** Square albedo resolution. */
export const CONCRETE_MAP_SIZE = 256;

/** Pour joints per tile edge (~20 m slabs at {@link CONCRETE_TILE_KM}). */
export const CONCRETE_SLABS = 4;

function wrap01(t: number): number {
  return t - Math.floor(t);
}

function clampByte(n: number): number {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n | 0;
}

function hash2(ix: number, iy: number, salt = 0): number {
  let n = Math.imul(ix + salt * 17, 73856093) ^ Math.imul(iy + salt * 31, 19349663);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Periodic value noise on the unit square (`cells` must be an integer ≥ 1).
 */
export function concreteNoise(u: number, v: number, cells: number, salt = 0): number {
  const x = wrap01(u) * cells;
  const y = wrap01(v) * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const n00 = hash2(x0, y0, salt);
  const n10 = hash2(x1, y0, salt);
  const n01 = hash2(x0, y1, salt);
  const n11 = hash2(x1, y1, salt);
  return n00 * (1 - fx) * (1 - fy) + n10 * fx * (1 - fy) + n01 * (1 - fx) * fy + n11 * fx * fy;
}

/**
 * 1 on a pour joint, 0 in the slab interior. Wraps with the tile.
 */
export function slabJoint(u: number, v: number, slabs = CONCRETE_SLABS): number {
  const uu = wrap01(u) * slabs;
  const vv = wrap01(v) * slabs;
  const du = Math.min(wrap01(uu), 1 - wrap01(uu));
  const dv = Math.min(wrap01(vv), 1 - wrap01(vv));
  const d = Math.min(du, dv);
  const half = 0.03;
  if (d >= half) return 0;
  const t = 1 - d / half;
  return t * t;
}

/**
 * sRGB byte albedo for one UV sample. `u`/`v` wrap every 1.0.
 */
export function concreteAlbedo(u: number, v: number): { r: number; g: number; b: number } {
  const nLo = concreteNoise(u, v, 5, 1);
  const nMid = concreteNoise(u, v, 13, 2);
  const nHi = concreteNoise(u, v, 37, 3);
  const mottle = (nLo - 0.5) * 0.22 + (nMid - 0.5) * 0.12 + (nHi - 0.5) * 0.06;
  const joint = slabJoint(u, v);
  const dirt = Math.max(0, concreteNoise(u + 0.31, v + 0.17, 7, 4) - 0.62) * 0.38;
  const speckle = hash2(
    Math.floor(wrap01(u) * 96),
    Math.floor(wrap01(v) * 96),
    5,
  );
  const agg = (speckle - 0.5) * 0.05;
  const shade = mottle - joint * 0.2 - dirt + agg;
  // Warm pad grey (cement + Gulf dust), not the old cool 0xb0b4b8 fill.
  return {
    r: clampByte((0.7 + shade * 0.95) * 255),
    g: clampByte((0.685 + shade * 0.88) * 255),
    b: clampByte((0.645 + shade * 0.72) * 255),
  };
}

/** Fill an RGBA buffer (`size × size`) with the wrapped concrete albedo. */
export function fillConcreteAlbedo(data: Uint8Array, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { r, g, b } = concreteAlbedo(x / size, y / size);
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

/**
 * Tiled sRGB albedo. Linear-filtered so ground cams do not pixelate joints.
 */
export function makeConcreteTexture(size = CONCRETE_MAP_SIZE): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  fillConcreteAlbedo(data, size);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Planar UV in the geometry XY plane (Shape/Ring before the −π/2 ground tilt).
 */
export function setPlanarUvKm(geo: THREE.BufferGeometry, tileKm = CONCRETE_TILE_KM): void {
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / tileKm;
    uv[i * 2 + 1] = pos.getY(i) / tileKm;
  }
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
}

/**
 * Clone a pad concrete material onto the tiled albedo (map carries the grey).
 */
export function mottledConcreteMat(
  base: THREE.MeshStandardMaterial,
  map: THREE.Texture,
  doubleSide = false,
): THREE.MeshStandardMaterial {
  const mat = base.clone();
  mat.map = map;
  mat.color.setHex(0xffffff);
  if (doubleSide) mat.side = THREE.DoubleSide;
  mat.needsUpdate = true;
  return mat;
}

/**
 * WGS84 theater ellipsoid — one figure for physics and the visual globe.
 *
 * Parametric form matches Three.js SphereGeometry (mesh +Y = north, lon 0 at
 * +X) then non-uniform scale: x,z → a, y → b. Height is along the **geocentric
 * radial** of that ellipsoid point, not the geodetic normal. Flattening is
 * small enough that pad / splash / clamps sit on the rendered mesh.
 *
 * Inertial helpers are axisymmetric about the J2000 north pole (obliquity),
 * so they do not need mission time / spin.
 *
 * Scene unit = 1 km.
 */

import {
  EARTH_OBLIQUITY,
  EARTH_SURFACE_ALT_KM,
  WGS84_A_KM,
  WGS84_B_KM,
} from "./constants";

/** Minimal 3-vector (km). */
export type Vec3Like = Readonly<{ x: number; y: number; z: number }>;

/** Mesh-local Y scale to squash a `SphereGeometry(a)` into the WGS84 ellipsoid. */
export const WGS84_MESH_Y_SCALE = WGS84_B_KM / WGS84_A_KM;

const A2 = WGS84_A_KM * WGS84_A_KM;
const B2 = WGS84_B_KM * WGS84_B_KM;
const POLE_Y = Math.sin(EARTH_OBLIQUITY);
const POLE_Z = Math.cos(EARTH_OBLIQUITY);

/**
 * Geocentric radius (km) of the ellipsoid along a mesh-local vector (+Y north).
 */
export function ellipsoidRadiusMeshLocal(
  x: number,
  y: number,
  z: number,
): number {
  const r = Math.hypot(x, y, z);
  if (r < 1e-12) return WGS84_A_KM;
  const ny = y / r;
  const rhoHat2 = Math.max(0, 1 - ny * ny);
  return 1 / Math.sqrt(rhoHat2 / A2 + (ny * ny) / B2);
}

/**
 * Geocentric radius (km) of the ellipsoid along an inertial Earth-relative
 * vector. Longitude-independent (axisymmetric about the north pole).
 */
export function ellipsoidRadiusAlong(rel: Vec3Like): number {
  const r = Math.hypot(rel.x, rel.y, rel.z);
  if (r < 1e-12) return WGS84_A_KM;
  const zetaHat = (rel.y * POLE_Y + rel.z * POLE_Z) / r;
  const rhoHat2 = Math.max(0, 1 - zetaHat * zetaHat);
  return 1 / Math.sqrt(rhoHat2 / A2 + (zetaHat * zetaHat) / B2);
}

/**
 * Height (km) along the geocentric radial above the ellipsoid.
 * Negative when `rel` is inside the figure.
 */
export function ellipsoidalHeightKm(rel: Vec3Like): number {
  return Math.hypot(rel.x, rel.y, rel.z) - ellipsoidRadiusAlong(rel);
}

/**
 * Shared surface shell along `rel`: ellipsoid radius + {@link EARTH_SURFACE_ALT_KM}.
 */
export function earthSurfaceRadiusAlong(rel: Vec3Like): number {
  return ellipsoidRadiusAlong(rel) + EARTH_SURFACE_ALT_KM;
}

/**
 * Starbase satellite ground plate — geographic yaw + planar UVs.
 *
 * The photo is a north-up square (~16 km) centered on the pad. The 3D pad
 * group only aligns +Y to local up (`setFromUnitVectors`), so this module
 * yaws **the plate only** until plate +Z = geographic north. Scene unit = 1 km.
 */

import { STARBASE_LAT, STARBASE_LON } from "../physics/constants";
import { geodeticToMeshLocal } from "../physics/earthFrame";

/** Inner hole so the photo’s real OLM is not drawn under Mechazilla (km). */
export const STARBASE_PLATE_INNER_KM = 0.12;

/** Outer radius — Gulf + South Bay around the pad (km). */
export const STARBASE_PLATE_OUTER_KM = 8;

/** Pad-local Y of the plate, slightly below hardstand slabs (km). */
export const STARBASE_PLATE_Y_KM = -0.008;

/**
 * Planar UV for a north-up square photo covering ±`outerKm`.
 * Plate local: +X east, +Z north (after {@link starbasePlateYawRad}).
 *
 * @returns `[u, v]` in 0…1 (v=1 is north / top of the JPEG)
 */
export function starbasePlateUv(
  xKm: number,
  zKm: number,
  outerKm = STARBASE_PLATE_OUTER_KM,
): [number, number] {
  const s = 1 / (2 * outerKm);
  return [0.5 + xKm * s, 0.5 + zKm * s];
}

/**
 * Yaw (rad about pad +Y) that aligns plate +Z with geographic north.
 *
 * Matches `THREE.Quaternion.setFromUnitVectors(+Y, mesh-local up)` used by
 * `placePadOnEarth`. Degenerate at the poles (returns 0).
 */
export function starbasePlateYawRad(
  lat = STARBASE_LAT,
  lon = STARBASE_LON,
): number {
  const up = unitMeshUp(lat, lon);
  const eastLen = Math.hypot(up.z, up.x);
  if (eastLen < 1e-12) return 0;
  const north = meshLocalNorth(up, eastLen);
  const local = meshToPadLocal(north.x, north.y, north.z, up.x, up.y, up.z);
  return Math.atan2(local.x, local.z);
}

/** Unit mesh-local geocentric up at lat/lon. */
function unitMeshUp(lat: number, lon: number): { x: number; y: number; z: number } {
  const p = geodeticToMeshLocal(lat, lon, 1);
  const len = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / len, y: p.y / len, z: p.z / len };
}

/**
 * Geographic north in mesh-local: east = +Y × up, north = up × east.
 * `eastLen` is |+Y × up| = hypot(up.z, up.x).
 */
function meshLocalNorth(
  up: { x: number; y: number; z: number },
  eastLen: number,
): { x: number; y: number; z: number } {
  const inv = 1 / eastLen;
  const ex = up.z * inv;
  const ez = -up.x * inv;
  const nx = up.y * ez;
  const ny = up.z * ex - up.x * ez;
  const nz = -up.y * ex;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / nLen, y: ny / nLen, z: nz / nLen };
}

/**
 * Inverse of setFromUnitVectors(+Y → up): mesh vector → pad-local.
 * Same Rodrigues as `earthFrame` `applyAlignNorthToY`.
 */
function meshToPadLocal(
  vx: number,
  vy: number,
  vz: number,
  ux: number,
  uy: number,
  uz: number,
): { x: number; y: number; z: number } {
  const sinA = Math.hypot(uz, ux);
  if (sinA < 1e-12) {
    return uy > 0 ? { x: vx, y: vy, z: vz } : { x: vx, y: -vy, z: -vz };
  }
  const inv = 1 / sinA;
  const kx = uz * inv;
  const kz = -ux * inv;
  const c = uy;
  const s = -sinA;
  const t = 1 - c;
  const kdot = kx * vx + kz * vz;
  return {
    x: vx * c + (0 - kz * vy) * s + kx * kdot * t,
    y: vy * c + (kz * vx - kx * vz) * s,
    z: vz * c + (kx * vy - 0) * s + kz * kdot * t,
  };
}

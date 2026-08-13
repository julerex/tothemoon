/**
 * Starbase satellite ground plate — geographic yaw, planar UVs, sphere drape.
 *
 * The photo is a north-up square centered on the pad (full JPEG, not a circular
 * crop). The 3D pad group only aligns +Y to local up (`setFromUnitVectors`), so
 * this module yaws **the plate only** until plate +Z = geographic north.
 * Vertices are draped onto the Earth sphere so a wide plate stays on the globe.
 * Scene unit = 1 km.
 */

import { R_EARTH, STARBASE_LAT, STARBASE_LON } from "../physics/constants";
import { geodeticToMeshLocal } from "../physics/earthFrame";

/** Inner hole so the photo’s real OLM is not drawn under Mechazilla (km). */
export const STARBASE_PLATE_INNER_KM = 0.12;

/**
 * Half-extent of the square plate (km). ±this in east and north; the JPEG
 * covers the full square (Gulf, South Bay, Brownsville, South Padre Island).
 */
export const STARBASE_PLATE_HALF_KM = 40;

/** Pad-local Y of the plate, slightly below hardstand slabs (km). */
export const STARBASE_PLATE_Y_KM = -0.008;

/** Grid density for draping the square onto the sphere. */
export const STARBASE_PLATE_SEGS = 48;

/**
 * Planar UV for a north-up square photo covering ±`halfKm`.
 * Plate local: +X east, +Z north (after {@link starbasePlateYawRad}).
 *
 * @returns `[u, v]` in 0…1 (v=1 is north / top of the JPEG)
 */
export function starbasePlateUv(
  xKm: number,
  zKm: number,
  halfKm = STARBASE_PLATE_HALF_KM,
): [number, number] {
  const s = 1 / (2 * halfKm);
  return [0.5 + xKm * s, 0.5 + zKm * s];
}

/**
 * Drop a tangent-plane point `(x, 0, z)` onto the Earth sphere of `radiusKm`.
 * Earth center is pad-local `(0, −R, 0)`. Center stays at y≈0; edges sink.
 */
export function drapePlatePoint(
  xKm: number,
  zKm: number,
  radiusKm: number,
): { x: number; y: number; z: number } {
  const len = Math.hypot(xKm, radiusKm, zKm) || 1;
  return {
    x: (radiusKm * xKm) / len,
    y: -radiusKm + (radiusKm * radiusKm) / len,
    z: (radiusKm * zKm) / len,
  };
}

/**
 * WMS 1.1.1 EPSG:4326 bbox (degrees) for the km-square plate, tangent-plane
 * east/north extents converted with mean-radius small-angle mapping.
 */
export function starbasePlateWmsBboxDeg(
  halfKm = STARBASE_PLATE_HALF_KM,
  lat = STARBASE_LAT,
  lon = STARBASE_LON,
  radiusKm = R_EARTH,
): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const dlat = halfKm / radiusKm;
  const dlon = halfKm / (radiusKm * Math.cos(lat));
  return {
    minLon: (lon - dlon) * (180 / Math.PI),
    maxLon: (lon + dlon) * (180 / Math.PI),
    minLat: (lat - dlat) * (180 / Math.PI),
    maxLat: (lat + dlat) * (180 / Math.PI),
  };
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

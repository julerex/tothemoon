/**
 * Starbase satellite ground plate — geographic yaw, planar UVs, sphere drape.
 *
 * Photos are north-up squares centered on the committed WMS pin (full JPEG,
 * not a circular crop): an ~80 km Sentinel-2 surrounds plate, five landward
 * 80 km neighbors (N / NW / W / SW / S), plus a nested ~8 km USDA NAIP pad
 * plate. The 3D pad group aligns +Y to local up then
 * yaws about +Y so pad +Z is geographic north (`placePadOnEarth`). Plates
 * inherit that yaw and sit on this JPEG pin — do not yaw the mesh again.
 * Right-handed +Y-up then puts pad +X **west** (east × north = up, so
 * north × up = east = −X). UVs must increase toward −X or the Gulf lands
 * inland.
 * Vertices are draped onto the Earth sphere so a wide plate stays on the globe.
 * Scene unit = 1 km.
 */

import { R_EARTH, STARBASE_LAT, STARBASE_LON } from "../physics/constants";
import { geodeticToMeshLocal } from "../physics/earthFrame";

/** Center of the committed Sentinel-2 / NAIP JPEGs (degrees, not the OLP-2 OLM). */
export const STARBASE_PLATE_LAT_DEG = 25.997;
export const STARBASE_PLATE_LON_DEG = -97.156;
export const STARBASE_PLATE_LAT = (STARBASE_PLATE_LAT_DEG * Math.PI) / 180;
export const STARBASE_PLATE_LON = (STARBASE_PLATE_LON_DEG * Math.PI) / 180;

/**
 * Half-extent of the square plate (km). ±this in east and north; the JPEG
 * covers the full square (Gulf, South Bay, Brownsville, South Padre Island).
 */
export const STARBASE_PLATE_HALF_KM = 40;

/**
 * Half-extent of the nested USDA NAIP pad plate (km). Covers both orbital
 * pads, the tank farm, and the production site a few km west of the beach.
 */
export const STARBASE_PAD_PLATE_HALF_KM = 4;

/** Pad-local Y of the plate, slightly below hardstand slabs (km). */
export const STARBASE_PLATE_Y_KM = -0.008;

/** Pad-local Y of the NAIP plate, a hair above the wide Sentinel-2 plate. */
export const STARBASE_PAD_PLATE_Y_KM = -0.007;

/** Grid density for draping the square onto the sphere. */
export const STARBASE_PLATE_SEGS = 48;

/** Full width of one Sentinel-2 square (km). Adjacent plates step by this. */
export const STARBASE_PLATE_STEP_KM = STARBASE_PLATE_HALF_KM * 2;

/** Which JPEG edges fade into Blue Marble (shared edges stay opaque). */
export type PlateEdgeFade = Readonly<{
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}>;

/**
 * Landward 80 km neighbors of the committed Starbase plate. East / NE / SE
 * are Gulf of Mexico, so they stay Blue Marble.
 */
export type StarbaseLandPlateId = "n" | "nw" | "w" | "sw" | "s";

export type StarbaseLandPlate = {
  id: StarbaseLandPlateId;
  /** Integer tile steps east of the JPEG pin (negative = west). */
  eastSteps: number;
  /** Integer tile steps north of the JPEG pin (negative = south). */
  northSteps: number;
  file: string;
  name: string;
  fade: PlateEdgeFade;
};

export const STARBASE_LAND_PLATES: readonly StarbaseLandPlate[] = [
  {
    id: "n",
    eastSteps: 0,
    northSteps: 1,
    file: "starbase_surrounds_n.jpg",
    name: "pad-satellite-plate-n",
    fade: { n: true, e: true, s: false, w: false },
  },
  {
    id: "nw",
    eastSteps: -1,
    northSteps: 1,
    file: "starbase_surrounds_nw.jpg",
    name: "pad-satellite-plate-nw",
    fade: { n: true, e: false, s: false, w: true },
  },
  {
    id: "w",
    eastSteps: -1,
    northSteps: 0,
    file: "starbase_surrounds_w.jpg",
    name: "pad-satellite-plate-w",
    fade: { n: false, e: false, s: false, w: true },
  },
  {
    id: "sw",
    eastSteps: -1,
    northSteps: -1,
    file: "starbase_surrounds_sw.jpg",
    name: "pad-satellite-plate-sw",
    fade: { n: false, e: false, s: true, w: true },
  },
  {
    id: "s",
    eastSteps: 0,
    northSteps: -1,
    file: "starbase_surrounds_s.jpg",
    name: "pad-satellite-plate-s",
    fade: { n: false, e: true, s: true, w: false },
  },
];

/** Center plate meets land neighbors on N/W/S; only the Gulf (east) fades. */
export const STARBASE_CENTER_PLATE_FADE: PlateEdgeFade = {
  n: false,
  e: true,
  s: false,
  w: false,
};

/** Soft-rim width as a fraction of the JPEG (matches the old all-edge fade). */
export const STARBASE_PLATE_FADE = 0.08;

/**
 * Alpha 0…1 at JPEG UV (`u` east, `v` north). Listed edges soften into the
 * globe; unlisted edges stay opaque so adjacent plates can share a seam.
 */
export function plateEdgeAlpha(
  u: number,
  v: number,
  fade: PlateEdgeFade,
  width = STARBASE_PLATE_FADE,
): number {
  let a = 1;
  if (fade.w && u < width) a = Math.min(a, u / width);
  if (fade.e && u > 1 - width) a = Math.min(a, (1 - u) / width);
  if (fade.s && v < width) a = Math.min(a, v / width);
  if (fade.n && v > 1 - width) a = Math.min(a, (1 - v) / width);
  if (a < 0) return 0;
  if (a > 1) return 1;
  return a;
}

/** Geographic east/north of a plate center from the JPEG pin (km). */
export function starbasePlateEastNorthKm(
  eastSteps: number,
  northSteps: number,
): { eastKm: number; northKm: number } {
  return {
    eastKm: eastSteps * STARBASE_PLATE_STEP_KM,
    northKm: northSteps * STARBASE_PLATE_STEP_KM,
  };
}

/**
 * Pad-local offset of a plate center from the JPEG pin.
 * +X west, +Z north (same frame as {@link starbasePlateUv}).
 */
export function starbasePlatePadLocalOffset(
  eastSteps: number,
  northSteps: number,
): { x: number; z: number } {
  const { eastKm, northKm } = starbasePlateEastNorthKm(eastSteps, northSteps);
  return { x: -eastKm, z: northKm };
}

/**
 * Planar UV for a north-up square photo covering ±`halfKm`.
 * After {@link starbasePlateYawRad}, plate local is right-handed +Y up:
 * +Z north, +X west. U increases toward geographic east (−X); V toward
 * north (+Z), the top of the JPEG (Three.js `flipY`).
 *
 * @returns `[u, v]` in 0…1 (u=1 east / right of the JPEG, v=1 north / top)
 */
export function starbasePlateUv(
  xKm: number,
  zKm: number,
  halfKm = STARBASE_PLATE_HALF_KM,
): [number, number] {
  const s = 1 / (2 * halfKm);
  return [0.5 - xKm * s, 0.5 + zKm * s];
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
  lat = STARBASE_PLATE_LAT,
  lon = STARBASE_PLATE_LON,
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
 * WMS bbox for a neighbor square that shares edges with the center plate.
 * Uses the center plate’s lon/lat spans so tiles stitch without a gap.
 */
export function starbaseNeighborPlateWmsBboxDeg(
  eastSteps: number,
  northSteps: number,
): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const c = starbasePlateWmsBboxDeg();
  const lonSpan = c.maxLon - c.minLon;
  const latSpan = c.maxLat - c.minLat;
  return {
    minLon: c.minLon + eastSteps * lonSpan,
    maxLon: c.maxLon + eastSteps * lonSpan,
    minLat: c.minLat + northSteps * latSpan,
    maxLat: c.maxLat + northSteps * latSpan,
  };
}

/**
 * Yaw (rad about pad +Y) that aligns pad +Z with geographic north.
 * Pad +X is then west (right-handed +Y up); {@link starbasePlateUv}
 * maps geographic east (−X) to the JPEG’s right edge.
 *
 * Applied by `placePadOnEarth` (not on the plate mesh). Matches
 * `THREE.Quaternion.setFromUnitVectors(+Y, mesh-local up)`. Degenerate at
 * the poles (returns 0).
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

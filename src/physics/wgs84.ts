/**
 * WGS84 Earth figure (theater-grade).
 *
 * Pad, splash, booster floor, and low-altitude guidance share this ellipsoid.
 * Visual Earth vertices use the same ECEF mapping so physics and the mesh do
 * not fork a second radius. Mean {@link R_EARTH} stays the spherical HUD /
 * overlay radius.
 *
 * Scene unit = 1 km.
 */

import { EARTH_SURFACE_ALT_KM, R_EARTH } from "./constants";
import { len, type V3, v3 } from "./vec3";

/** WGS84 semi-major axis (equatorial radius, km). */
export const WGS84_A = 6378.137;

/** WGS84 flattening. */
export const WGS84_F = 1 / 298.257_223_563;

/** WGS84 semi-minor axis (polar radius, km). */
export const WGS84_B = WGS84_A * (1 - WGS84_F);

/** First eccentricity squared, e² = f(2 − f). */
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);

const _ecef = v3();

function clampUnit(x: number): number {
  if (x > 1) return 1;
  if (x < -1) return -1;
  return x;
}

/**
 * Prime-vertical radius of curvature N(φ) (km).
 *
 * @param lat - Geodetic latitude (rad)
 */
export function primeVerticalRadius(lat: number): number {
  const s = Math.sin(lat);
  return WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s);
}

/**
 * Geocentric radius of the WGS84 surface at geocentric latitude (km).
 *
 * Solves the ellipsoid (x²+z²)/a² + y²/b² = 1 along a geocentric ray.
 *
 * @param latGc - Geocentric latitude (rad), +north
 */
export function ellipsoidRadiusAtGeocentricLat(latGc: number): number {
  const c = Math.cos(latGc);
  const s = Math.sin(latGc);
  return 1 / Math.sqrt((c * c) / (WGS84_A * WGS84_A) + (s * s) / (WGS84_B * WGS84_B));
}

/**
 * Geocentric radius of the ellipsoid along Earth-relative `rel` (km).
 * `north` is the unit Earth north pole in the same frame as `rel`.
 */
export function ellipsoidRadiusAlongRel(rel: V3, north: V3): number {
  const r = len(rel);
  if (r < 1e-12) return WGS84_A;
  const sinLat = clampUnit((rel.x * north.x + rel.y * north.y + rel.z * north.z) / r);
  return ellipsoidRadiusAtGeocentricLat(Math.asin(sinLat));
}

/**
 * Radial height above the WGS84 surface (km): |rel| minus the ellipsoid
 * radius along that geocentric ray. Theater stand-in for geodetic height
 * (the difference is meters-class near the surface).
 */
export function radialHeightAboveEllipsoid(rel: V3, north: V3): number {
  return len(rel) - ellipsoidRadiusAlongRel(rel, north);
}

/**
 * Surface clamp radius along `rel`: ellipsoid + shared pad/splash height.
 */
export function earthSurfaceRadiusAlong(
  rel: V3,
  north: V3,
  heightKm = EARTH_SURFACE_ALT_KM,
): number {
  return ellipsoidRadiusAlongRel(rel, north) + heightKm;
}

/**
 * Lift `pos` onto the ellipsoid + `minHeightKm` along its geocentric ray.
 * No-op when already outside. Degenerate relative vectors are left unchanged.
 */
export function clampAboveEllipsoid(
  pos: V3,
  earth: V3,
  north: V3,
  minHeightKm = EARTH_SURFACE_ALT_KM,
): V3 {
  const dx = pos.x - earth.x;
  const dy = pos.y - earth.y;
  const dz = pos.z - earth.z;
  const r = Math.hypot(dx, dy, dz);
  if (!(r > 1e-6)) return pos;
  const rel = { x: dx, y: dy, z: dz };
  const minR = earthSurfaceRadiusAlong(rel, north, minHeightKm);
  if (r >= minR) return pos;
  const s = minR / r;
  return { x: earth.x + dx * s, y: earth.y + dy * s, z: earth.z + dz * s };
}

/**
 * Geodetic lat/lon/height → Earth mesh-local ECEF (km).
 *
 * Matches `geodeticToMeshLocal` UV convention (SphereGeometry: +Y north,
 * lon 0 at mesh +X) but uses WGS84 ECEF so the pad sits on the visual globe.
 *
 * @param lat - Geodetic latitude (rad)
 * @param lon - Geodetic longitude (rad, east-positive)
 * @param heightKm - Height above the ellipsoid along the geodetic normal
 */
export function geodeticToEllipsoidMeshLocal(
  lat: number,
  lon: number,
  heightKm: number,
  out: V3 = v3(),
): V3 {
  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  const n = primeVerticalRadius(lat);
  const rho = (n + heightKm) * cos;
  const theta = lon + Math.PI;
  out.x = -rho * Math.cos(theta);
  out.y = (n * (1 - WGS84_E2) + heightKm) * sin;
  out.z = rho * Math.sin(theta);
  return out;
}

/**
 * Geocentric radius (km) of a geodetic site at `heightKm` above the ellipsoid.
 * Axisymmetric — longitude does not matter.
 */
export function geocentricRadiusAt(lat: number, heightKm = 0): number {
  return len(geodeticToEllipsoidMeshLocal(lat, 0, heightKm, _ecef));
}

/**
 * Map a sphere vertex (parametric lat = geodetic) onto the WGS84 ellipsoid.
 *
 * Height is the spherical radius minus {@link R_EARTH}, so atmosphere / cloud
 * shells keep their geometric thickness while matching the surface figure.
 */
export function spherePointToWgs84(
  x: number,
  y: number,
  z: number,
  out: V3 = v3(),
): V3 {
  const r = Math.hypot(x, y, z);
  if (r < 1e-12) {
    out.x = 0;
    out.y = WGS84_B;
    out.z = 0;
    return out;
  }
  const lat = Math.asin(clampUnit(y / r));
  const lon = Math.atan2(z, -x) - Math.PI;
  return geodeticToEllipsoidMeshLocal(lat, lon, r - R_EARTH, out);
}

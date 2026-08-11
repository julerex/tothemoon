/**
 * Earth body frame aligned with the rendered globe.
 *
 * Conventions match scene/bodies.ts + Three.js SphereGeometry UVs:
 * - Mesh +Y = geographic north; texture lon 0° at mesh +X
 * - Axial tilt: mean north pole in **ecliptic J2000** (Horizons frame):
 *   n̂ = (0, sin ε, cos ε) — lean toward +Y (June solstice / RA 6h)
 * - Spin: rotation about local north at EARTH_SIDEREAL_DAY_S (same as visual)
 */

import {
  EARTH_OBLIQUITY,
  EARTH_SIDEREAL_DAY_S,
  R_EARTH,
  STARBASE_ALT,
  STARBASE_LAT,
  STARBASE_LON,
} from "./constants";
import { bodyPositions } from "./bodies";
import {
  DEFAULT_EPHEMERIS,
  type EphemerisEpoch,
} from "./ephemerisEpoch";
import {
  greenwichMeanSiderealTimeRad,
  missionUtcMsFromEpoch,
} from "./epoch";
import { cross, normalize, set, type V3, v3 } from "./vec3";

/** Sidereal spin rate (rad/s) — shared with scene Earth rotation. */
export const EARTH_SPIN_RATE = (2 * Math.PI) / EARTH_SIDEREAL_DAY_S;

/**
 * Mean Earth north pole in the theater ecliptic frame (J2000).
 * Matches standard equatorial→ecliptic: celestial north → (0, sin ε, cos ε).
 */
export function earthNorthPole(out: V3 = v3()): V3 {
  return set(
    out,
    0,
    Math.sin(EARTH_OBLIQUITY),
    Math.cos(EARTH_OBLIQUITY),
  );
}

/**
 * Spin angle about the north pole at mission time t (rad).
 * Equals Greenwich mean sidereal time at the absolute UTC for this mission clock — mesh lon 0° at
 * equinox when Greenwich mean sidereal time = 0 (calibrated to ecliptic J2000 + our SphereGeometry UVs).
 */
export function earthSpinAngle(
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  const utcMs = missionUtcMsFromEpoch(t, epoch);
  return greenwichMeanSiderealTimeRad(utcMs);
}

/** Sun elevation factor at Starbase: sin(el) ≈ sun·localUp (−1…1). */
export function starbaseSunElev(
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  const b = bodyPositions(t, epoch);
  const pad = starbasePadState(t, epoch);
  const sx = b.sun.x - b.earth.x;
  const sy = b.sun.y - b.earth.y;
  const sz = b.sun.z - b.earth.z;
  const sl = Math.hypot(sx, sy, sz) || 1;
  return (sx * pad.up.x + sy * pad.up.y + sz * pad.up.z) / sl;
}

/**
 * Geodetic → position in Earth mesh/local frame (before axis tilt + spin),
 * matching Three.js SphereGeometry + our equirectangular textures.
 */
export function geodeticToMeshLocal(
  lat: number,
  lon: number,
  radius: number,
  out: V3 = v3(),
): V3 {
  const phi = Math.PI / 2 - lat; // colatitude
  const theta = lon + Math.PI; // lon 0 → π → mesh +X
  const sphi = Math.sin(phi);
  // SphereGeometry: x = -r cosθ sinφ, y = r cosφ, z = r sinθ sinφ
  out.x = -radius * Math.cos(theta) * sphi;
  out.y = radius * Math.cos(phi);
  out.z = radius * Math.sin(theta) * sphi;
  return out;
}

const _local = v3();
const _spun = v3();
const _north = v3();
const _tmp = v3();
const _tmp2 = v3();
const _omega = v3();
/** Dedicated so surfaceState up/east are not clobbered by localEast scratch. */
const _upOut = v3();
const _eastOut = v3();

/**
 * Apply R that maps mesh +Y → unit `north` (same as THREE setFromUnitVectors).
 * Rodrigues about k ∥ (+Y)×north.
 */
function alignDegenerate(vx: number, vy: number, vz: number, cosA: number, out: V3): void {
  if (cosA > 0) set(out, vx, vy, vz);
  else set(out, vx, -vy, -vz);
}

function rodriguesAxis(nx: number, ny: number, nz: number): { kx: number; ky: number; kz: number; cosA: number; sinA: number } | null {
  const cosA = ny, sinA = Math.hypot(nz, 0, -nx);
  if (sinA < 1e-12) return null;
  const inv = 1 / sinA;
  return { kx: nz * inv, ky: 0, kz: -nx * inv, cosA, sinA };
}

function applyRodrigues(vx: number, vy: number, vz: number, ax: ReturnType<typeof rodriguesAxis> & object, sSign: number, out: V3): void {
  const { kx, ky, kz, cosA, sinA } = ax;
  const c = cosA, s = sSign * sinA, t = 1 - c;
  const kdot = kx * vx + ky * vy + kz * vz;
  out.x = vx * c + (ky * vz - kz * vy) * s + kx * kdot * t;
  out.y = vy * c + (kz * vx - kx * vz) * s + ky * kdot * t;
  out.z = vz * c + (kx * vy - ky * vx) * s + kz * kdot * t;
}

function applyAlignYToNorth(vx: number, vy: number, vz: number, nx: number, ny: number, nz: number, out: V3): void {
  const ax = rodriguesAxis(nx, ny, nz);
  if (!ax) { alignDegenerate(vx, vy, vz, ny, out); return; }
  applyRodrigues(vx, vy, vz, ax, 1, out);
}

/** Inverse of applyAlignYToNorth (Rodrigues with −θ, same k). */
function applyAlignNorthToY(vx: number, vy: number, vz: number, nx: number, ny: number, nz: number, out: V3): void {
  const ax = rodriguesAxis(nx, ny, nz);
  if (!ax) { alignDegenerate(vx, vy, vz, ny, out); return; }
  applyRodrigues(vx, vy, vz, ax, -1, out);
}

/**
 * Mesh local → inertial using the same composition as the scene graph:
 * world = R_axis · R_y(spin) · local, with R_axis: +Y → north pole.
 */
function spinRy(local: V3, spin: number, out: V3): void {
  const c = Math.cos(spin), s = Math.sin(spin);
  out.x = c * local.x + s * local.z;
  out.y = local.y;
  out.z = -s * local.x + c * local.z;
}

export function meshLocalToInertial(
  local: V3, t: number, out: V3 = v3(), epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  spinRy(local, earthSpinAngle(t, epoch), _spun);
  earthNorthPole(_north);
  applyAlignYToNorth(_spun.x, _spun.y, _spun.z, _north.x, _north.y, _north.z, out);
  return out;
}

/**
 * Inverse of meshLocalToInertial: Earth-relative inertial vector → mesh-local
 * (for parenting surface graphics under the spinning Earth mesh).
 */
export function inertialRelToMeshLocal(
  inertial: V3, t: number, out: V3 = v3(), epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  earthNorthPole(_north);
  applyAlignNorthToY(inertial.x, inertial.y, inertial.z, _north.x, _north.y, _north.z, _spun);
  spinRy(_spun, -earthSpinAngle(t, epoch), out);
  return out;
}

/** Unit local east at a mesh-local surface point (inertial), for due-east launch. */
export function localEastInertial(
  t: number,
  lat: number,
  lon: number,
  out: V3 = v3(),
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  // East = ∂position/∂lon direction
  const r = R_EARTH;
  const dLon = 1e-5;
  geodeticToMeshLocal(lat, lon + dLon, r, _local);
  meshLocalToInertial(_local, t, _tmp, epoch);
  geodeticToMeshLocal(lat, lon, r, _local);
  meshLocalToInertial(_local, t, _tmp2, epoch);
  set(out, _tmp.x - _tmp2.x, _tmp.y - _tmp2.y, _tmp.z - _tmp2.z);
  return normalize(out, out);
}

/** Unit local up (geocentric) in inertial frame at lat/lon. */
export function localUpInertial(
  t: number,
  lat: number,
  lon: number,
  out: V3 = v3(),
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  geodeticToMeshLocal(lat, lon, 1, _local);
  meshLocalToInertial(_local, t, out, epoch);
  return normalize(out, out);
}

export type SurfaceState = {
  pos: V3;
  vel: V3;
  up: V3;
  east: V3;
};

/**
 * Inertial position & velocity of a ground site (incl. Earth rotation).
 * `alt` is height above mean spherical Earth (km).
 */
function surfacePos(lat: number, lon: number, alt: number, t: number, outPos: V3, epoch: EphemerisEpoch): ReturnType<typeof bodyPositions> {
  const b = bodyPositions(t, epoch);
  geodeticToMeshLocal(lat, lon, R_EARTH + alt, _local);
  meshLocalToInertial(_local, t, outPos, epoch);
  outPos.x += b.earth.x; outPos.y += b.earth.y; outPos.z += b.earth.z;
  return b;
}

function surfaceSpinVel(outPos: V3, b: ReturnType<typeof bodyPositions>, outVel: V3): void {
  earthNorthPole(_north);
  const ω = (2 * Math.PI) / EARTH_SIDEREAL_DAY_S;
  set(_omega, _north.x * ω, _north.y * ω, _north.z * ω);
  set(_tmp, outPos.x - b.earth.x, outPos.y - b.earth.y, outPos.z - b.earth.z);
  cross(_tmp2, _omega, _tmp);
  set(outVel, b.earthVel.x + _tmp2.x, b.earthVel.y + _tmp2.y, b.earthVel.z + _tmp2.z);
}

function surfaceBasis(t: number, lat: number, lon: number, epoch: EphemerisEpoch, outPos: V3, outVel: V3): SurfaceState {
  localUpInertial(t, lat, lon, _upOut, epoch);
  localEastInertial(t, lat, lon, _eastOut, epoch);
  return {
    pos: outPos, vel: outVel,
    up: { x: _upOut.x, y: _upOut.y, z: _upOut.z },
    east: { x: _eastOut.x, y: _eastOut.y, z: _eastOut.z },
  };
}

export function surfaceState(
  lat: number, lon: number, alt: number, t: number,
  outPos: V3 = v3(), outVel: V3 = v3(), epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): SurfaceState {
  const b = surfacePos(lat, lon, alt, t, outPos, epoch);
  surfaceSpinVel(outPos, b, outVel);
  return surfaceBasis(t, lat, lon, epoch, outPos, outVel);
}

/** Starbase pad state at mission time t. */
export function starbasePadState(t: number, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): SurfaceState {
  return surfaceState(STARBASE_LAT, STARBASE_LON, STARBASE_ALT, t, v3(), v3(), epoch);
}

/** Local ENU-ish basis at an arbitrary Earth-relative position (for ascent guidance). */
function enuEast(outEast: V3, outUp: V3): void {
  earthNorthPole(_north);
  cross(outEast, _north, outUp);
  if (Math.hypot(outEast.x, outEast.y, outEast.z) < 1e-8) cross(outEast, set(_tmp2, 1, 0, 0), outUp);
  normalize(outEast, outEast);
}

export function enuAtPosition(
  t: number, pos: V3, earthPos: V3, outUp: V3, outEast: V3, outNorth: V3,
): void {
  set(_tmp, pos.x - earthPos.x, pos.y - earthPos.y, pos.z - earthPos.z);
  normalize(outUp, _tmp);
  enuEast(outEast, outUp);
  cross(outNorth, outUp, outEast);
  normalize(outNorth, outNorth);
  cross(outEast, outNorth, outUp);
  normalize(outEast, outEast);
  void t;
}

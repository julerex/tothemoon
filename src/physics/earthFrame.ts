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
import { gmstRad, missionUtcMs } from "./epoch";
import { getMissionLandingT } from "./horizonsEpoch";
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
 * Equals GMST at the absolute UTC for this mission clock — mesh lon 0° at
 * equinox when GMST = 0 (calibrated to ecliptic J2000 + our SphereGeometry UVs).
 */
export function earthSpinAngle(t: number): number {
  const utcMs = missionUtcMs(t, getMissionLandingT());
  return gmstRad(utcMs);
}

/** Sun elevation factor at Starbase: sin(el) ≈ sun·localUp (−1…1). */
export function starbaseSunElev(t: number): number {
  const b = bodyPositions(t);
  const pad = starbasePadState(t);
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
function applyAlignYToNorth(
  vx: number,
  vy: number,
  vz: number,
  nx: number,
  ny: number,
  nz: number,
  out: V3,
): void {
  // a = (0,1,0), b = n̂; cosθ = a·b = ny; k_raw = a×b = (nz, 0, −nx)
  const cosA = ny;
  let kx = nz;
  let ky = 0;
  let kz = -nx;
  const sinA = Math.hypot(kx, ky, kz);
  if (sinA < 1e-12) {
    if (cosA > 0) {
      // Identity
      out.x = vx;
      out.y = vy;
      out.z = vz;
    } else {
      // 180° about +X
      out.x = vx;
      out.y = -vy;
      out.z = -vz;
    }
    return;
  }
  const inv = 1 / sinA;
  kx *= inv;
  ky *= inv;
  kz *= inv;
  const c = cosA;
  const s = sinA;
  const t = 1 - c;
  const kdot = kx * vx + ky * vy + kz * vz;
  // v′ = v c + (k×v) s + k (k·v) (1−c)
  out.x = vx * c + (ky * vz - kz * vy) * s + kx * kdot * t;
  out.y = vy * c + (kz * vx - kx * vz) * s + ky * kdot * t;
  out.z = vz * c + (kx * vy - ky * vx) * s + kz * kdot * t;
}

/** Inverse of applyAlignYToNorth (Rodrigues with −θ, same k). */
function applyAlignNorthToY(
  vx: number,
  vy: number,
  vz: number,
  nx: number,
  ny: number,
  nz: number,
  out: V3,
): void {
  const cosA = ny;
  let kx = nz;
  let ky = 0;
  let kz = -nx;
  const sinA = Math.hypot(kx, ky, kz);
  if (sinA < 1e-12) {
    if (cosA > 0) {
      out.x = vx;
      out.y = vy;
      out.z = vz;
    } else {
      out.x = vx;
      out.y = -vy;
      out.z = -vz;
    }
    return;
  }
  const inv = 1 / sinA;
  kx *= inv;
  ky *= inv;
  kz *= inv;
  const c = cosA;
  const s = -sinA; // −θ
  const t = 1 - c;
  const kdot = kx * vx + ky * vy + kz * vz;
  out.x = vx * c + (ky * vz - kz * vy) * s + kx * kdot * t;
  out.y = vy * c + (kz * vx - kx * vz) * s + ky * kdot * t;
  out.z = vz * c + (kx * vy - ky * vx) * s + kz * kdot * t;
}

/**
 * Mesh local → inertial using the same composition as the scene graph:
 * world = R_axis · R_y(spin) · local, with R_axis: +Y → north pole.
 */
export function meshLocalToInertial(local: V3, t: number, out: V3 = v3()): V3 {
  const spin = earthSpinAngle(t);
  const c = Math.cos(spin);
  const s = Math.sin(spin);
  // R_y(spin)
  _spun.x = c * local.x + s * local.z;
  _spun.y = local.y;
  _spun.z = -s * local.x + c * local.z;

  earthNorthPole(_north);
  applyAlignYToNorth(
    _spun.x,
    _spun.y,
    _spun.z,
    _north.x,
    _north.y,
    _north.z,
    out,
  );
  return out;
}

/**
 * Inverse of meshLocalToInertial: Earth-relative inertial vector → mesh-local
 * (for parenting surface graphics under the spinning Earth mesh).
 */
export function inertialRelToMeshLocal(
  inertial: V3,
  t: number,
  out: V3 = v3(),
): V3 {
  earthNorthPole(_north);
  applyAlignNorthToY(
    inertial.x,
    inertial.y,
    inertial.z,
    _north.x,
    _north.y,
    _north.z,
    _spun,
  );

  const spin = earthSpinAngle(t);
  const c = Math.cos(-spin);
  const s = Math.sin(-spin);
  out.x = c * _spun.x + s * _spun.z;
  out.y = _spun.y;
  out.z = -s * _spun.x + c * _spun.z;
  return out;
}

/** Unit local east at a mesh-local surface point (inertial), for due-east launch. */
export function localEastInertial(t: number, lat: number, lon: number, out: V3 = v3()): V3 {
  // East = ∂position/∂lon direction
  const r = R_EARTH;
  const dLon = 1e-5;
  geodeticToMeshLocal(lat, lon + dLon, r, _local);
  meshLocalToInertial(_local, t, _tmp);
  geodeticToMeshLocal(lat, lon, r, _local);
  meshLocalToInertial(_local, t, _tmp2);
  set(out, _tmp.x - _tmp2.x, _tmp.y - _tmp2.y, _tmp.z - _tmp2.z);
  return normalize(out, out);
}

/** Unit local up (geocentric) in inertial frame at lat/lon. */
export function localUpInertial(t: number, lat: number, lon: number, out: V3 = v3()): V3 {
  geodeticToMeshLocal(lat, lon, 1, _local);
  meshLocalToInertial(_local, t, out);
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
export function surfaceState(
  lat: number,
  lon: number,
  alt: number,
  t: number,
  outPos: V3 = v3(),
  outVel: V3 = v3(),
): SurfaceState {
  const b = bodyPositions(t);
  const radius = R_EARTH + alt;
  geodeticToMeshLocal(lat, lon, radius, _local);
  meshLocalToInertial(_local, t, outPos);
  // Translate to barycentric (Earth center + relative)
  outPos.x += b.earth.x;
  outPos.y += b.earth.y;
  outPos.z += b.earth.z;

  // ω along north pole
  earthNorthPole(_north);
  const ω = (2 * Math.PI) / EARTH_SIDEREAL_DAY_S;
  set(_omega, _north.x * ω, _north.y * ω, _north.z * ω);
  // r_rel = pos - earth
  set(_tmp, outPos.x - b.earth.x, outPos.y - b.earth.y, outPos.z - b.earth.z);
  cross(_tmp2, _omega, _tmp); // spin velocity
  set(
    outVel,
    b.earthVel.x + _tmp2.x,
    b.earthVel.y + _tmp2.y,
    b.earthVel.z + _tmp2.z,
  );

  // Must not reuse _tmp/_tmp2: localEastInertial scratches those with R_EARTH-scale
  // positions and would leave `up` as a ~6400 km vector (pad hop → ~64 km/s).
  localUpInertial(t, lat, lon, _upOut);
  localEastInertial(t, lat, lon, _eastOut);
  return {
    pos: outPos,
    vel: outVel,
    up: { x: _upOut.x, y: _upOut.y, z: _upOut.z },
    east: { x: _eastOut.x, y: _eastOut.y, z: _eastOut.z },
  };
}

/** Starbase pad state at mission time t. */
export function starbasePadState(t: number): SurfaceState {
  return surfaceState(STARBASE_LAT, STARBASE_LON, STARBASE_ALT, t);
}

/** Local ENU-ish basis at an arbitrary Earth-relative position (for ascent guidance). */
export function enuAtPosition(
  t: number,
  pos: V3,
  earthPos: V3,
  outUp: V3,
  outEast: V3,
  outNorth: V3,
): void {
  set(_tmp, pos.x - earthPos.x, pos.y - earthPos.y, pos.z - earthPos.z);
  normalize(outUp, _tmp);
  earthNorthPole(_north);
  // east ∝ north × up (horizontal)
  cross(outEast, _north, outUp);
  if (Math.hypot(outEast.x, outEast.y, outEast.z) < 1e-8) {
    // near pole — use inertial X
    cross(outEast, set(_tmp2, 1, 0, 0), outUp);
  }
  normalize(outEast, outEast);
  cross(outNorth, outUp, outEast);
  normalize(outNorth, outNorth);
  // keep east = north × up re-orthogonalized
  cross(outEast, outNorth, outUp);
  normalize(outEast, outEast);
  void t;
}

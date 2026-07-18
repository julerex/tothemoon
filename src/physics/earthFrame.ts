/**
 * Earth body frame aligned with the rendered globe.
 *
 * Conventions match scene/bodies.ts + Three.js SphereGeometry UVs:
 * - Mesh +Y = geographic north; texture lon 0° at mesh +X
 * - Axial tilt: north pole = (sin ε, 0, cos ε) in the ecliptic frame
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
import { cross, normalize, set, type V3, v3 } from "./vec3";

/** Sidereal spin rate (rad/s) — shared with scene Earth rotation. */
export const EARTH_SPIN_RATE = (2 * Math.PI) / EARTH_SIDEREAL_DAY_S;

/** Sidereal spin phase at t = 0 (rad). 0 ⇒ texture lon 0 as defined below. */
export const EARTH_SPIN0 = 0;

/** Inertial north pole (Earth axis). */
export function earthNorthPole(out: V3 = v3()): V3 {
  return set(
    out,
    Math.sin(EARTH_OBLIQUITY),
    0,
    Math.cos(EARTH_OBLIQUITY),
  );
}

/** Spin angle about the north pole at mission time t (rad). */
export function earthSpinAngle(t: number): number {
  return EARTH_SPIN0 + (2 * Math.PI * t) / EARTH_SIDEREAL_DAY_S;
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

/**
 * Quaternion-free map: mesh local → inertial using the same composition as
 * earthAxis (Y→north) then rotY(spin) in the scene graph
 * (world = R_axis · R_y(spin) · local).
 */
export function meshLocalToInertial(local: V3, t: number, out: V3 = v3()): V3 {
  const spin = earthSpinAngle(t);
  const c = Math.cos(spin);
  const s = Math.sin(spin);
  // R_y(spin)
  _spun.x = c * local.x + s * local.z;
  _spun.y = local.y;
  _spun.z = -s * local.x + c * local.z;

  // R_axis = setFromUnitVectors(+Y, north). Y·n = 0 for our n (in XZ), so α = 90°.
  // k = normalize(Y × n) = (n.z, 0, −n.x); Rodrigues α=90°: v′ = k×v + k(k·v)
  earthNorthPole(_north);
  set(_tmp, _north.z, 0, -_north.x);
  if (Math.hypot(_tmp.x, _tmp.y, _tmp.z) < 1e-8) set(_tmp, 1, 0, 0);
  normalize(_tmp2, _tmp); // k
  const kx = _tmp2.x;
  const ky = _tmp2.y;
  const kz = _tmp2.z;
  const vx = _spun.x;
  const vy = _spun.y;
  const vz = _spun.z;
  const kdot = kx * vx + ky * vy + kz * vz;
  out.x = ky * vz - kz * vy + kx * kdot;
  out.y = kz * vx - kx * vz + ky * kdot;
  out.z = kx * vy - ky * vx + kz * kdot;
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

  localUpInertial(t, lat, lon, _tmp);
  localEastInertial(t, lat, lon, _tmp2);
  return {
    pos: outPos,
    vel: outVel,
    up: { x: _tmp.x, y: _tmp.y, z: _tmp.z },
    east: { x: _tmp2.x, y: _tmp2.y, z: _tmp2.z },
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

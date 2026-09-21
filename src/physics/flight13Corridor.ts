/**
 * Flight 13 launch corridor (mesh-local great-circle plane).
 *
 * The plane is the unique great circle through Starbase and Gauteng, oriented
 * eastward. There is no splash aim point: the ship meets the water where this
 * corridor and the force model put it. Used for ascent steering so the short
 * geodetic path west across the Pacific is not mistaken for the operational
 * eastward corridor.
 */

import { STARBASE_LAT, STARBASE_LON } from "./constants";
import {
  enuAtPosition,
  geodeticToMeshLocal,
  inertialRelToMeshLocal,
  meshLocalToInertial,
  starbasePadState,
} from "./earthFrame";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { getBodies } from "./integrator";
import {
  cross,
  dot,
  len,
  normalize,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

/** Johannesburg / Gauteng province (rad) — corridor waypoint. */
export const GAUTENG_LAT = (-26.2041 * Math.PI) / 180;
export const GAUTENG_LON = (28.0473 * Math.PI) / 180;

/** Mesh-local orthonormal basis for the Flight 13 Earth GC section. */
export type Flight13CorridorPlane = {
  /** Starbase radial projected into the plane. */
  u: V3;
  /** 90° along GC, eastward through Gauteng. */
  v: V3;
  /** Plane normal. */
  n: V3;
};

const _tmp = v3();
const _tmp2 = v3();
const _tmp3 = v3();
const _rel = v3();
const _mesh = v3();
const _up = v3();
const _east = v3();
const _north = v3();

/** Unit mesh-local radial for a geodetic site. */
export function siteUnit(lat: number, lon: number, out: V3 = v3()): V3 {
  geodeticToMeshLocal(lat, lon, 1, out);
  return normalize(out, out);
}

function flipV3(v: V3): V3 {
  return v3(-v.x, -v.y, -v.z);
}

function projectStarbaseU(s: V3, n: V3): V3 {
  const sn = dot(s, n);
  const uRaw = v3(s.x - n.x * sn, s.y - n.y * sn, s.z - n.z * sn);
  return normalize(v3(), uRaw);
}

function reorthonormalizeUV(u: V3, v: V3): { u: V3; v: V3; n: V3 } {
  cross(_tmp2, u, v);
  const n = normalize(v3(), _tmp2);
  cross(_tmp3, n, u);
  return { u, v: normalize(v3(), _tmp3), n };
}

function planeBasisFromSites(s: V3, g: V3): { u: V3; v: V3; n: V3 } {
  cross(_tmp, s, g);
  const n = normalize(v3(), _tmp);
  const u = projectStarbaseU(s, n);
  cross(_tmp, n, u);
  return { u, v: normalize(v3(), _tmp), n };
}

function orientPlaneTowardGauteng(
  u: V3,
  v: V3,
  n: V3,
  g: V3,
): { u: V3; v: V3; n: V3 } {
  if (Math.atan2(dot(g, v), dot(g, u)) < 0) v = flipV3(v);
  ({ u, v, n } = reorthonormalizeUV(u, v));
  if (Math.atan2(dot(g, v), dot(g, u)) < 0) {
    v = flipV3(v);
    n = flipV3(n);
  }
  return { u, v, n };
}

function computeGreatCirclePlane(): Flight13CorridorPlane {
  const s = siteUnit(STARBASE_LAT, STARBASE_LON, v3());
  const g = siteUnit(GAUTENG_LAT, GAUTENG_LON, v3());
  let { u, v, n } = planeBasisFromSites(s, g);
  ({ u, v, n } = orientPlaneTowardGauteng(u, v, n, g));
  return {
    u: Object.freeze(u),
    v: Object.freeze(v),
    n: Object.freeze(n),
  };
}

/**
 * Corridor geometry is fixed by site constants, so it is derived once at module
 * load and frozen rather than memoized behind mutable state.
 */
const GREAT_CIRCLE_PLANE: Flight13CorridorPlane = Object.freeze(computeGreatCirclePlane());

/**
 * Great-circle plane through Starbase and Gauteng (mesh-local, Earth-fixed).
 * Oriented Starbase → Gauteng, eastward.
 */
export function flight13GreatCirclePlane(): Flight13CorridorPlane {
  return GREAT_CIRCLE_PLANE;
}

function projectHoriz(vec: V3, up: V3, out: V3): boolean {
  const d = dot(vec, up);
  set(out, vec.x - up.x * d, vec.y - up.y * d, vec.z - up.z * d);
  if (len(out) < 1e-8) return false;
  normalize(out, out);
  return true;
}

function padEastFallback(t: number, out: V3, epoch?: EphemerisEpoch): V3 {
  const b = getBodies(t, epoch);
  const pad = starbasePadState(t, epoch);
  enuAtPosition(t, pad.pos, b.earth, _up, _east, _north);
  return set(out, _east.x, _east.y, _east.z);
}

/**
 * Horizontal unit along the eastward Flight 13 corridor at `pos` (inertial).
 * Tangent is n̂ × r̂ in the Earth GC plane (same sense as {@link flight13GreatCirclePlane}.v).
 */
export function corridorAlongAt(
  t: number,
  pos: V3,
  out: V3 = v3(),
  epoch?: EphemerisEpoch,
): V3 {
  const b = getBodies(t, epoch);
  sub(_rel, pos, b.earth);
  const r = len(_rel) || 1;
  set(_up, _rel.x / r, _rel.y / r, _rel.z / r);
  inertialRelToMeshLocal(_rel, t, _mesh, epoch);
  if (len(_mesh) < 1e-12) return padEastFallback(t, out, epoch);
  normalize(_mesh, _mesh);
  const plane = flight13GreatCirclePlane();
  cross(_tmp, plane.n, _mesh);
  if (len(_tmp) < 1e-8) return padEastFallback(t, out, epoch);
  normalize(_tmp, _tmp);
  meshLocalToInertial(_tmp, t, out, epoch);
  if (!projectHoriz(out, _up, out)) return padEastFallback(t, out, epoch);
  return out;
}

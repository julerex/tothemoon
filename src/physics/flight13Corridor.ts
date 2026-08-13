/**
 * Flight 13 launch corridor (mesh-local great-circle plane).
 *
 * Same Starbase → Gauteng → Indian Ocean section as the Earth GC view.
 * Used for ascent steering so the short geodetic path to splash (west across
 * the Pacific) is not mistaken for the operational eastward corridor.
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

/** Indian Ocean splash (theater — west of Australia; not a surveyed fix). */
export const FLIGHT13_SPLASH_LAT = (-31.5 * Math.PI) / 180;
export const FLIGHT13_SPLASH_LON = (95.0 * Math.PI) / 180;

/** Johannesburg / Gauteng province (rad) — corridor waypoint. */
export const GAUTENG_LAT = (-26.2041 * Math.PI) / 180;
export const GAUTENG_LON = (28.0473 * Math.PI) / 180;

/** Mesh-local orthonormal basis for the Flight 13 Earth GC section. */
export type Flight13CorridorPlane = {
  /** Starbase radial projected into the plane. */
  u: V3;
  /** 90° along GC toward splashdown (eastward corridor). */
  v: V3;
  /** Plane normal. */
  n: V3;
  /** Central angle Starbase → splashdown along the corridor (rad). */
  splashAngleRad: number;
};

const _tmp = v3();
const _tmp2 = v3();
const _tmp3 = v3();
const _rel = v3();
const _mesh = v3();
const _up = v3();
const _east = v3();
const _north = v3();

let _cachedPlane: Flight13CorridorPlane | null = null;

/** Unit mesh-local radial for a geodetic site. */
export function siteUnit(lat: number, lon: number, out: V3 = v3()): V3 {
  geodeticToMeshLocal(lat, lon, 0, out);
  return normalize(out, out);
}

function flipV3(v: V3): V3 {
  return v3(-v.x, -v.y, -v.z);
}

function bestFitNormal(s: V3, g: V3, splash: V3): V3 {
  cross(_tmp, s, g);
  cross(_tmp2, g, splash);
  cross(_tmp3, splash, s);
  const nRaw = v3(
    _tmp.x + _tmp2.x + _tmp3.x,
    _tmp.y + _tmp2.y + _tmp3.y,
    _tmp.z + _tmp2.z + _tmp3.z,
  );
  return normalize(v3(), nRaw);
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

function planeBasisFromSites(
  s: V3,
  g: V3,
  splash: V3,
): { u: V3; v: V3; n: V3 } {
  const n = bestFitNormal(s, g, splash);
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

function unwrapSplashAngle(splash: V3, u: V3, v: V3, g: V3): number {
  const gAng = Math.atan2(dot(g, v), dot(g, u));
  let splashAngleRad = Math.atan2(dot(splash, v), dot(splash, u));
  while (splashAngleRad < gAng) splashAngleRad += 2 * Math.PI;
  if (splashAngleRad - gAng > Math.PI && splashAngleRad - 2 * Math.PI > 0) {
    const alt = splashAngleRad - 2 * Math.PI;
    if (alt >= gAng * 0.5) splashAngleRad = alt;
  }
  return splashAngleRad;
}

/**
 * Best-fit great-circle plane through Starbase, Gauteng, and splashdown
 * (mesh-local, Earth-fixed). Oriented Starbase → Gauteng → landing.
 */
export function flight13GreatCirclePlane(): Flight13CorridorPlane {
  if (_cachedPlane) return _cachedPlane;
  const s = siteUnit(STARBASE_LAT, STARBASE_LON, v3());
  const g = siteUnit(GAUTENG_LAT, GAUTENG_LON, v3());
  const splash = siteUnit(FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON, v3());
  let { u, v, n } = planeBasisFromSites(s, g, splash);
  ({ u, v, n } = orientPlaneTowardGauteng(u, v, n, g));
  _cachedPlane = {
    u,
    v,
    n,
    splashAngleRad: unwrapSplashAngle(splash, u, v, g),
  };
  return _cachedPlane;
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

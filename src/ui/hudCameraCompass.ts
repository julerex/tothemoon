/**
 * 3D camera-rail compass: the local ENU disc as the camera sees it.
 *
 * The rose sits on the Earth-relative horizontal plane (N toward the pole).
 * Pitch is clamped so the widget stays an ellipse, not an edge-on line.
 */

import type { Vec3Json } from "../camera/worldPose";
import { earthNorthPole } from "../physics/earthFrame";

type CameraPoseVec = Readonly<Vec3Json>;

/** Max angle from nadir (face-on) so the rose stays readable. */
export const COMPASS_MAX_TILT_DEG = 60;

const MAX_TILT_RAD = (COMPASS_MAX_TILT_DEG * Math.PI) / 180;
const EPS_UP = 1e-6;
const EPS_AXIS = 1e-8;

/** Local east / north / up at the camera, or null at Earth's center / a pole. */
export type EarthEnu = {
  east: CameraPoseVec;
  north: CameraPoseVec;
  up: CameraPoseVec;
};

/**
 * Column-major 3×3 mapping compass-local CSS axes to camera CSS space:
 * +X = east, +Y = south (CSS Y is down), +Z = local up (labeled side).
 */
export type CompassCssBasis = {
  columns: readonly [
    number, number, number,
    number, number, number,
    number, number, number,
  ];
};

/** Face-on, N-up identity (no tilt, no in-plane rotation). */
export const COMPASS_CSS_IDENTITY =
  "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)";

/** ENU at `cam` relative to `earth`. */
export function earthEnuAt(
  cam: CameraPoseVec | null | undefined,
  earth: CameraPoseVec | null | undefined,
): EarthEnu | null {
  if (!isVec(cam) || !isVec(earth)) return null;
  const up = unitDiff(cam, earth, EPS_UP);
  if (!up) return null;
  const pole = earthNorthPole();
  const east = unitCross(pole, up, EPS_AXIS);
  if (!east) return null;
  const north = unitCross(up, east, EPS_AXIS);
  if (!north) return null;
  return { east, north, up };
}

/**
 * Compass disc orientation in CSS camera space.
 * Null when the ENU frame or camera basis cannot be formed.
 */
export function cameraCompassBasis(
  look: CameraPoseVec | null | undefined,
  cam: CameraPoseVec | null | undefined,
  earth: CameraPoseVec | null | undefined,
  camUp: CameraPoseVec | null | undefined,
): CompassCssBasis | null {
  const enu = earthEnuAt(cam, earth);
  const lookU = unitOf(look, EPS_UP);
  if (!enu || !lookU) return null;
  const viewLook = virtualLook(lookU, enu.up);
  const viewUp = unitOf(camUp, EPS_UP) ?? enu.up;
  const right = unitCross(viewLook, viewUp, EPS_AXIS) ?? enu.east;
  const screenUp = unitCross(right, viewLook, EPS_AXIS);
  if (!screenUp) return null;
  const east = toCss(enu.east, right, screenUp, viewLook);
  const south = toCss(neg(enu.north), right, screenUp, viewLook);
  const up = toCss(enu.up, right, screenUp, viewLook);
  return {
    columns: [
      east.x, east.y, east.z,
      south.x, south.y, south.z,
      up.x, up.y, up.z,
    ],
  };
}

/** CSS `matrix3d(...)` for the compass SVG, or the face-on identity. */
export function compassCssMatrix3d(basis: CompassCssBasis | null): string {
  if (!basis) return COMPASS_CSS_IDENTITY;
  const m = basis.columns;
  return `matrix3d(${m[0]},${m[1]},${m[2]},0,${m[3]},${m[4]},${m[5]},0,${m[6]},${m[7]},${m[8]},0,0,0,0,1)`;
}

/**
 * Look used to *view* the disc: same azimuth as `look`, pitched from nadir
 * by at most {@link COMPASS_MAX_TILT_DEG} so the rose never goes edge-on.
 */
function virtualLook(look: CameraPoseVec, up: CameraPoseVec): CameraPoseVec {
  const towardNadir = neg(up);
  const hx = look.x - up.x * dot(look, up);
  const hy = look.y - up.y * dot(look, up);
  const hz = look.z - up.z * dot(look, up);
  const hl = Math.hypot(hx, hy, hz);
  if (!(hl > EPS_UP)) return towardNadir;
  const inv = 1 / hl;
  const angle = Math.acos(clamp1(dot(look, towardNadir)));
  const t = Math.min(angle, MAX_TILT_RAD);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return {
    x: towardNadir.x * c + hx * inv * s,
    y: towardNadir.y * c + hy * inv * s,
    z: towardNadir.z * c + hz * inv * s,
  };
}

function toCss(
  v: CameraPoseVec,
  right: CameraPoseVec,
  screenUp: CameraPoseVec,
  look: CameraPoseVec,
): CameraPoseVec {
  return {
    x: dot(v, right),
    y: -dot(v, screenUp),
    z: -dot(v, look),
  };
}

function unitDiff(
  a: CameraPoseVec,
  b: CameraPoseVec,
  eps: number,
): CameraPoseVec | null {
  return unitOf({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }, eps);
}

function unitCross(
  a: CameraPoseVec,
  b: CameraPoseVec,
  eps: number,
): CameraPoseVec | null {
  return unitOf(
    {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    },
    eps,
  );
}

function unitOf(
  v: CameraPoseVec | null | undefined,
  eps: number,
): CameraPoseVec | null {
  if (!isVec(v)) return null;
  const L = Math.hypot(v.x, v.y, v.z);
  if (!(L > eps)) return null;
  return { x: v.x / L, y: v.y / L, z: v.z / L };
}

function dot(a: CameraPoseVec, b: CameraPoseVec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function neg(v: CameraPoseVec): CameraPoseVec {
  return { x: -v.x, y: -v.y, z: -v.z };
}

function clamp1(n: number): number {
  if (n > 1) return 1;
  if (n < -1) return -1;
  return n;
}

function isVec(v: CameraPoseVec | null | undefined): v is CameraPoseVec {
  return (
    !!v &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.z)
  );
}

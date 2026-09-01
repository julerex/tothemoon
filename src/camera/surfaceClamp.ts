/**
 * Sun exclusion for the free camera, plus Earth / Moon underground tests.
 *
 * OrbitControls only limits distance to its focus target. The Sun still
 * pushes the eye out (no "underground" analog). Earth and Moon no longer
 * lock — the theater shows a brown overlay instead.
 */

import { EARTH_SURFACE_ALT_KM } from "../physics/constants";
import { radialHeightAboveEllipsoid } from "../physics/wgs84";

/**
 * Extra km above the mesh radius so the near plane does not bite into terrain.
 * Same value as the physics/visual Earth surface shell.
 */
export const SURFACE_CLEARANCE_KM = EARTH_SURFACE_ALT_KM;

export type BodySphere = {
  x: number;
  y: number;
  z: number;
  /** Exclusion radius (body radius + clearance), km. */
  r: number;
};

export type Vec3Like = { x: number; y: number; z: number };

/** Push (x,y,z) onto sphere surface if inside; returns new coords + whether moved. */
function pushOneSphere(
  x: number,
  y: number,
  z: number,
  b: BodySphere,
): { x: number; y: number; z: number; moved: boolean } {
  const dx = x - b.x;
  const dy = y - b.y;
  const dz = z - b.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const minR = b.r;
  if (!(minR > 0) || d2 >= minR * minR) return { x, y, z, moved: false };
  return projectOntoSphere(b, dx, dy, dz, d2, minR);
}

function projectOntoSphere(
  b: BodySphere,
  dx: number,
  dy: number,
  dz: number,
  d2: number,
  minR: number,
): { x: number; y: number; z: number; moved: boolean } {
  const d = Math.sqrt(d2);
  if (d < 1e-12) {
    // Exactly at the center — pick +X in body frame
    return { x: b.x + minR, y: b.y, z: b.z, moved: true };
  }
  const s = minR / d;
  return { x: b.x + dx * s, y: b.y + dy * s, z: b.z + dz * s, moved: true };
}

function applyPushLoop(
  x: number, y: number, z: number, bodies: readonly BodySphere[],
): { x: number; y: number; z: number; moved: boolean } {
  let moved = false;
  for (const b of bodies) {
    const r = pushOneSphere(x, y, z, b);
    x = r.x; y = r.y; z = r.z;
    if (r.moved) moved = true;
  }
  return { x, y, z, moved };
}

/**
 * If `pos` is inside any sphere, push it radially onto that sphere's surface.
 * Processes bodies in order; returns true when the position was changed.
 */
export function pushOutsideSpheres(
  pos: Vec3Like,
  bodies: readonly BodySphere[],
  out: Vec3Like = pos,
): boolean {
  const r = applyPushLoop(pos.x, pos.y, pos.z, bodies);
  out.x = r.x; out.y = r.y; out.z = r.z;
  return r.moved;
}

/**
 * Build exclusion spheres for Sun / Earth / Moon at the given body centers.
 * `r` includes {@link SURFACE_CLEARANCE_KM}.
 */
export function solarSystemExclusionSpheres(
  sun: Vec3Like,
  earth: Vec3Like,
  moon: Vec3Like,
  radii: { sun: number; earth: number; moon: number },
): BodySphere[] {
  const c = SURFACE_CLEARANCE_KM;
  return [
    { x: sun.x, y: sun.y, z: sun.z, r: radii.sun + c },
    { x: earth.x, y: earth.y, z: earth.z, r: radii.earth + c },
    { x: moon.x, y: moon.y, z: moon.z, r: radii.moon + c },
  ];
}

/** Body centers and spherical radii for the free-camera clamp. */
export type SolarSystemBodies = {
  sun: Vec3Like;
  earth: Vec3Like;
  moon: Vec3Like;
  /** Earth north pole (same frame as the centers). */
  north: Vec3Like;
  sunRadius: number;
  moonRadius: number;
};

/**
 * Push `pos` outside the Sun sphere + {@link SURFACE_CLEARANCE_KM}.
 * Earth and Moon are not clamped — {@link cameraUnderground} reports those.
 *
 * @returns true when the position changed.
 */
export function clampOutsideBodies(
  pos: Vec3Like,
  bodies: SolarSystemBodies,
  out: Vec3Like = pos,
): boolean {
  return pushOutsideSpheres(pos, [
    {
      x: bodies.sun.x,
      y: bodies.sun.y,
      z: bodies.sun.z,
      r: bodies.sunRadius + SURFACE_CLEARANCE_KM,
    },
  ], out);
}

function insideMoonSphere(pos: Vec3Like, moon: Vec3Like, radius: number): boolean {
  if (!(radius > 0)) return false;
  const dx = pos.x - moon.x;
  const dy = pos.y - moon.y;
  const dz = pos.z - moon.z;
  return dx * dx + dy * dy + dz * dz < radius * radius;
}

function insideEarthEllipsoid(
  pos: Vec3Like,
  earth: Vec3Like,
  north: Vec3Like,
): boolean {
  return radialHeightAboveEllipsoid(
    { x: pos.x - earth.x, y: pos.y - earth.y, z: pos.z - earth.z },
    north,
  ) < 0;
}

/**
 * True when `pos` is under the WGS84 Earth ellipsoid or inside the Moon
 * sphere (the visual meshes). On-surface points are not underground.
 */
export function cameraUnderground(
  pos: Vec3Like,
  bodies: Pick<SolarSystemBodies, "earth" | "moon" | "north" | "moonRadius">,
): boolean {
  return (
    insideMoonSphere(pos, bodies.moon, bodies.moonRadius) ||
    insideEarthEllipsoid(pos, bodies.earth, bodies.north)
  );
}

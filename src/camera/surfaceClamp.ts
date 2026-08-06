/**
 * Keep the free camera outside solid body spheres (Earth, Moon, Sun).
 *
 * OrbitControls only limits distance to its focus target; when the target is on
 * a surface (Starbase) or free-panned, the camera can still dive under the
 * mesh. Radial push-out against each body sphere fixes that.
 */

/** Extra km above the mesh radius so the near plane does not bite into terrain. */
export const SURFACE_CLEARANCE_KM = 0.05;

export type BodySphere = {
  x: number;
  y: number;
  z: number;
  /** Exclusion radius (body radius + clearance), km. */
  r: number;
};

export type Vec3Like = { x: number; y: number; z: number };

/**
 * If `pos` is inside any sphere, push it radially onto that sphere's surface.
 * Processes bodies in order; returns true when the position was changed.
 */
export function pushOutsideSpheres(
  pos: Vec3Like,
  bodies: readonly BodySphere[],
  out: Vec3Like = pos,
): boolean {
  let x = pos.x;
  let y = pos.y;
  let z = pos.z;
  let moved = false;

  for (const b of bodies) {
    const dx = x - b.x;
    const dy = y - b.y;
    const dz = z - b.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const minR = b.r;
    if (!(minR > 0) || d2 >= minR * minR) continue;

    const d = Math.sqrt(d2);
    if (d < 1e-12) {
      // Exactly at the center — pick +X in body frame
      x = b.x + minR;
      y = b.y;
      z = b.z;
    } else {
      const s = minR / d;
      x = b.x + dx * s;
      y = b.y + dy * s;
      z = b.z + dz * s;
    }
    moved = true;
  }

  out.x = x;
  out.y = y;
  out.z = z;
  return moved;
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

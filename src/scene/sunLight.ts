/**
 * Ephemeris-driven directional sun light.
 *
 * Places the light on a **unit** Earth→Sun offset and aims at Earth center so
 * direction is correct without AU-scale light positions (which fight
 * logarithmic depth and leave the pad looking unlit).
 */

import type * as THREE from "three";

export type Vec3Like = { x: number; y: number; z: number };

/**
 * Point `sunLight` along Earth→Sun and return the unit Earth→Sun vector
 * (also useful for ground-sky day factor).
 */
export function applySunLight(
  sunLight: THREE.DirectionalLight,
  sun: Vec3Like,
  earth: Vec3Like,
  outUnit?: THREE.Vector3,
): { x: number; y: number; z: number } {
  const dx = sun.x - earth.x;
  const dy = sun.y - earth.y;
  const dz = sun.z - earth.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;

  // Sit one unit sunward of Earth; rays travel toward Earth center
  sunLight.position.set(earth.x + ux, earth.y + uy, earth.z + uz);
  sunLight.target.position.set(earth.x, earth.y, earth.z);
  sunLight.target.updateMatrixWorld();

  if (outUnit) outUnit.set(ux, uy, uz);
  return { x: ux, y: uy, z: uz };
}

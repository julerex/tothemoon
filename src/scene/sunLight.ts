/**
 * Ephemeris-driven directional sun light + soft fill + Earthshine.
 *
 * Places lights on a **unit** offset from the body they illuminate and aims
 * at the body center so direction is correct without AU-scale light positions
 * (which fight logarithmic depth and leave the pad looking unlit).
 *
 * Theater-grade: soft anti-sun fill keeps night silhouettes readable; dim
 * Earthshine lights the Moon’s night side. Not physical radiometry.
 */

import type * as THREE from "three";

export type Vec3Like = { x: number; y: number; z: number };

/** Unit vector from `from` toward `to` (length 0 → `{1,0,0}`). */
export function unitToward(from: Vec3Like, to: Vec3Like): Vec3Like {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-12) return { x: 1, y: 0, z: 0 };
  return { x: dx / len, y: dy / len, z: dz / len };
}

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
  const u = unitToward(earth, sun);

  // Sit one unit sunward of Earth; rays travel toward Earth center
  sunLight.position.set(earth.x + u.x, earth.y + u.y, earth.z + u.z);
  sunLight.target.position.set(earth.x, earth.y, earth.z);
  sunLight.target.updateMatrixWorld();

  if (outUnit) outUnit.set(u.x, u.y, u.z);
  return u;
}

/**
 * Soft anti-sun fill so night sides keep a readable silhouette.
 * Uses the same unit-offset trick as {@link applySunLight}.
 *
 * @param sunUnit unit Earth→Sun (from {@link applySunLight})
 */
export function applyFillLight(
  fillLight: THREE.DirectionalLight,
  sunUnit: Vec3Like,
  earth: Vec3Like,
): void {
  // Light from anti-sun direction toward Earth
  fillLight.position.set(
    earth.x - sunUnit.x,
    earth.y - sunUnit.y,
    earth.z - sunUnit.z,
  );
  fillLight.target.position.set(earth.x, earth.y, earth.z);
  fillLight.target.updateMatrixWorld();
}

/**
 * Dim Earth-reflected light on the Moon (Earthshine).
 * Direction Earth → Moon; unit offset so AU-scale positions do not fight log depth.
 */
export function applyEarthshine(
  earthshine: THREE.DirectionalLight,
  earth: Vec3Like,
  moon: Vec3Like,
): void {
  const u = unitToward(earth, moon);
  // Sit one unit Earthward of Moon; rays travel toward Moon center
  earthshine.position.set(moon.x - u.x, moon.y - u.y, moon.z - u.z);
  earthshine.target.position.set(moon.x, moon.y, moon.z);
  earthshine.target.updateMatrixWorld();
}

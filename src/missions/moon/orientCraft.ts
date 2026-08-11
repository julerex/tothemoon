/**
 * Lunar mission craft attitude: pad radial, surface-relative, deep-space inertial.
 * Scene unit = 1 km.
 */

import type * as THREE from "three";

/** Scratch vectors shared by one theater instance. */
export type MoonOrientScratch = {
  craftPos: THREE.Vector3;
  craft: THREE.Object3D;
  craftTan: THREE.Vector3;
  localUp: THREE.Vector3;
  omega: THREE.Vector3;
  spinVel: THREE.Vector3;
  airVel: THREE.Vector3;
  lookTarget: THREE.Vector3;
  rollUp: THREE.Vector3;
  look: THREE.Matrix4;
  quat: THREE.Quaternion;
  airVelAttitudeMin: number;
};

/** Point craft local +Z (nose) along `heading`, engines (−Z) aft. */
export function applyCraftHeading(
  s: MoonOrientScratch,
  heading: THREE.Vector3,
): void {
  if (heading.lengthSq() < 1e-16) return;
  s.craftTan.copy(heading).normalize();
  s.lookTarget.copy(s.craftPos).add(s.craftTan);
  s.rollUp.set(0, 1, 0);
  if (Math.abs(s.craftTan.dot(s.rollUp)) > 0.95) s.rollUp.set(1, 0, 0);
  s.look.lookAt(s.lookTarget, s.craftPos, s.rollUp);
  s.quat.setFromRotationMatrix(s.look);
  s.craft.quaternion.copy(s.quat);
}

function computeLocalUp(s: MoonOrientScratch, earthPos: THREE.Vector3): number {
  s.localUp.set(
    s.craftPos.x - earthPos.x,
    s.craftPos.y - earthPos.y,
    s.craftPos.z - earthPos.z,
  );
  const r = s.localUp.length();
  if (r > 1e-6) s.localUp.multiplyScalar(1 / r);
  else s.localUp.set(0, 1, 0);
  return r;
}

function orientNearEarth(
  s: MoonOrientScratch,
  vel: THREE.Vector3,
  earthVel: THREE.Vector3,
  r: number,
): void {
  s.spinVel.crossVectors(s.omega, s.localUp).multiplyScalar(r);
  s.airVel.copy(vel).sub(earthVel).sub(s.spinVel);
  if (s.airVel.lengthSq() < s.airVelAttitudeMin * s.airVelAttitudeMin) {
    applyCraftHeading(s, s.localUp);
    return;
  }
  applyCraftHeading(s, s.airVel);
}

/**
 * Attitude for the stack:
 * - Pad / tower: local radial up
 * - Near-Earth flight: surface-relative velocity
 * - Deep space: inertial velocity
 */
export function orientCraft(
  s: MoonOrientScratch,
  vel: THREE.Vector3,
  earthPos: THREE.Vector3,
  earthVel: THREE.Vector3,
  nearEarth: boolean,
): void {
  const r = computeLocalUp(s, earthPos);
  if (nearEarth) {
    orientNearEarth(s, vel, earthVel, r);
    return;
  }
  if (vel.lengthSq() < 1e-12) return;
  applyCraftHeading(s, vel);
}

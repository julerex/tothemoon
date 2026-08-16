/**
 * Flight 13 craft attitude: pad radial, prograde, belly-flop, engines-first.
 * Scene unit = 1 km.
 */

import type * as THREE from "three";
import {
  landingFlipBlend,
  shipAttitudeMode,
  splashFloatBob,
} from "../../physics/flight13Attitude";
import type { PhaseId } from "../../physics/missionTypes";

/** Scratch vectors shared by one theater instance. */
export type OrientScratch = {
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
  nose: THREE.Vector3;
  belly: THREE.Vector3;
  side: THREE.Vector3;
  airVelAttitudeMin: number;
};

/** Point craft local +Z (nose) along `heading`, engines (−Z) aft. */
export function applyCraftHeading(
  s: OrientScratch,
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

function commitCraftBasis(s: OrientScratch): void {
  s.side.normalize();
  s.belly.crossVectors(s.nose, s.side).normalize();
  s.look.makeBasis(s.side, s.belly, s.nose);
  s.quat.setFromRotationMatrix(s.look);
  s.craft.quaternion.copy(s.quat);
}

/** Set craft basis from nose (+Z) and belly (+Y) world directions. */
export function applyCraftBasis(
  s: OrientScratch,
  nose: THREE.Vector3,
  belly: THREE.Vector3,
): void {
  s.nose.copy(nose).normalize();
  s.belly.copy(belly).normalize();
  s.side.crossVectors(s.belly, s.nose);
  if (s.side.lengthSq() < 1e-12) {
    applyCraftHeading(s, s.nose);
    return;
  }
  commitCraftBasis(s);
}

function computeLocalUp(s: OrientScratch, earthPos: THREE.Vector3): number {
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

function computeAirVel(
  s: OrientScratch,
  vel: THREE.Vector3,
  earthVel: THREE.Vector3,
  r: number,
): void {
  s.spinVel.crossVectors(s.omega, s.localUp).multiplyScalar(r);
  s.airVel.copy(vel).sub(earthVel).sub(s.spinVel);
}

function bellyFromAir(s: OrientScratch, speed: number): void {
  s.belly.copy(s.airVel).multiplyScalar(1 / speed);
  s.nose.crossVectors(s.localUp, s.belly);
  if (s.nose.lengthSq() < 1e-10) s.nose.set(0, 1, 0).cross(s.belly);
  s.nose.normalize().addScaledVector(s.localUp, 0.15).normalize();
}

function orientBellyOrEngines(
  s: OrientScratch,
  mode: "belly" | "engines_first",
  missionT: number,
): void {
  const speed = s.airVel.length();
  if (speed < 1e-6) {
    applyCraftHeading(s, s.localUp);
    return;
  }
  bellyFromAir(s, speed);
  blendEnginesFirst(s, mode, landingFlipBlend(missionT), speed);
  applyCraftBasis(s, s.nose, s.belly);
}

function blendEnginesFirst(
  s: OrientScratch,
  mode: "belly" | "engines_first",
  flip: number,
  speed: number,
): void {
  if (mode !== "engines_first" && flip <= 0.01) return;
  s.side.copy(s.airVel).multiplyScalar(-1 / speed);
  const u = mode === "engines_first" ? Math.max(flip, 0.01) : flip;
  s.nose.lerp(s.side, u).normalize();
  s.belly.lerp(s.localUp, u).normalize();
}

function airTooSlow(s: OrientScratch): boolean {
  return s.airVel.lengthSq() < s.airVelAttitudeMin * s.airVelAttitudeMin;
}

function orientPrograde(
  s: OrientScratch,
  vel: THREE.Vector3,
  nearEarth: boolean,
): void {
  if (nearEarth) {
    applyCraftHeading(s, airTooSlow(s) ? s.localUp : s.airVel);
    return;
  }
  if (vel.lengthSq() < 1e-12) return;
  applyCraftHeading(s, vel);
}

function applySplashBob(s: OrientScratch, missionT: number): void {
  const bob = splashFloatBob(missionT);
  s.side.set(0, 0, 1).cross(s.localUp);
  if (s.side.lengthSq() < 1e-12) s.side.set(1, 0, 0).cross(s.localUp);
  s.side.normalize();
  s.craftTan.copy(s.localUp).cross(s.side).normalize();
  s.localUp.addScaledVector(s.craftTan, bob.pitchRad);
  s.localUp.addScaledVector(s.side, bob.rollRad);
  s.localUp.normalize();
}

function applyAttitudeMode(
  s: OrientScratch,
  mode: ReturnType<typeof shipAttitudeMode>,
  vel: THREE.Vector3,
  nearEarth: boolean,
  missionT: number,
  phase: PhaseId,
): void {
  if (mode === "radial_up" || (airTooSlow(s) && mode === "prograde")) {
    if (phase === "splashdown") applySplashBob(s, missionT);
    applyCraftHeading(s, s.localUp);
    return;
  }
  if (mode === "belly" || mode === "engines_first") {
    orientBellyOrEngines(s, mode, missionT);
    return;
  }
  orientPrograde(s, vel, nearEarth);
}

/**
 * Attitude for the stack across pad → entry → landing burn.
 */
export function orientCraft(
  s: OrientScratch,
  vel: THREE.Vector3,
  earthPos: THREE.Vector3,
  earthVel: THREE.Vector3,
  nearEarth: boolean,
  missionT: number,
  phase: PhaseId,
  burning: boolean,
  altEarth: number,
): void {
  const r = computeLocalUp(s, earthPos);
  computeAirVel(s, vel, earthVel, r);
  const mode = shipAttitudeMode(missionT, phase, altEarth, burning);
  applyAttitudeMode(s, mode, vel, nearEarth, missionT, phase);
}

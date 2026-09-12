/**
 * Shared Mechazilla work-light bulbs (emissive only — pad floods light the scene).
 */
import * as THREE from "three";
import type { TowerMats } from "./mechazillaMats";

const bulbGeo = new THREE.SphereGeometry(0.0004, 6, 4);

/** @returns Named group `pad-tower-worklights`. */
export function makeWorklightGroup(): THREE.Group {
  const g = new THREE.Group();
  g.name = "pad-tower-worklights";
  return g;
}

export function addWorklight(
  parent: THREE.Object3D, mats: TowerMats, x: number, y: number, z: number,
): void {
  const lamp = new THREE.Mesh(bulbGeo, mats.lamp);
  lamp.position.set(x, y, z);
  parent.add(lamp);
}

/** Shared Mechazilla steel palette (weathered pad steel, not bright mill). */
import * as THREE from "three";

export type TowerMats = {
  steel: THREE.MeshStandardMaterial;
  steelDark: THREE.MeshStandardMaterial;
  steelBright: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
};

export function makeTowerMats(): TowerMats {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.68, roughness: 0.5 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.6, roughness: 0.58 }),
    steelBright: new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.72, roughness: 0.44 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x1e2228, metalness: 0.48, roughness: 0.62 }),
  };
}

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
    steel: new THREE.MeshStandardMaterial({ color: 0x6e747c, metalness: 0.7, roughness: 0.46 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x3e444c, metalness: 0.62, roughness: 0.55 }),
    steelBright: new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.74, roughness: 0.4 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.5, roughness: 0.58 }),
  };
}

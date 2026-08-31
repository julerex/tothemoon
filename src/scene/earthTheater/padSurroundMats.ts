/** Shared materials and ground helpers for pad surroundings. */
import * as THREE from "three";

export const GROUND_OFFSET = {
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
} as const;

export type PadSurroundMats = {
  concrete: THREE.MeshStandardMaterial;
  concreteLight: THREE.MeshStandardMaterial;
  concreteDark: THREE.MeshStandardMaterial;
  dirt: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  steelDark: THREE.MeshStandardMaterial;
  tankWhite: THREE.MeshStandardMaterial;
  warehouseRoof: THREE.MeshStandardMaterial;
  warehouseWall: THREE.MeshStandardMaterial;
  carPaint: THREE.MeshStandardMaterial;
};

export function groundStd(
  color: number,
  metalness: number,
  roughness: number,
  ground = true,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    ...(ground ? GROUND_OFFSET : {}),
  });
}

export function makePadGroundMats(): Pick<
  PadSurroundMats,
  "concrete" | "concreteLight" | "concreteDark" | "dirt" | "asphalt" | "water"
> {
  return {
    concrete: groundStd(0x9a9ea4, 0.18, 0.9),
    concreteLight: groundStd(0xb0b4b8, 0.15, 0.88),
    concreteDark: groundStd(0x6a6e74, 0.22, 0.86),
    dirt: groundStd(0xb0a080, 0.05, 0.96),
    asphalt: groundStd(0x4a4c50, 0.12, 0.92),
    water: groundStd(0x4a6a62, 0.4, 0.4),
  };
}

export function makePadStructureMats(): Pick<PadSurroundMats, "steel" | "steelDark" | "tankWhite" | "warehouseRoof" | "warehouseWall" | "carPaint"> {
  return {
    steel: groundStd(0x8a9098, 0.72, 0.42, false), steelDark: groundStd(0x4a5058, 0.65, 0.5, false),
    // Matte insulated cryo white (V23.1) — not shiny mill grey.
    tankWhite: groundStd(0xf2f4f6, 0.12, 0.82, false), warehouseRoof: groundStd(0xc4b8a0, 0.25, 0.75, false),
    warehouseWall: groundStd(0xb8b0a0, 0.2, 0.8, false), carPaint: groundStd(0x3a3e48, 0.4, 0.55, false),
  };
}

export function makePadSurroundMats(): PadSurroundMats {
  return { ...makePadGroundMats(), ...makePadStructureMats() };
}

export function addGroundRing(
  g: THREE.Group,
  innerR: number,
  outerR: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  segs = 24,
  name?: string,
): void {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(innerR, outerR, segs, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  if (name) mesh.name = name;
  g.add(mesh);
}

/**
 * Mechazilla west elevator / catch-rail — open cage on the vehicle face,
 * not a solid box wall (T−5 / T−2 stills).
 */
import * as THREE from "three";
import { TOWER_COL, TOWER_FACE, TOWER_H, TOWER_OX, TOWER_OY0 } from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";

const RAIL_N = 16;
const CAGE_D = TOWER_COL * 1.15;
const CAGE_W = TOWER_COL * 2.55;

function addRailBeams(g: THREE.Group, mats: TowerMats, x: number): void {
  const beamGeo = new THREE.BoxGeometry(CAGE_D * 0.45, TOWER_H * 0.96, 0.00045);
  for (const z of [-CAGE_W * 0.42, CAGE_W * 0.42]) {
    const beam = new THREE.Mesh(beamGeo, mats.steelBright);
    beam.position.set(x, TOWER_OY0 + TOWER_H * 0.48, z);
    g.add(beam);
  }
}

function addCageRungs(g: THREE.Group, mats: TowerMats, x: number): void {
  const rungGeo = new THREE.BoxGeometry(CAGE_D * 0.9, 0.00035, CAGE_W * 0.9);
  for (let i = 1; i <= RAIL_N; i++) {
    const y = TOWER_OY0 + (i / (RAIL_N + 1)) * TOWER_H * 0.94;
    const rung = new THREE.Mesh(rungGeo, i % 3 === 0 ? mats.steel : mats.accent);
    rung.position.set(x, y, 0);
    g.add(rung);
  }
}

function addCageStiles(g: THREE.Group, mats: TowerMats, x: number): void {
  const stileGeo = new THREE.CylinderGeometry(0.00028, 0.00028, TOWER_H * 0.94, 6);
  for (const z of [-CAGE_W * 0.42, CAGE_W * 0.42]) {
    for (const dx of [-CAGE_D * 0.35, CAGE_D * 0.35]) {
      const stile = new THREE.Mesh(stileGeo, mats.steelDark);
      stile.position.set(x + dx, TOWER_OY0 + TOWER_H * 0.48, z);
      g.add(stile);
    }
  }
}

/** Open elevator cage on the vehicle-facing (−X) tower face. */
export function addMechazillaRail(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const x = TOWER_OX - half - CAGE_D * 0.55;
  const cage = new THREE.Group();
  cage.name = "pad-tower-rail";
  addRailBeams(cage, mats, x);
  addCageRungs(cage, mats, x);
  addCageStiles(cage, mats, x);
  g.add(cage);
}

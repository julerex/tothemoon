/**
 * Mechazilla tower base / GSE house (NSF Pad 2 vs Pad 1 notes).
 * Pad 2: stainless-framed concrete fill, larger rear housing, ~10 m plinth.
 * Scene unit = 1 km.
 */
import * as THREE from "three";
import { TOWER_COL, TOWER_FACE, TOWER_OX, TOWER_OY0 } from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";

const BASE_H = 0.01;
const HOUSE_H = 0.007;

function addPlinth(g: THREE.Group, mats: TowerMats): void {
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 1.55, BASE_H, TOWER_FACE * 1.55),
    mats.steelDark,
  );
  plinth.name = "pad-tower-base";
  plinth.position.set(TOWER_OX, TOWER_OY0 + BASE_H * 0.5, 0);
  g.add(plinth);
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 1.7, 0.0012, TOWER_FACE * 1.7),
    mats.steel,
  );
  lip.position.set(TOWER_OX, TOWER_OY0 + BASE_H + 0.0004, 0);
  g.add(lip);
}

function addRearHouse(g: THREE.Group, mats: TowerMats, half: number): void {
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_COL * 6.5, HOUSE_H, TOWER_FACE * 1.15),
    mats.steel,
  );
  house.name = "pad-gse-house";
  house.position.set(
    TOWER_OX + half + TOWER_COL * 3.2,
    TOWER_OY0 + BASE_H + HOUSE_H * 0.45,
    0,
  );
  g.add(house);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_COL * 1.6, HOUSE_H * 0.55, 0.0008),
    mats.accent,
  );
  door.position.set(
    TOWER_OX + half + TOWER_COL * 6.4,
    TOWER_OY0 + BASE_H + HOUSE_H * 0.35,
    0,
  );
  g.add(door);
}

/** Concrete-fill plinth + inland GSE house at the tower foot. */
export function addMechazillaBase(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  addPlinth(g, mats);
  addRearHouse(g, mats, half);
}

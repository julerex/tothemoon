/**
 * Mechazilla peak platform — boxy crown + railings + sheave + lightning rod.
 * T−5 aerial still: a small lattice house sits above the chopsticks T.
 */
import * as THREE from "three";
import { TOWER_BEACON_Y, TOWER_FACE, TOWER_H, TOWER_OX, TOWER_OY0 } from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";

const PEAK_H = 0.011;
const HOUSE_H = 0.007;

function addPeakDeck(g: THREE.Group, mats: TowerMats): void {
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 1.28, PEAK_H * 0.28, TOWER_FACE * 1.28),
    mats.steelDark,
  );
  deck.name = "pad-tower-peak";
  deck.position.set(TOWER_OX, TOWER_OY0 + TOWER_H + PEAK_H * 0.14, 0);
  g.add(deck);
}

function addPeakHouse(g: THREE.Group, mats: TowerMats): void {
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 0.72, HOUSE_H, TOWER_FACE * 0.55),
    mats.steel,
  );
  house.position.set(
    TOWER_OX + TOWER_FACE * 0.08,
    TOWER_OY0 + TOWER_H + PEAK_H * 0.28 + HOUSE_H * 0.5,
    0,
  );
  g.add(house);
}

function addPeakRailPosts(g: THREE.Group, mats: TowerMats): void {
  const y = TOWER_OY0 + TOWER_H + PEAK_H * 0.28 + 0.0024;
  const span = TOWER_FACE * 0.58;
  const postGeo = new THREE.CylinderGeometry(0.00022, 0.00022, 0.0046, 6);
  const railGeo = new THREE.BoxGeometry(span * 2, 0.00018, 0.00018);
  for (const [dx, dz] of [
    [-span, -span], [span, -span], [-span, span], [span, span],
  ] as const) {
    const post = new THREE.Mesh(postGeo, mats.accent);
    post.position.set(TOWER_OX + dx, y, dz);
    g.add(post);
  }
  for (const rotY of [0, Math.PI / 2]) {
    for (const side of [-1, 1] as const) {
      const rail = new THREE.Mesh(railGeo, mats.steelBright);
      rail.position.set(
        TOWER_OX + (rotY === 0 ? 0 : side * span),
        y + 0.0018,
        rotY === 0 ? side * span : 0,
      );
      rail.rotation.y = rotY;
      g.add(rail);
    }
  }
}

function addPeakSheave(g: THREE.Group, mats: TowerMats, half: number): void {
  const sheave = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0032, 0.0032, TOWER_FACE * 0.62, 12),
    mats.steelDark,
  );
  sheave.rotation.z = Math.PI / 2;
  sheave.position.set(
    TOWER_OX - half * 0.22,
    TOWER_OY0 + TOWER_H + PEAK_H + HOUSE_H * 0.35,
    0,
  );
  g.add(sheave);
}

function addLightningRod(g: THREE.Group, mats: TowerMats): void {
  const rodH = TOWER_BEACON_Y - TOWER_H - PEAK_H;
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.00032, 0.00022, rodH, 6),
    mats.steelDark,
  );
  rod.position.set(TOWER_OX, TOWER_OY0 + TOWER_H + PEAK_H + rodH * 0.5, 0);
  g.add(rod);
}

/** Peak deck, winch house, railing, sheave, lightning rod. */
export function addMechazillaPeak(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  addPeakDeck(g, mats);
  addPeakHouse(g, mats);
  addPeakRailPosts(g, mats);
  addPeakSheave(g, mats, half);
  addLightningRod(g, mats);
}

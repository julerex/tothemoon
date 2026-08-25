/**
 * Mechazilla open tubular truss (V23.2) — see-through lattice at aerial T−5,
 * not stacked box walls. Shared cylinder geos keep draw calls modest.
 */
import * as THREE from "three";
import {
  BOOST_QD_Y, SHIP_QD_Y, TOWER_COL, TOWER_FACE, TOWER_H,
  TOWER_OX, TOWER_OY0,
} from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";
import { addMechazillaPeak } from "./mechazillaPeak";
import { addMechazillaRail } from "./mechazillaRail";

const N_RINGS = 22;
/** Column / ring tube radius (km) — thinner than old box TOWER_COL for open look. */
const TUBE_R = TOWER_COL * 0.28;
const BRACE_R = TUBE_R * 0.72;

const colGeo = new THREE.CylinderGeometry(TUBE_R, TUBE_R, TOWER_H, 8);
const ringGeoZ = new THREE.CylinderGeometry(TUBE_R * 0.85, TUBE_R * 0.85, TOWER_FACE, 8);
const ringGeoX = new THREE.CylinderGeometry(TUBE_R * 0.85, TUBE_R * 0.85, TOWER_FACE, 8);
const braceUnitGeo = new THREE.CylinderGeometry(BRACE_R, BRACE_R, 1, 6);

function addTowerColumns(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const corners: [number, number][] = [[-half, -half], [half, -half], [-half, half], [half, half]];
  for (const [cx, cz] of corners) {
    const col = new THREE.Mesh(colGeo, mats.steel);
    col.name = "pad-tower-column";
    col.position.set(TOWER_OX + cx, TOWER_OY0 + TOWER_H * 0.5, cz);
    g.add(col);
  }
  // Mid-face uprights so each side reads as a 2-bay lattice, not 4 sticks.
  const mids: [number, number][] = [[0, -half], [0, half], [-half, 0], [half, 0]];
  for (const [cx, cz] of mids) {
    const col = new THREE.Mesh(colGeo, mats.steelDark);
    col.position.set(TOWER_OX + cx, TOWER_OY0 + TOWER_H * 0.5, cz);
    g.add(col);
  }
}

function addTowerRingBeamsZ(g: THREE.Group, mats: TowerMats, y: number, half: number): void {
  for (const z of [-half, half]) {
    const beam = new THREE.Mesh(ringGeoZ, mats.steelDark);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(TOWER_OX, y, z);
    g.add(beam);
  }
}

function addTowerRingBeamsX(g: THREE.Group, mats: TowerMats, y: number, half: number): void {
  for (const x of [-half, half]) {
    const beam = new THREE.Mesh(ringGeoX, mats.steelDark);
    beam.rotation.x = Math.PI / 2;
    beam.position.set(TOWER_OX + x, y, 0);
    g.add(beam);
  }
}

function addTowerRings(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  for (let i = 1; i <= N_RINGS; i++) {
    const y = TOWER_OY0 + (i / N_RINGS) * TOWER_H * 0.96;
    addTowerRingBeamsZ(g, mats, y, half);
    addTowerRingBeamsX(g, mats, y, half);
  }
}

function placeBrace(
  g: THREE.Group,
  mat: THREE.Material,
  len: number,
  pos: THREE.Vector3,
  rot: THREE.Euler,
): void {
  const b = new THREE.Mesh(braceUnitGeo, mat);
  b.scale.set(1, len, 1);
  b.position.copy(pos);
  b.rotation.copy(rot);
  g.add(b);
}

function addBracePairX(
  g: THREE.Group, ox: number, half: number, midY: number, len: number, tilt: number, mat: THREE.Material,
): void {
  for (const x of [ox - half, ox + half]) {
    for (const flip of [-1, 1] as const) {
      placeBrace(
        g, mat, len,
        new THREE.Vector3(x, midY, 0),
        new THREE.Euler(flip * tilt, 0, 0),
      );
    }
  }
}

function addBracePairZ(
  g: THREE.Group, ox: number, half: number, midY: number, len: number, tilt: number, mat: THREE.Material,
): void {
  for (const z of [-half, half]) {
    for (const flip of [-1, 1] as const) {
      placeBrace(
        g, mat, len,
        new THREE.Vector3(ox, midY, z),
        new THREE.Euler(0, 0, flip * tilt),
      );
    }
  }
}

function addBraceBay(
  g: THREE.Group, ox: number, half: number, y0: number, h: number, face: number,
  nRings: number, i: number, mat: THREE.Material,
): void {
  const ya = y0 + ((i + 0.12) / nRings) * h * 0.96;
  const yb = y0 + ((i + 0.88) / nRings) * h * 0.96;
  const midY = (ya + yb) * 0.5;
  const len = Math.hypot(face, yb - ya);
  const tilt = Math.atan2(face, yb - ya);
  addBracePairX(g, ox, half, midY, len, tilt, mat);
  addBracePairZ(g, ox, half, midY, len, tilt, mat);
}

function addTowerBracing(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  for (let i = 0; i < N_RINGS - 1; i += 1) {
    addBraceBay(g, TOWER_OX, half, TOWER_OY0, TOWER_H, TOWER_FACE, N_RINGS, i, mats.accent);
  }
}

/** Work decks at QD heights plus evenly spaced floors so the cage reads dense. */
function addTowerDecks(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const ys = [
    BOOST_QD_Y,
    SHIP_QD_Y,
    TOWER_H * 0.18,
    TOWER_H * 0.36,
    TOWER_H * 0.55,
    TOWER_H * 0.78,
  ];
  for (const y of ys) {
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_FACE * 0.92, 0.0007, TOWER_FACE * 0.92),
      mats.steelDark,
    );
    deck.position.set(TOWER_OX, TOWER_OY0 + y, 0);
    g.add(deck);
    const outrigger = new THREE.Mesh(
      new THREE.BoxGeometry(half * 0.62, 0.00055, TOWER_FACE * 0.38),
      mats.accent,
    );
    outrigger.position.set(TOWER_OX - half * 0.72, TOWER_OY0 + y, 0);
    g.add(outrigger);
  }
}

/** Columns, rings, X-braces, west rail, peak, work decks. */
export function addMechazillaTruss(g: THREE.Group, mats: TowerMats): void {
  addTowerColumns(g, mats);
  addTowerRings(g, mats);
  addTowerBracing(g, mats);
  addMechazillaRail(g, mats);
  addMechazillaPeak(g, mats);
  addTowerDecks(g, mats);
}

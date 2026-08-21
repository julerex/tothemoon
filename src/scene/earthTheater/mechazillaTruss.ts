/**
 * Mechazilla open tubular truss (V23.2) — see-through lattice at aerial T−5,
 * not stacked box walls. Shared cylinder geos keep draw calls modest.
 */
import * as THREE from "three";
import {
  BOOST_QD_Y, SHIP_QD_Y, TOWER_BEACON_Y, TOWER_COL, TOWER_FACE, TOWER_H,
  TOWER_OX, TOWER_OY0,
} from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";

const N_RINGS = 14;
/** Column / ring tube radius (km) — thinner than old box TOWER_COL for open look. */
const TUBE_R = TOWER_COL * 0.38;
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
  for (const flip of [-1, 1] as const) {
    placeBrace(
      g, mat, len,
      new THREE.Vector3(ox - half, midY, 0),
      new THREE.Euler(flip * tilt, 0, 0),
    );
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
    if (i % 2 === 0) {
      addBraceBay(g, TOWER_OX, half, TOWER_OY0, TOWER_H, TOWER_FACE, N_RINGS, i, mats.accent);
    }
  }
}

/** West elevator / rail — thicker solid volume (real Mechazilla silhouette). */
function addTowerRail(g: THREE.Group, mats: TowerMats, half: number): void {
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_COL * 1.35, TOWER_H * 0.94, TOWER_COL * 2.4),
    mats.steelBright,
  );
  rail.position.set(TOWER_OX - half - TOWER_COL * 0.45, TOWER_OY0 + TOWER_H * 0.48, 0);
  g.add(rail);
}

function addTowerPeakAndSheave(g: THREE.Group, mats: TowerMats, half: number): void {
  const peakH = 0.008;
  const peak = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 1.15, peakH, TOWER_FACE * 1.15),
    mats.steelBright,
  );
  peak.position.set(TOWER_OX, TOWER_OY0 + TOWER_H + peakH * 0.5, 0);
  g.add(peak);
  const sheave = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, TOWER_FACE * 0.7, 10),
    mats.steelDark,
  );
  sheave.rotation.z = Math.PI / 2;
  sheave.position.set(TOWER_OX - half * 0.3, TOWER_OY0 + TOWER_H + peakH + 0.002, 0);
  g.add(sheave);
  const rodH = TOWER_BEACON_Y - TOWER_H - peakH;
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.00035, 0.00025, rodH, 6),
    mats.steelDark,
  );
  rod.position.set(TOWER_OX, TOWER_OY0 + TOWER_H + peakH + rodH * 0.5, 0);
  g.add(rod);
}

/** Thin work decks at ship / booster QD heights so the cage is not empty. */
function addTowerDecks(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  for (const y of [SHIP_QD_Y, BOOST_QD_Y]) {
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_FACE * 0.92, 0.0008, TOWER_FACE * 0.92),
      mats.steelDark,
    );
    deck.position.set(TOWER_OX, TOWER_OY0 + y, 0);
    g.add(deck);
    // Short outriggers toward the vehicle (+west / −X from tower center).
    const outrigger = new THREE.Mesh(
      new THREE.BoxGeometry(half * 0.55, 0.0006, TOWER_FACE * 0.35),
      mats.accent,
    );
    outrigger.position.set(TOWER_OX - half * 0.7, TOWER_OY0 + y, 0);
    g.add(outrigger);
  }
}

/** Columns, rings, X-braces, west rail, peak, QD decks. */
export function addMechazillaTruss(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  addTowerColumns(g, mats);
  addTowerRings(g, mats);
  addTowerBracing(g, mats);
  addTowerRail(g, mats, half);
  addTowerPeakAndSheave(g, mats, half);
  addTowerDecks(g, mats);
}

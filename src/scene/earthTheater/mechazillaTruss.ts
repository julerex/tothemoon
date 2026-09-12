/**
 * Mechazilla open lattice truss — 2-bay box-section cage (V27).
 * Shared geos + one InstancedMesh for X-braces keep draw calls modest.
 */
import * as THREE from "three";
import {
  BOOST_QD_Y, SHIP_QD_Y, TOWER_COL, TOWER_FACE, TOWER_H,
  TOWER_OX, TOWER_OY0,
} from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";
import { addMechazillaPeak } from "./mechazillaPeak";
import { addMechazillaRail } from "./mechazillaRail";
import { addWorklight, makeWorklightGroup } from "./mechazillaWorklights";

const N_RINGS = 24;
/** Square leg (km) — OLIT box columns, not round tubes. */
const COL_W = TOWER_COL;
const MID_W = TOWER_COL * 0.65;
const GIRDER_T = TOWER_COL * 0.32;
const BRACE_R = TOWER_COL * 0.18;

const colGeo = new THREE.BoxGeometry(COL_W, TOWER_H, COL_W);
const midGeo = new THREE.BoxGeometry(MID_W, TOWER_H, MID_W);
const ringGeoX = new THREE.BoxGeometry(TOWER_FACE, GIRDER_T, GIRDER_T);
const ringGeoZ = new THREE.BoxGeometry(GIRDER_T, GIRDER_T, TOWER_FACE);
const braceUnitGeo = new THREE.CylinderGeometry(BRACE_R, BRACE_R, 1, 5);
const deckSpanGeo = new THREE.BoxGeometry(TOWER_FACE * 0.92, 0.00045, 0.00045);
const deckDepthGeo = new THREE.BoxGeometry(0.00045, 0.00045, TOWER_FACE * 0.92);

function addTowerColumns(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const corners: [number, number][] = [[-half, -half], [half, -half], [-half, half], [half, half]];
  for (const [cx, cz] of corners) {
    const col = new THREE.Mesh(colGeo, mats.steel);
    col.name = "pad-tower-column";
    col.position.set(TOWER_OX + cx, TOWER_OY0 + TOWER_H * 0.5, cz);
    g.add(col);
  }
  const mids: [number, number][] = [[0, -half], [0, half], [-half, 0], [half, 0]];
  for (const [cx, cz] of mids) {
    const col = new THREE.Mesh(midGeo, mats.steelDark);
    col.position.set(TOWER_OX + cx, TOWER_OY0 + TOWER_H * 0.5, cz);
    g.add(col);
  }
}

function addTowerRings(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  for (let i = 1; i <= N_RINGS; i++) {
    const y = TOWER_OY0 + (i / N_RINGS) * TOWER_H * 0.96;
    for (const z of [-half, half]) {
      const beam = new THREE.Mesh(ringGeoX, mats.steelDark);
      beam.position.set(TOWER_OX, y, z);
      g.add(beam);
    }
    for (const x of [-half, half]) {
      const beam = new THREE.Mesh(ringGeoZ, mats.steelDark);
      beam.position.set(TOWER_OX + x, y, 0);
      g.add(beam);
    }
  }
}

function addTowerBracing(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const bay = half;
  const dummy = new THREE.Object3D();
  const count = (N_RINGS - 1) * 16;
  const mesh = new THREE.InstancedMesh(braceUnitGeo, mats.accent, count);
  mesh.name = "pad-tower-braces";
  mesh.frustumCulled = false;
  let i = 0;
  const setBrace = (x: number, y: number, z: number, rx: number, rz: number, len: number): void => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, 0, rz);
    dummy.scale.set(1, len, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    i += 1;
  };
  for (let n = 0; n < N_RINGS - 1; n++) {
    const ya = TOWER_OY0 + ((n + 0.12) / N_RINGS) * TOWER_H * 0.96;
    const yb = TOWER_OY0 + ((n + 0.88) / N_RINGS) * TOWER_H * 0.96;
    const midY = (ya + yb) * 0.5;
    const len = Math.hypot(bay, yb - ya);
    const tilt = Math.atan2(bay, yb - ya);
    for (const x of [TOWER_OX - half, TOWER_OX + half]) {
      for (const zc of [-bay * 0.5, bay * 0.5]) {
        setBrace(x, midY, zc, tilt, 0, len);
        setBrace(x, midY, zc, -tilt, 0, len);
      }
    }
    for (const z of [-half, half]) {
      for (const xc of [TOWER_OX - bay * 0.5, TOWER_OX + bay * 0.5]) {
        setBrace(xc, midY, z, 0, tilt, len);
        setBrace(xc, midY, z, 0, -tilt, len);
      }
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  g.add(mesh);
}

function addDeckFrame(g: THREE.Group, mats: TowerMats, y: number): void {
  const half = TOWER_FACE * 0.5;
  for (const z of [-half * 0.92, half * 0.92]) {
    const beam = new THREE.Mesh(deckSpanGeo, mats.steelDark);
    beam.position.set(TOWER_OX, TOWER_OY0 + y, z);
    g.add(beam);
  }
  for (const x of [-half * 0.92, half * 0.92]) {
    const beam = new THREE.Mesh(deckDepthGeo, mats.steelDark);
    beam.position.set(TOWER_OX + x, TOWER_OY0 + y, 0);
    g.add(beam);
  }
  const out = new THREE.Mesh(
    new THREE.BoxGeometry(half * 0.62, 0.0005, TOWER_FACE * 0.4),
    mats.accent,
  );
  out.position.set(TOWER_OX - half * 0.78, TOWER_OY0 + y, 0);
  g.add(out);
}

function addTowerDecks(g: THREE.Group, mats: TowerMats): void {
  const ys = [
    BOOST_QD_Y, SHIP_QD_Y,
    TOWER_H * 0.12, TOWER_H * 0.28, TOWER_H * 0.44,
    TOWER_H * 0.62, TOWER_H * 0.78, TOWER_H * 0.9,
  ];
  for (const y of ys) addDeckFrame(g, mats, y);
}

function addTowerWorklights(g: THREE.Group, mats: TowerMats): void {
  const lights = makeWorklightGroup();
  const half = TOWER_FACE * 0.5;
  const n = 10;
  for (let i = 1; i <= n; i++) {
    const y = TOWER_OY0 + (i / (n + 1)) * TOWER_H;
    addWorklight(lights, mats, TOWER_OX - half - 0.0005, y, -half * 0.42);
    addWorklight(lights, mats, TOWER_OX - half - 0.0005, y, half * 0.42);
    if (i % 2 === 0) addWorklight(lights, mats, TOWER_OX - half - 0.0005, y, 0);
  }
  g.add(lights);
}

/** Columns, rings, 2-bay X-braces, west rail, peak, open decks, work lights. */
export function addMechazillaTruss(g: THREE.Group, mats: TowerMats): void {
  addTowerColumns(g, mats);
  addTowerRings(g, mats);
  addTowerBracing(g, mats);
  addMechazillaRail(g, mats);
  addMechazillaPeak(g, mats);
  addTowerDecks(g, mats);
  addTowerWorklights(g, mats);
}

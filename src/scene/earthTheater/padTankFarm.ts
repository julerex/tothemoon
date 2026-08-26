/**
 * OLP-2 tank farm — 12 m cryo shells in SH-4-parallel rows (NAIP / NSF).
 * Aerial: two rows of fat white verticals west of Mechazilla, N–S horizontals
 * further inland, pipe racks to the pad — not a 7.6 m keg grid.
 */
import * as THREE from "three";
import type { PadSurroundMats } from "./padSurroundMats";
import {
  BLAST_WALL_X_KM,
  CRYO_COL_X_KM,
  CRYO_ROW_Z_KM,
  CRYO_SHELL_D_KM,
  CRYO_VERTICAL_H_KM,
  HORIZ_LARGE_LEN_KM,
  HORIZ_LARGE_R_KM,
  HORIZ_LARGE_X_KM,
  HORIZ_LARGE_Z_KM,
  HORIZ_SMALL_LEN_KM,
  HORIZ_SMALL_R_KM,
  HORIZ_SMALL_X_KM,
  HORIZ_SMALL_Z_KM,
  LN2_H_KM,
  LN2_R_KM,
  LN2_XZ_KM,
  cryoVerticalCenters,
} from "./padFarmLayout";

const CRYO_R = CRYO_SHELL_D_KM * 0.5;
const cryoBodyGeo = new THREE.CylinderGeometry(CRYO_R, CRYO_R, CRYO_VERTICAL_H_KM, 16);
const cryoCapGeo = new THREE.SphereGeometry(CRYO_R * 1.02, 12, 8);
const cryoBandGeo = new THREE.CylinderGeometry(CRYO_R * 1.05, CRYO_R * 1.05, 0.00045, 14);
const largeBodyGeo = new THREE.CylinderGeometry(
  HORIZ_LARGE_R_KM, HORIZ_LARGE_R_KM, HORIZ_LARGE_LEN_KM, 14,
);
const largeCapGeo = new THREE.SphereGeometry(HORIZ_LARGE_R_KM * 1.02, 10, 8);
const smallBodyGeo = new THREE.CylinderGeometry(
  HORIZ_SMALL_R_KM, HORIZ_SMALL_R_KM, HORIZ_SMALL_LEN_KM, 12,
);
const smallCapGeo = new THREE.SphereGeometry(HORIZ_SMALL_R_KM * 1.02, 10, 8);
const ln2BodyGeo = new THREE.CylinderGeometry(LN2_R_KM, LN2_R_KM, LN2_H_KM, 12);
const pipeRunGeo = new THREE.CylinderGeometry(0.00055, 0.00055, 0.12, 6);
const pipeRiserGeo = new THREE.CylinderGeometry(0.0004, 0.0004, 0.012, 6);

function addVerticalTank(
  farm: THREE.Group,
  mats: PadSurroundMats,
  x: number,
  z: number,
  name?: string,
): void {
  const y = CRYO_VERTICAL_H_KM * 0.5;
  const tank = new THREE.Mesh(cryoBodyGeo, mats.tankWhite);
  tank.position.set(x, y, z);
  if (name) tank.name = name;
  farm.add(tank);
  const cap = new THREE.Mesh(cryoCapGeo, mats.tankWhite);
  cap.position.set(x, CRYO_VERTICAL_H_KM, z);
  farm.add(cap);
  for (const t of [0.28, 0.5, 0.72] as const) {
    const band = new THREE.Mesh(cryoBandGeo, mats.steelDark);
    band.position.set(x, CRYO_VERTICAL_H_KM * t, z);
    farm.add(band);
  }
}

function addNsHorizontal(
  farm: THREE.Group,
  mats: PadSurroundMats,
  body: THREE.BufferGeometry,
  cap: THREE.BufferGeometry,
  r: number,
  len: number,
  x: number,
  z: number,
): void {
  const y = r + 0.0012;
  const tank = new THREE.Mesh(body, mats.tankWhite);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(x, y, z);
  farm.add(tank);
  for (const end of [-1, 1] as const) {
    const lid = new THREE.Mesh(cap, mats.tankWhite);
    lid.position.set(x, y, z + end * (len * 0.5));
    farm.add(lid);
  }
}

function addCryoBank(farm: THREE.Group, mats: PadSurroundMats): void {
  cryoVerticalCenters().forEach(([x, z], i) => {
    addVerticalTank(farm, mats, x, z, i === 0 ? "pad-cryo-tank-0" : undefined);
  });
}

function addHorizontalBanks(farm: THREE.Group, mats: PadSurroundMats): void {
  for (const z of HORIZ_LARGE_Z_KM) {
    addNsHorizontal(
      farm, mats, largeBodyGeo, largeCapGeo,
      HORIZ_LARGE_R_KM, HORIZ_LARGE_LEN_KM, HORIZ_LARGE_X_KM, z,
    );
  }
  for (const z of HORIZ_SMALL_Z_KM) {
    addNsHorizontal(
      farm, mats, smallBodyGeo, smallCapGeo,
      HORIZ_SMALL_R_KM, HORIZ_SMALL_LEN_KM, HORIZ_SMALL_X_KM, z,
    );
  }
  for (const [x, z] of LN2_XZ_KM) {
    const tank = new THREE.Mesh(ln2BodyGeo, mats.steel);
    tank.position.set(x, LN2_H_KM * 0.5, z);
    farm.add(tank);
  }
}

function addPipeRacks(farm: THREE.Group, mats: PadSurroundMats): void {
  const racks = new THREE.Group();
  racks.name = "pad-pipe-rack";
  const midZ = (CRYO_ROW_Z_KM[0] + CRYO_ROW_Z_KM[1]) * 0.5;
  for (let tier = 0; tier < 3; tier++) {
    const run = new THREE.Mesh(pipeRunGeo, mats.steel);
    run.rotation.z = Math.PI / 2;
    run.position.set(0.112, 0.0038 + tier * 0.0024, midZ);
    racks.add(run);
  }
  for (const x of CRYO_COL_X_KM) {
    const header = new THREE.Mesh(
      new THREE.CylinderGeometry(0.00045, 0.00045, 0.028, 6),
      mats.steelDark,
    );
    header.rotation.x = Math.PI / 2;
    header.position.set(x, 0.0065, midZ);
    racks.add(header);
    const riser = new THREE.Mesh(pipeRiserGeo, mats.steel);
    riser.position.set(x, 0.008, CRYO_ROW_Z_KM[0]);
    racks.add(riser);
  }
  // Spur from the farm toward the live OLM / QD (east = −X).
  const spur = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0006, 0.0006, 0.048, 6),
    mats.steelDark,
  );
  spur.rotation.z = Math.PI / 2;
  spur.position.set(0.058, 0.0055, midZ);
  racks.add(spur);
  farm.add(racks);
}

function addBlastWall(farm: THREE.Group, mats: PadSurroundMats): void {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, 0.008, 0.072),
    mats.concreteDark,
  );
  wall.name = "pad-blast-wall";
  wall.position.set(BLAST_WALL_X_KM, 0.004, 0.022);
  farm.add(wall);
}

function addFarmBerm(farm: THREE.Group, mats: PadSurroundMats): void {
  const berm = new THREE.Group();
  berm.name = "pad-tank-farm-berm";
  const h = 0.0034;
  const t = 0.004;
  const x0 = CRYO_COL_X_KM[0] - 0.014;
  const x1 = CRYO_COL_X_KM[3] + 0.014;
  const z0 = CRYO_ROW_Z_KM[1] - 0.014;
  const z1 = CRYO_ROW_Z_KM[0] + 0.014;
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const walls: { size: [number, number, number]; pos: [number, number, number] }[] = [
    { size: [x1 - x0, h, t], pos: [cx, h * 0.5, z0] },
    { size: [x1 - x0, h, t], pos: [cx, h * 0.5, z1] },
    { size: [t, h, z1 - z0], pos: [x0, h * 0.5, cz] },
    { size: [t, h, z1 - z0], pos: [x1, h * 0.5, cz] },
  ];
  for (const w of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), mats.dirt);
    mesh.position.set(...w.pos);
    berm.add(mesh);
  }
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(x1 - x0 - 0.004, 0.0008, z1 - z0 - 0.004),
    mats.concrete,
  );
  slab.position.set(cx, 0.0003, cz);
  berm.add(slab);
  farm.add(berm);
}

function addFarmPumps(farm: THREE.Group, mats: PadSurroundMats): void {
  for (let i = 0; i < 4; i++) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0045, 0.005), mats.steelDark);
    pump.position.set(0.07 + i * 0.012, 0.0024, 0.002);
    farm.add(pump);
  }
}

/**
 * Pad-local tank farm west of Mechazilla (`pad-tank-farm` shadow cast root).
 * Group origin is the OLM so tank coordinates match {@link tankFarmVentAnchors}.
 */
export function buildTankFarm(mats: PadSurroundMats): THREE.Group {
  const farm = new THREE.Group();
  farm.name = "pad-tank-farm";
  addFarmBerm(farm, mats);
  addCryoBank(farm, mats);
  addHorizontalBanks(farm, mats);
  addPipeRacks(farm, mats);
  addBlastWall(farm, mats);
  addFarmPumps(farm, mats);
  return farm;
}

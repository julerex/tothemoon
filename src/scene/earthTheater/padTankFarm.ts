/**
 * Orbital tank farm — E–W horizontal cryo rows between OLP-2 and OLP-1.
 *
 * Look target: Google Maps orbital-tank-farm pin (white cylinders north of
 * the pad line, south of SH 4). Live Mechazilla stays west of the OLM.
 */
import * as THREE from "three";
import type { PadSurroundMats } from "./padSurroundMats";
import {
  BLAST_WALL_X_KM,
  BLAST_WALL_Z_KM,
  CRYO_COL_X_KM,
  CRYO_ROW_Z_KM,
  CRYO_TANK_D_KM,
  CRYO_TANK_LEN_KM,
  cryoEwCenters,
  farmPlanBounds,
} from "./padFarmLayout";

const CRYO_R = CRYO_TANK_D_KM * 0.5;
const SADDLE = 0.0012;
const cryoBodyGeo = new THREE.CylinderGeometry(CRYO_R, CRYO_R, CRYO_TANK_LEN_KM, 16);
const cryoCapGeo = new THREE.SphereGeometry(CRYO_R * 1.02, 12, 8);
const cryoBandGeo = new THREE.CylinderGeometry(CRYO_R * 1.05, CRYO_R * 1.05, 0.00045, 14);
const pipeRunGeo = new THREE.CylinderGeometry(0.00055, 0.00055, 0.22, 6);
const pipeRiserGeo = new THREE.CylinderGeometry(0.0004, 0.0004, 0.01, 6);
const spurGeo = new THREE.CylinderGeometry(0.0006, 0.0006, 0.048, 6);

function addEwTank(
  farm: THREE.Group,
  mats: PadSurroundMats,
  x: number,
  z: number,
  name?: string,
): void {
  const y = CRYO_R + SADDLE;
  const tank = new THREE.Mesh(cryoBodyGeo, mats.tankWhite);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(x, y, z);
  if (name) tank.name = name;
  farm.add(tank);
  for (const end of [-1, 1] as const) {
    const cap = new THREE.Mesh(cryoCapGeo, mats.tankWhite);
    cap.position.set(x + end * (CRYO_TANK_LEN_KM * 0.5), y, z);
    farm.add(cap);
  }
  for (const t of [0.28, 0.5, 0.72] as const) {
    const band = new THREE.Mesh(cryoBandGeo, mats.steelDark);
    band.rotation.z = Math.PI / 2;
    band.position.set(x + (t - 0.5) * CRYO_TANK_LEN_KM, y, z);
    farm.add(band);
  }
}

function addCryoBank(farm: THREE.Group, mats: PadSurroundMats): void {
  cryoEwCenters().forEach(([x, z], i) => {
    addEwTank(farm, mats, x, z, i === 0 ? "pad-cryo-tank-0" : undefined);
  });
}

function addPipeRacks(farm: THREE.Group, mats: PadSurroundMats): void {
  const racks = new THREE.Group();
  racks.name = "pad-pipe-rack";
  const midZ = (CRYO_ROW_Z_KM[0] + CRYO_ROW_Z_KM[1]) * 0.5;
  const midX = BLAST_WALL_X_KM;
  for (let tier = 0; tier < 3; tier++) {
    const run = new THREE.Mesh(pipeRunGeo, mats.steel);
    run.rotation.z = Math.PI / 2;
    run.position.set(midX, 0.0038 + tier * 0.0024, midZ);
    racks.add(run);
  }
  for (const x of CRYO_COL_X_KM) {
    const header = new THREE.Mesh(
      new THREE.CylinderGeometry(0.00045, 0.00045, 0.034, 6),
      mats.steelDark,
    );
    header.rotation.x = Math.PI / 2;
    header.position.set(x, 0.0065, midZ);
    racks.add(header);
    const riser = new THREE.Mesh(pipeRiserGeo, mats.steel);
    riser.position.set(x, 0.008, CRYO_ROW_Z_KM[0]);
    racks.add(riser);
  }
  // N–S spurs from the farm toward OLP-2 (near origin) and OLP-1.
  for (const x of [CRYO_COL_X_KM[0], CRYO_COL_X_KM[CRYO_COL_X_KM.length - 1]] as const) {
    const spur = new THREE.Mesh(spurGeo, mats.steelDark);
    spur.rotation.x = Math.PI / 2;
    spur.position.set(x, 0.0055, BLAST_WALL_Z_KM - 0.012);
    racks.add(spur);
  }
  farm.add(racks);
}

function addBlastWall(farm: THREE.Group, mats: PadSurroundMats): void {
  const b = farmPlanBounds();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(b.xWest - b.xEast, 0.008, 0.0035),
    mats.concreteDark,
  );
  wall.name = "pad-blast-wall";
  wall.position.set(BLAST_WALL_X_KM, 0.004, BLAST_WALL_Z_KM);
  farm.add(wall);
}

function addFarmBerm(farm: THREE.Group, mats: PadSurroundMats): void {
  const berm = new THREE.Group();
  berm.name = "pad-tank-farm-berm";
  const { xWest, xEast, zSouth, zNorth } = farmPlanBounds();
  const h = 0.0034;
  const t = 0.004;
  const cx = (xWest + xEast) * 0.5;
  const cz = (zSouth + zNorth) * 0.5;
  const walls: { size: [number, number, number]; pos: [number, number, number] }[] = [
    { size: [xWest - xEast, h, t], pos: [cx, h * 0.5, zSouth] },
    { size: [xWest - xEast, h, t], pos: [cx, h * 0.5, zNorth] },
    { size: [t, h, zNorth - zSouth], pos: [xWest, h * 0.5, cz] },
    { size: [t, h, zNorth - zSouth], pos: [xEast, h * 0.5, cz] },
  ];
  for (const w of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), mats.dirt);
    mesh.position.set(...w.pos);
    berm.add(mesh);
  }
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(xWest - xEast - 0.004, 0.0008, zNorth - zSouth - 0.004),
    mats.concrete,
  );
  slab.position.set(cx, 0.0003, cz);
  berm.add(slab);
  farm.add(berm);
}

function addFarmPumps(farm: THREE.Group, mats: PadSurroundMats): void {
  for (let i = 0; i < 4; i++) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0045, 0.005), mats.steelDark);
    pump.position.set(-0.04 - i * 0.012, 0.0024, BLAST_WALL_Z_KM - 0.012);
    farm.add(pump);
  }
}

/**
 * Pad-local tank farm between the pads (`pad-tank-farm` shadow cast root).
 * Group origin is the OLM so tank coordinates match {@link tankFarmVentAnchors}.
 */
export function buildTankFarm(mats: PadSurroundMats): THREE.Group {
  const farm = new THREE.Group();
  farm.name = "pad-tank-farm";
  addFarmBerm(farm, mats);
  addCryoBank(farm, mats);
  addPipeRacks(farm, mats);
  addBlastWall(farm, mats);
  addFarmPumps(farm, mats);
  return farm;
}

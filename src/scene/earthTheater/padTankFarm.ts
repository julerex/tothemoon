/**
 * Orbital tank farm — N–S horizontal cryo banks between OLP-2 and OLP-1.
 *
 * Look target: north-up ~640 m aerial (OLP-2 west, farm between the pads,
 * offload east of OLP-1). Live Mechazilla stays west of the OLM. The 2022
 * USDA NAIP farm is outdated and is covered by the berm slab.
 */
import * as THREE from "three";
import type { PadSurroundMats } from "./padSurroundMats";
import {
  BLAST_WALL_X_KM,
  BLAST_WALL_Z_KM,
  PAD1_X_KM,
  PIPE_NORTH_Z_KM,
  PIPE_SOUTH_Z_KM,
  VERTICAL_TANK_D_KM,
  VERTICAL_TANK_H_KM,
  VERTICAL_TANK_XZ,
  type CryoPlacement,
  cryoTankPlacements,
  farmPlanBounds,
} from "./padFarmLayout";

const SADDLE = 0.0012;
const unitBody = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const unitCap = new THREE.SphereGeometry(0.51, 10, 6);
const unitBand = new THREE.CylinderGeometry(0.53, 0.53, 0.015, 12);
const unitVert = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const pipeRunGeo = new THREE.CylinderGeometry(0.0005, 0.0005, 1, 6);
const pipeRiserGeo = new THREE.CylinderGeometry(0.00035, 0.00035, 0.01, 6);

function addHorizontalTank(
  farm: THREE.Group,
  mats: PadSurroundMats,
  p: CryoPlacement,
  name?: string,
): void {
  const y = p.d * 0.5 + SADDLE;
  const tank = new THREE.Mesh(unitBody, mats.tankWhite);
  if (p.axis === "ns") {
    tank.rotation.x = Math.PI / 2;
    tank.scale.set(p.d, p.len, p.d);
  } else {
    tank.rotation.z = Math.PI / 2;
    tank.scale.set(p.d, p.len, p.d);
  }
  tank.position.set(p.x, y, p.z);
  if (name) tank.name = name;
  farm.add(tank);
  for (const end of [-1, 1] as const) {
    const cap = new THREE.Mesh(unitCap, mats.tankWhite);
    cap.scale.setScalar(p.d);
    if (p.axis === "ns") cap.position.set(p.x, y, p.z + end * p.len * 0.5);
    else cap.position.set(p.x + end * p.len * 0.5, y, p.z);
    farm.add(cap);
  }
  for (const t of [0.28, 0.5, 0.72] as const) {
    const band = new THREE.Mesh(unitBand, mats.steelDark);
    if (p.axis === "ns") {
      band.rotation.x = Math.PI / 2;
      band.position.set(p.x, y, p.z + (t - 0.5) * p.len);
    } else {
      band.rotation.z = Math.PI / 2;
      band.position.set(p.x + (t - 0.5) * p.len, y, p.z);
    }
    band.scale.set(p.d, 1, p.d);
    farm.add(band);
  }
}

function addCryoBanks(farm: THREE.Group, mats: PadSurroundMats): void {
  cryoTankPlacements().forEach((p, i) => {
    addHorizontalTank(farm, mats, p, i === 0 ? "pad-cryo-tank-0" : undefined);
  });
}

function addVerticalTanks(farm: THREE.Group, mats: PadSurroundMats): void {
  for (const [x, z] of VERTICAL_TANK_XZ) {
    const mesh = new THREE.Mesh(unitVert, mats.tankWhite);
    mesh.scale.set(VERTICAL_TANK_D_KM, VERTICAL_TANK_H_KM, VERTICAL_TANK_D_KM);
    mesh.position.set(x, VERTICAL_TANK_H_KM * 0.5, z);
    farm.add(mesh);
  }
}

function addEwPipe(parent: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, len: number): void {
  const run = new THREE.Mesh(pipeRunGeo, mat);
  run.rotation.z = Math.PI / 2;
  run.scale.y = len;
  run.position.set(x, y, z);
  parent.add(run);
}

function addNsPipe(parent: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, len: number): void {
  const run = new THREE.Mesh(pipeRunGeo, mat);
  run.rotation.x = Math.PI / 2;
  run.scale.y = len;
  run.position.set(x, y, z);
  parent.add(run);
}

function addPipeRacks(farm: THREE.Group, mats: PadSurroundMats): void {
  const racks = new THREE.Group();
  racks.name = "pad-pipe-rack";
  const b = farmPlanBounds();
  const midX = (b.xWest + b.xEast) * 0.5;
  const spanX = b.xWest - b.xEast;
  for (let tier = 0; tier < 3; tier++) {
    const y = 0.0036 + tier * 0.0022;
    addEwPipe(racks, mats.steel, midX, y, PIPE_NORTH_Z_KM, spanX);
    addEwPipe(racks, mats.steelDark, midX, y, PIPE_SOUTH_Z_KM, spanX * 0.72);
  }
  for (const p of cryoTankPlacements()) {
    const header = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0004, 0.0004, p.len * 0.55, 6),
      mats.steelDark,
    );
    header.rotation.x = Math.PI / 2;
    header.position.set(p.x, 0.0062, p.z);
    racks.add(header);
    const riser = new THREE.Mesh(pipeRiserGeo, mats.steel);
    riser.position.set(p.x, 0.0075, p.z + p.len * 0.22);
    racks.add(riser);
  }
  addNsPipe(racks, mats.steelDark, -0.06, 0.0052, 0.04, 0.055);
  addNsPipe(racks, mats.steelDark, PAD1_X_KM + 0.012, 0.0052, -0.02, 0.07);
  farm.add(racks);
}

function addBlastWall(farm: THREE.Group, mats: PadSurroundMats): void {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.008, 0.0035), mats.concreteDark);
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
    pump.position.set(-0.048 - i * 0.01, 0.0024, BLAST_WALL_Z_KM - 0.01);
    farm.add(pump);
  }
}

/**
 * Pad-local tank farm between the pads (`pad-tank-farm` shadow cast root).
 * Group origin is the OLM so tank coordinates match `tankFarmVentAnchors`.
 */
export function buildTankFarm(mats: PadSurroundMats): THREE.Group {
  const farm = new THREE.Group();
  farm.name = "pad-tank-farm";
  addFarmBerm(farm, mats);
  addCryoBanks(farm, mats);
  addVerticalTanks(farm, mats);
  addPipeRacks(farm, mats);
  addBlastWall(farm, mats);
  addFarmPumps(farm, mats);
  return farm;
}

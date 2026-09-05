/**
 * Orbital tank farm — horizontal cryo banks between OLP-2 and OLP-1.
 *
 * Layout is packed along pad −X; the group yaws onto the surveyed west→east
 * GPS axis so the farm is not due east–west. Per-bank concrete slabs and a
 * dark north pipe rack; the 2022 USDA NAIP farm is outdated. Live Mechazilla
 * stays west of the OLM.
 */
import * as THREE from "three";
import type { PadSurroundMats } from "./padSurroundMats";
import {
  BLAST_WALL_X_KM,
  BLAST_WALL_Z_KM,
  CRYO_BANKS,
  CRYO_TANK_LEN_KM,
  PAD1_X_KM,
  PIPE_NORTH_Z_KM,
  PIPE_SOUTH_Z_KM,
  VERTICAL_TANK_D_KM,
  VERTICAL_TANK_H_KM,
  VERTICAL_TANK_XZ,
  type CryoBankSpec,
  type CryoPlacement,
  type PlanBounds,
  bankFootprint,
  cryoTankPlacements,
  farmBankSlabs,
  farmLayoutCentroid,
  farmPlanBounds,
  farmSurveyMidpoint,
} from "./padFarmLayout";
import { farmAxisYawRad } from "./starbaseSurvey";

const SADDLE = 0.0012;
const unitBody = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const unitCap = new THREE.SphereGeometry(0.51, 10, 6);
const unitBand = new THREE.CylinderGeometry(0.53, 0.53, 0.015, 12);
const unitVert = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const pipeRunGeo = new THREE.CylinderGeometry(0.0005, 0.0005, 1, 6);

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
  const cluster = new THREE.Group();
  cluster.name = "pad-vertical-tanks";
  for (const [x, z] of VERTICAL_TANK_XZ) {
    const mesh = new THREE.Mesh(unitVert, mats.tankWhite);
    mesh.scale.set(VERTICAL_TANK_D_KM, VERTICAL_TANK_H_KM, VERTICAL_TANK_D_KM);
    mesh.position.set(x, VERTICAL_TANK_H_KM * 0.5, z);
    cluster.add(mesh);
  }
  farm.add(cluster);
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

function addNorthHeader(racks: THREE.Group, mats: PadSurroundMats, span: PlanBounds): void {
  const midX = (span.xWest + span.xEast) * 0.5;
  const spanX = span.xWest - span.xEast;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(spanX, 0.0034, 0.006), mats.steelDark);
  deck.name = "pad-pipe-rack-north";
  deck.position.set(midX, 0.0028, PIPE_NORTH_Z_KM);
  racks.add(deck);
  for (let tier = 0; tier < 3; tier++) {
    addEwPipe(racks, mats.steel, midX, 0.005 + tier * 0.0016, PIPE_NORTH_Z_KM - 0.0018 + tier * 0.0018, spanX);
  }
  const posts = 9;
  for (let i = 0; i < posts; i++) {
    const x = span.xWest - (i / (posts - 1)) * spanX;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.0009, 0.0034, 0.0009), mats.steelDark);
    post.position.set(x, 0.0017, PIPE_NORTH_Z_KM);
    racks.add(post);
  }
}

function addBankManifold(racks: THREE.Group, mats: PadSurroundMats, bank: CryoBankSpec): void {
  const fp = bankFootprint(bank);
  const len = bank.len ?? CRYO_TANK_LEN_KM;
  const spanX = (fp.xWest - fp.xEast) * 0.92;
  const midX = (fp.xWest + fp.xEast) * 0.5;
  const z = bank.z0 + len * 0.5 + 0.002;
  const box = new THREE.Mesh(new THREE.BoxGeometry(spanX, 0.0026, 0.0042), mats.steelDark);
  box.position.set(midX, 0.0024, z);
  racks.add(box);
  const spurLen = Math.abs(PIPE_NORTH_Z_KM - z);
  addNsPipe(racks, mats.steelDark, midX, 0.0044, (z + PIPE_NORTH_Z_KM) * 0.5, spurLen);
}

function addPipeRacks(farm: THREE.Group, mats: PadSurroundMats): void {
  const racks = new THREE.Group();
  racks.name = "pad-pipe-rack";
  const span = farmPlanBounds();
  addNorthHeader(racks, mats, span);
  for (const bank of CRYO_BANKS) addBankManifold(racks, mats, bank);
  const southSpan = (span.xWest - span.xEast) * 0.55;
  const southMid = (span.xWest + span.xEast) * 0.5 + 0.04;
  const south = new THREE.Mesh(new THREE.BoxGeometry(southSpan, 0.0022, 0.0035), mats.steelDark);
  south.position.set(southMid, 0.002, PIPE_SOUTH_Z_KM);
  racks.add(south);
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

function addSlab(parent: THREE.Group, b: PlanBounds, mat: THREE.Material, y: number, name?: string): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(b.xWest - b.xEast, 0.0008, b.zNorth - b.zSouth),
    mat,
  );
  mesh.position.set((b.xWest + b.xEast) * 0.5, y, (b.zSouth + b.zNorth) * 0.5);
  if (name) mesh.name = name;
  parent.add(mesh);
}

function addFarmBerm(farm: THREE.Group, mats: PadSurroundMats): void {
  const berm = new THREE.Group();
  berm.name = "pad-tank-farm-berm";
  for (const s of farmBankSlabs()) {
    addSlab(berm, s, mats.concrete, 0.0003, s.id === "main" ? "pad-cryo-slab-main" : undefined);
  }
  const vz = VERTICAL_TANK_XZ;
  const xs = vz.map((p) => p[0]);
  const zs = vz.map((p) => p[1]);
  addSlab(berm, {
    xWest: Math.max(...xs) + 0.006,
    xEast: Math.min(...xs) - 0.006,
    zSouth: Math.min(...zs) - 0.006,
    zNorth: Math.max(...zs) + 0.006,
  }, mats.concreteDark, 0.00025);
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
 * Sit the axis-aligned farm layout on the surveyed west→east GPS axis.
 * Children stay in layout km; the group yaw + translation is pad-local.
 */
function applyFarmSurveyPose(farm: THREE.Group): void {
  const c = farmLayoutCentroid();
  const mid = farmSurveyMidpoint();
  const inner = new THREE.Group();
  inner.name = "pad-tank-farm-layout";
  while (farm.children.length > 0) inner.add(farm.children[0]!);
  inner.position.set(-c.x, 0, -c.z);
  farm.add(inner);
  farm.position.set(mid.x, 0, mid.z);
  farm.rotation.y = farmAxisYawRad();
}

/**
 * Pad-local tank farm between the pads (`pad-tank-farm` shadow cast root).
 * Group origin is the layout centroid, seated on the surveyed GPS midpoint.
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
  applyFarmSurveyPose(farm);
  return farm;
}

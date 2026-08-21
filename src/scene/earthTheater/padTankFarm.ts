/**
 * OLP-2 tank farm — matte white cryo banks in a bermed compound (V23.1).
 * Aerial T−5 still: white horizontals, concrete enclosure, pipe racks — not grey boxes.
 */
import * as THREE from "three";
import type { PadSurroundMats } from "./padSurroundMats";

const TANK_R = 0.0038;
const TANK_LEN = 0.03;
const BAND_R = TANK_R * 1.04;
const BAND_H = 0.00035;

/** Shared geos — reused across the primary bank. */
const tankBodyGeo = new THREE.CylinderGeometry(TANK_R, TANK_R, TANK_LEN, 14);
const tankCapGeo = new THREE.SphereGeometry(TANK_R * 1.02, 10, 8);
const bandGeo = new THREE.CylinderGeometry(BAND_R, BAND_R, BAND_H, 12);
const pipeGeo = new THREE.CylinderGeometry(0.00045, 0.00045, 0.048, 6);
const stackGeo = new THREE.CylinderGeometry(0.0007, 0.0009, 1, 8);

function addHorizontalTank(
  farm: THREE.Group,
  mats: PadSurroundMats,
  tankR: number,
  tankLen: number,
  x: number,
  z: number,
  withBands: boolean,
): void {
  const y = tankR + 0.001;
  const tank = new THREE.Mesh(tankBodyGeo, mats.tankWhite);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(x, y, z);
  farm.add(tank);
  for (const end of [-1, 1] as const) {
    const cap = new THREE.Mesh(tankCapGeo, mats.tankWhite);
    cap.position.set(x, y, z + end * (tankLen * 0.5));
    farm.add(cap);
  }
  if (!withBands) return;
  for (const t of [-0.32, 0, 0.32] as const) {
    const band = new THREE.Mesh(bandGeo, mats.steelDark);
    band.rotation.x = Math.PI / 2;
    band.position.set(x, y, z + t * tankLen * 0.5);
    farm.add(band);
  }
}

function addPrimaryTankBank(farm: THREE.Group, mats: PadSurroundMats): void {
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      addHorizontalTank(
        farm, mats, TANK_R, TANK_LEN,
        0.01 + col * 0.011, -0.02 + row * 0.012, true,
      );
    }
  }
}

function addSecondaryHorizTanks(farm: THREE.Group, mats: PadSurroundMats): void {
  const geo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.022, 12);
  for (let col = 0; col < 3; col++) {
    const tank = new THREE.Mesh(geo, mats.tankWhite);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0.055 + col * 0.01, 0.0042, 0.03);
    farm.add(tank);
  }
}

function addBulletTanks(farm: THREE.Group, mats: PadSurroundMats): void {
  for (let i = 0; i < 6; i++) {
    const h = 0.01 + (i % 3) * 0.003;
    const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, h, 10), mats.steel);
    bullet.position.set(-0.02 + i * 0.008, h * 0.5, 0.045);
    farm.add(bullet);
  }
}

function addSecondaryTanks(farm: THREE.Group, mats: PadSurroundMats): void {
  addSecondaryHorizTanks(farm, mats);
  addBulletTanks(farm, mats);
}

/** Pipe racks as stacked thin cylinders + small valve boxes (not solid boxes). */
function addPipeRacks(farm: THREE.Group, mats: PadSurroundMats): void {
  for (let i = 0; i < 4; i++) {
    const z = -0.02 + i * 0.014;
    for (let tier = 0; tier < 3; tier++) {
      const pipe = new THREE.Mesh(pipeGeo, mats.steel);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0.01, 0.004 + tier * 0.0022, z);
      farm.add(pipe);
    }
    const valve = new THREE.Mesh(
      new THREE.BoxGeometry(0.004, 0.003, 0.003),
      mats.steelDark,
    );
    valve.position.set(-0.012, 0.006, z);
    farm.add(valve);
  }
  // Cross-header linking the racks.
  for (let tier = 0; tier < 2; tier++) {
    const header = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0004, 0.0004, 0.055, 6),
      mats.steelDark,
    );
    header.rotation.x = Math.PI / 2;
    header.position.set(-0.005, 0.005 + tier * 0.0025, 0.001);
    farm.add(header);
  }
}

const FARM_EQUIP: { size: [number, number, number]; pos: [number, number, number] }[] = [
  { size: [0.022, 0.008, 0.016], pos: [0.07, 0.005, -0.01] },
  { size: [0.016, 0.01, 0.02], pos: [0.08, 0.006, 0.04] },
  { size: [0.03, 0.005, 0.012], pos: [0.04, 0.004, 0.055] },
  { size: [0.012, 0.012, 0.012], pos: [-0.03, 0.007, 0.02] },
  { size: [0.018, 0.004, 0.018], pos: [0.06, 0.003, -0.04] },
];

const FARM_STACKS: readonly (readonly [number, number, number])[] = [
  [0.05, 0.06, 0.03], [0.07, 0.05, 0.024], [0.03, 0.065, 0.02], [0.085, 0.03, 0.018],
];

/** Tall vent stacks / light poles readable at ~190 m AGL aerial. */
const FARM_POLES: readonly (readonly [number, number, number])[] = [
  [0.042, -0.035, 0.022], [0.048, 0.055, 0.028], [-0.028, 0.01, 0.02],
];

function addFarmEquipment(farm: THREE.Group, mats: PadSurroundMats): void {
  for (const e of FARM_EQUIP) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(...e.size), mats.steelDark);
    box.position.set(...e.pos);
    farm.add(box);
  }
  for (const [sx, sz, h] of FARM_STACKS) {
    const stack = new THREE.Mesh(stackGeo, mats.steelDark);
    stack.scale.set(1, h, 1);
    stack.position.set(sx, h * 0.5, sz);
    farm.add(stack);
  }
  for (const [px, pz, h] of FARM_POLES) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.00035, 0.00045, h, 6),
      mats.steel,
    );
    pole.position.set(px, h * 0.5, pz);
    farm.add(pole);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.0007, 6, 4),
      mats.steel,
    );
    lamp.position.set(px, h + 0.0005, pz);
    farm.add(lamp);
  }
}

/**
 * Low concrete berm enclosing the primary bank (webcast compound walls).
 * Named `pad-tank-farm-berm` for tests / aerial silhouette checks.
 */
function addFarmBerm(farm: THREE.Group, mats: PadSurroundMats): void {
  const berm = new THREE.Group();
  berm.name = "pad-tank-farm-berm";
  const wallH = 0.0032;
  const wallT = 0.0018;
  // Enclosure around primary 3×4 bank (~0.01..0.043 x, -0.02..0.004 z).
  const walls: { size: [number, number, number]; pos: [number, number, number] }[] = [
    { size: [0.055, wallH, wallT], pos: [0.025, wallH * 0.5, -0.032] },
    { size: [0.055, wallH, wallT], pos: [0.025, wallH * 0.5, 0.018] },
    { size: [wallT, wallH, 0.052], pos: [-0.004, wallH * 0.5, -0.007] },
    { size: [wallT, wallH, 0.052], pos: [0.054, wallH * 0.5, -0.007] },
  ];
  for (const w of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), mats.concreteDark);
    mesh.position.set(...w.pos);
    berm.add(mesh);
  }
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(0.056, 0.0008, 0.048),
    mats.concrete,
  );
  slab.position.set(0.025, 0.0002, -0.007);
  berm.add(slab);
  farm.add(berm);
}

/** Pad-local tank farm east of Mechazilla (`pad-tank-farm` shadow cast root). */
export function buildTankFarm(mats: PadSurroundMats): THREE.Group {
  const farm = new THREE.Group();
  farm.name = "pad-tank-farm";
  farm.position.set(0.09, 0, 0.04);
  addFarmBerm(farm, mats);
  addPrimaryTankBank(farm, mats);
  addSecondaryTanks(farm, mats);
  addPipeRacks(farm, mats);
  addFarmEquipment(farm, mats);
  return farm;
}

/**
 * Mechazilla chopsticks — 3D box-truss T at the rail top (V27).
 *
 * Flight 13 T−2 / T−5 stills: thick arms with lattice cheeks flanking the
 * ship nose. Catch drops the whole carriage (arms are parented) onto
 * {@link CHOPSTICK_CATCH_M}. Inner catch rail ~20 m (public catch hardware).
 *
 * @see docs/VISUAL_REALISM.md — V23.4 / V27
 */
import * as THREE from "three";
import {
  CHOPSTICK_HALF_SPAN, CHOPSTICK_LEN, CHOPSTICK_OPEN_YAW_RAD,
  CHOPSTICK_REST_Y, TOWER_FACE, TOWER_OX, TOWER_OY0,
} from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";
import { addWorklight } from "./mechazillaWorklights";

const ARM_LATTICE_N = 8;
const ARM_H = 0.0072;
const ARM_W = 0.0056;
const CHORD_T = 0.00072;
const CATCH_RAIL_LEN = 0.02;

const chordGeo = new THREE.BoxGeometry(CHOPSTICK_LEN, CHORD_T, CHORD_T);
const vertGeo = new THREE.BoxGeometry(0.0012, ARM_H * 0.92, ARM_W * 0.18);
const bay = CHOPSTICK_LEN / ARM_LATTICE_N;
const diagGeo = new THREE.BoxGeometry(bay * 0.9, 0.00065, 0.00065);
const walkGeo = new THREE.BoxGeometry(CHOPSTICK_LEN * 0.88, 0.00022, ARM_W * 0.72);
const railGeo = new THREE.BoxGeometry(CATCH_RAIL_LEN, 0.00095, 0.0005);

export function addChopstickCarriage(g: THREE.Group, mats: TowerMats): THREE.Group {
  const carryY = TOWER_OY0 + CHOPSTICK_REST_Y;
  const carriage = new THREE.Group();
  carriage.name = "pad-chopstick-carriage";
  carriage.position.set(TOWER_OX, carryY, 0);
  carriage.userData.restY = carryY;
  addCarriageBody(carriage, mats);
  addChopstickCheeks(carriage, mats);
  addChopstickArms(carriage, mats);
  g.add(carriage);
  return carriage;
}

function addCarriageBody(carriage: THREE.Group, mats: TowerMats): void {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 1.55, 0.022, TOWER_FACE * 2.15),
    mats.steelDark,
  );
  carriage.add(body);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 1.2, 0.006, TOWER_FACE * 0.7),
    mats.steel,
  );
  cap.position.set(-TOWER_FACE * 0.15, 0.014, 0);
  carriage.add(cap);
  const tee = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 0.55, 0.0075, TOWER_FACE * 2.55),
    mats.steel,
  );
  tee.position.set(-TOWER_FACE * 0.58, 0.005, 0);
  carriage.add(tee);
  const teeChord = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 0.18, 0.0022, TOWER_FACE * 2.5),
    mats.accent,
  );
  teeChord.position.set(-TOWER_FACE * 0.58, 0.01, 0);
  carriage.add(teeChord);
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 0.35, 0.01, TOWER_FACE * 1.6),
    mats.steelBright,
  );
  rail.position.set(TOWER_FACE * 0.35, 0.002, 0);
  carriage.add(rail);
  const sheave = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0035, 0.0035, TOWER_FACE * 0.9, 10),
    mats.steel,
  );
  sheave.rotation.z = Math.PI / 2;
  sheave.position.set(TOWER_FACE * 0.2, 0.014, 0);
  carriage.add(sheave);
  addWorklight(carriage, mats, -TOWER_FACE * 0.7, 0.012, -TOWER_FACE * 0.9);
  addWorklight(carriage, mats, -TOWER_FACE * 0.7, 0.012, TOWER_FACE * 0.9);
}

function addChopstickCheeks(carriage: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  for (const side of [-1, 1] as const) {
    const cheek = new THREE.Group();
    cheek.position.set(-half * 0.35, 0.004, side * (TOWER_FACE * 0.78));
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_FACE * 0.7, 0.016, 0.0028),
      mats.steel,
    );
    cheek.add(plate);
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.0012, 0.014, 0.0012),
        mats.accent,
      );
      bar.position.set(-TOWER_FACE * 0.22 + i * TOWER_FACE * 0.15, 0, side * 0.0022);
      cheek.add(bar);
    }
    carriage.add(cheek);
  }
}

function addChopstickArms(carriage: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  for (const side of [-1, 1] as const) {
    const stick = buildChopstickArm(mats, side);
    stick.position.set(-half, 0.006, side * CHOPSTICK_HALF_SPAN);
    stick.rotation.y = side * CHOPSTICK_OPEN_YAW_RAD;
    stick.rotation.z = -0.04;
    stick.userData.restRotY = stick.rotation.y;
    stick.userData.restRotZ = stick.rotation.z;
    carriage.add(stick);
  }
}

function buildChopstickArm(mats: TowerMats, side: number): THREE.Group {
  const stick = new THREE.Group();
  stick.name = side < 0 ? "pad-chopstick-L" : "pad-chopstick-R";
  addChopstickParts(stick, mats, side);
  return stick;
}

function addChopstickParts(stick: THREE.Group, mats: TowerMats, side: number): void {
  addChopstickChords(stick, mats);
  addChopstickLattice(stick, mats);
  addCatchRail(stick, mats, side);
  addWalkway(stick, mats);
  addChopstickTip(stick, mats);
  addArmLights(stick, mats);
}

function addChopstickChords(stick: THREE.Group, mats: TowerMats): void {
  for (const y of [ARM_H * 0.38, -ARM_H * 0.38]) {
    for (const z of [ARM_W * 0.32, -ARM_W * 0.32]) {
      const chord = new THREE.Mesh(chordGeo, y > 0 ? mats.steel : mats.accent);
      chord.position.set(-CHOPSTICK_LEN * 0.5, y, z);
      stick.add(chord);
    }
  }
}

function addChopstickLattice(stick: THREE.Group, mats: TowerMats): void {
  for (let i = 0; i < ARM_LATTICE_N; i++) {
    const t = (i + 0.5) / ARM_LATTICE_N;
    const x = -CHOPSTICK_LEN * t;
    const vert = new THREE.Mesh(vertGeo, mats.steelDark);
    vert.position.set(x, 0, 0);
    stick.add(vert);
    if (i >= ARM_LATTICE_N - 1) continue;
    const dx = x - bay * 0.5;
    for (const z of [-ARM_W * 0.32, ARM_W * 0.32]) {
      const d1 = new THREE.Mesh(diagGeo, mats.accent);
      d1.position.set(dx, 0, z);
      d1.rotation.z = 0.62;
      stick.add(d1);
      const d2 = d1.clone();
      d2.rotation.z = -0.62;
      stick.add(d2);
    }
  }
}

function addCatchRail(stick: THREE.Group, mats: TowerMats, side: number): void {
  const rail = new THREE.Mesh(railGeo, mats.steelBright);
  rail.name = "pad-chopstick-catch-rail";
  rail.position.set(-CHOPSTICK_LEN * 0.62, -ARM_H * 0.12, -side * ARM_W * 0.42);
  stick.add(rail);
}

function addWalkway(stick: THREE.Group, mats: TowerMats): void {
  const walk = new THREE.Mesh(walkGeo, mats.steelDark);
  walk.name = "pad-chopstick-walkway";
  walk.position.set(-CHOPSTICK_LEN * 0.48, ARM_H * 0.5, 0);
  stick.add(walk);
}

function addArmLights(stick: THREE.Group, mats: TowerMats): void {
  for (const t of [0.22, 0.5, 0.78]) {
    addWorklight(stick, mats, -CHOPSTICK_LEN * t, ARM_H * 0.58, 0);
  }
}

function addChopstickTip(stick: THREE.Group, mats: TowerMats): void {
  const finger = new THREE.Mesh(
    new THREE.BoxGeometry(0.011, ARM_H * 1.65, ARM_W * 1.35),
    mats.steelDark,
  );
  finger.position.set(-CHOPSTICK_LEN + 0.003, -0.001, 0);
  stick.add(finger);
  const hang = new THREE.Mesh(
    new THREE.BoxGeometry(0.0055, 0.013, ARM_W * 0.85),
    mats.accent,
  );
  hang.position.set(-CHOPSTICK_LEN + 0.006, -0.008, 0);
  stick.add(hang);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.01, 8), mats.steel);
  pin.position.set(-CHOPSTICK_LEN + 0.004, 0.001, 0);
  stick.add(pin);
  const ram = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0005, 0.0005, CHOPSTICK_LEN * 0.32, 6),
    mats.steelBright,
  );
  ram.rotation.z = Math.PI / 2;
  ram.position.set(-CHOPSTICK_LEN * 0.22, -ARM_H * 0.22, 0);
  stick.add(ram);
}

/**
 * Mechazilla chopsticks — launch-park T at the rail top.
 *
 * Flight 13 T−2 / T−5 stills: thick arms with lattice cheeks flanking the
 * ship nose (not thin beams at grid-fin height). Catch drops the whole
 * carriage (arms are parented) onto {@link CHOPSTICK_CATCH_M}.
 *
 * @see docs/VISUAL_REALISM.md — V23.4
 */
import * as THREE from "three";
import {
  CHOPSTICK_HALF_SPAN, CHOPSTICK_LEN, CHOPSTICK_OPEN_YAW_RAD,
  CHOPSTICK_REST_Y, TOWER_FACE, TOWER_OX, TOWER_OY0,
} from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";

/** Coarse lattice cells along the arm — readable at aerial, not hull-cam density. */
const ARM_LATTICE_N = 4;

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
    new THREE.BoxGeometry(TOWER_FACE * 1.45, 0.016, TOWER_FACE * 1.85),
    mats.steelDark,
  );
  carriage.add(body);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 1.2, 0.006, TOWER_FACE * 0.7),
    mats.steel,
  );
  cap.position.set(-TOWER_FACE * 0.15, 0.009, 0);
  carriage.add(cap);
  // Rail / sheave volume so the carriage is not one box (V23.4).
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
  sheave.position.set(TOWER_FACE * 0.2, 0.012, 0);
  carriage.add(sheave);
}

function addChopstickCheeks(carriage: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  for (const side of [-1, 1] as const) {
    const cheek = new THREE.Group();
    cheek.position.set(-half * 0.35, 0.004, side * (TOWER_FACE * 0.78));
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_FACE * 0.7, 0.014, 0.0025),
      mats.steel,
    );
    cheek.add(plate);
    // Vertical lattice bars on the cheek face.
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.0012, 0.012, 0.0012),
        mats.accent,
      );
      bar.position.set(-TOWER_FACE * 0.2 + i * TOWER_FACE * 0.2, 0, side * 0.002);
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
  addChopstickParts(stick, mats);
  return stick;
}

function addChopstickParts(stick: THREE.Group, mats: TowerMats): void {
  const armLen = CHOPSTICK_LEN;
  const armH = 0.0042;
  const armW = 0.0052;
  // Outer frame chords (open lattice arm).
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(armLen, armH * 0.35, armW * 0.35),
    mats.steel,
  );
  top.position.set(-armLen * 0.5, armH * 0.4, 0);
  stick.add(top);
  const bot = new THREE.Mesh(
    new THREE.BoxGeometry(armLen * 0.94, armH * 0.35, armW * 0.35),
    mats.accent,
  );
  bot.position.set(-armLen * 0.5, -armH * 0.45, 0);
  stick.add(bot);
  const sideA = new THREE.Mesh(
    new THREE.BoxGeometry(armLen * 0.96, armH * 0.25, armW * 0.22),
    mats.steelDark,
  );
  sideA.position.set(-armLen * 0.5, 0, armW * 0.35);
  stick.add(sideA);
  const sideB = sideA.clone();
  sideB.position.z = -armW * 0.35;
  stick.add(sideB);
  addChopstickLattice(stick, mats, armLen, armH, armW);
  addChopstickTip(stick, mats, armLen, armH, armW);
}

function addChopstickLattice(
  stick: THREE.Group, mats: TowerMats, armLen: number, armH: number, armW: number,
): void {
  for (let i = 0; i < ARM_LATTICE_N; i++) {
    const t = (i + 0.5) / ARM_LATTICE_N;
    const x = -armLen * t;
    const vert = new THREE.Mesh(
      new THREE.BoxGeometry(0.0014, armH * 1.1, armW * 0.28),
      mats.steelDark,
    );
    vert.position.set(x, 0, 0);
    stick.add(vert);
    // Diagonal X within each bay (coarse, aerial-readable).
    if (i < ARM_LATTICE_N - 1) {
      const bay = armLen / ARM_LATTICE_N;
      const diag = new THREE.Mesh(
        new THREE.BoxGeometry(bay * 0.85, 0.0009, 0.0009),
        mats.accent,
      );
      diag.position.set(x - bay * 0.5, 0, 0);
      diag.rotation.z = 0.55;
      stick.add(diag);
      const diag2 = diag.clone();
      diag2.rotation.z = -0.55;
      stick.add(diag2);
    }
  }
}

function addChopstickTip(
  stick: THREE.Group, mats: TowerMats, armLen: number, armH: number, armW: number,
): void {
  const finger = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, armH * 1.8, armW * 1.55),
    mats.steelDark,
  );
  finger.position.set(-armLen + 0.003, -0.001, 0);
  stick.add(finger);
  const hang = new THREE.Mesh(
    new THREE.BoxGeometry(0.0045, 0.012, armW * 0.9),
    mats.accent,
  );
  hang.position.set(-armLen + 0.006, -0.007, 0);
  stick.add(hang);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.009, 8), mats.steel);
  pin.position.set(-armLen + 0.004, 0.001, 0);
  stick.add(pin);
}

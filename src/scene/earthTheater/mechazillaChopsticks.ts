/**
 * Mechazilla chopsticks — launch-park T at the rail top.
 *
 * Flight 13 T−2 stills show a boxy carriage and two thick open arms flanking
 * the ship nose, not thin beams at grid-fin height. Catch drops the whole
 * carriage (arms are parented) onto {@link CHOPSTICK_CATCH_M}.
 */
import * as THREE from "three";
import {
  CHOPSTICK_HALF_SPAN, CHOPSTICK_LEN, CHOPSTICK_OPEN_YAW_RAD,
  CHOPSTICK_REST_Y, TOWER_FACE, TOWER_OX, TOWER_OY0,
} from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";

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
}

function addChopstickCheeks(carriage: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  for (const side of [-1, 1] as const) {
    const cheek = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_FACE * 0.7, 0.014, 0.007),
      mats.steel,
    );
    cheek.position.set(-half * 0.35, 0.004, side * (TOWER_FACE * 0.78));
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
  const beam = new THREE.Mesh(new THREE.BoxGeometry(armLen, armH, armW), mats.steel);
  beam.position.set(-armLen * 0.5, 0, 0);
  stick.add(beam);
  const chord = new THREE.Mesh(
    new THREE.BoxGeometry(armLen * 0.94, armH * 0.45, armW * 0.55),
    mats.accent,
  );
  chord.position.set(-armLen * 0.5, -armH * 0.55, 0);
  stick.add(chord);
  addChopstickBraces(stick, mats, armLen, armH, armW);
  addChopstickTip(stick, mats, armLen, armH, armW);
}

function addChopstickBraces(
  stick: THREE.Group, mats: TowerMats, armLen: number, armH: number, armW: number,
): void {
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(0.0022, armH * 1.15, armW * 0.35),
      mats.steelDark,
    );
    brace.position.set(-armLen * t, 0, 0);
    stick.add(brace);
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

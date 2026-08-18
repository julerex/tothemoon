/** Mechazilla tower, OLM, chopsticks; recovery pose updates. */
import * as THREE from "three";
import { makeScorchTexture } from "./padTextures";

export function updateMechazillaRecovery(
  pad: THREE.Object3D,
  pose: { close: number; yawInRad: number; pitchRad: number; carriageDy: number },
): void {
  applyChopstickArm(pad.getObjectByName("pad-chopstick-L"), pose);
  applyChopstickArm(pad.getObjectByName("pad-chopstick-R"), pose);
  const carriage = pad.getObjectByName("pad-chopstick-carriage");
  if (carriage) {
    const restY = (carriage.userData.restY as number | undefined) ?? carriage.position.y;
    carriage.position.y = restY + pose.carriageDy;
  }
}

function applyChopstickArm(
  arm: THREE.Object3D | undefined,
  pose: { yawInRad: number; pitchRad: number },
): void {
  if (!arm) return;
  const restY = (arm.userData.restRotY as number | undefined) ?? arm.rotation.y;
  const restZ = (arm.userData.restRotZ as number | undefined) ?? arm.rotation.z;
  const sign = restY === 0 ? 1 : Math.sign(restY);
  arm.rotation.y = restY - sign * pose.yawInRad;
  arm.rotation.z = restZ + pose.pitchRad;
}
type TowerMats = {
  steel: THREE.MeshStandardMaterial;
  steelDark: THREE.MeshStandardMaterial;
  steelBright: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
};

function makeTowerMats(): TowerMats {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0xb4b8c0, metalness: 0.72, roughness: 0.38 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x7a8088, metalness: 0.65, roughness: 0.45 }),
    steelBright: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.78, roughness: 0.32 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x5a6068, metalness: 0.55, roughness: 0.5 }),
  };
}

const TOWER_H = 0.146;
const TOWER_FACE = 0.014;
const TOWER_COL = 0.0016;
const TOWER_OX = 0.022;
const TOWER_OY0 = 0.0;

function addTowerColumns(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const corners: [number, number][] = [[-half, -half], [half, -half], [-half, half], [half, half]];
  for (const [cx, cz] of corners) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(TOWER_COL, TOWER_H, TOWER_COL), mats.steel);
    col.position.set(TOWER_OX + cx, TOWER_OY0 + TOWER_H * 0.5, cz);
    g.add(col);
  }
}

function addTowerRingBeamsZ(g: THREE.Group, mats: TowerMats, y: number, half: number): void {
  for (const z of [-half, half]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TOWER_FACE, TOWER_COL * 0.7, TOWER_COL * 0.65), mats.steelDark);
    beam.position.set(TOWER_OX, y, z);
    g.add(beam);
  }
}

function addTowerRingBeamsX(g: THREE.Group, mats: TowerMats, y: number, half: number): void {
  for (const x of [-half, half]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TOWER_COL * 0.65, TOWER_COL * 0.7, TOWER_FACE), mats.steelDark);
    beam.position.set(TOWER_OX + x, y, 0);
    g.add(beam);
  }
}

function addTowerRingAtY(g: THREE.Group, mats: TowerMats, y: number, half: number): void {
  addTowerRingBeamsZ(g, mats, y, half);
  addTowerRingBeamsX(g, mats, y, half);
}

function addTowerRings(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const nRings = 12;
  for (let i = 1; i <= nRings; i++) {
    addTowerRingAtY(g, mats, TOWER_OY0 + (i / nRings) * TOWER_H * 0.96, half);
  }
}

function addTowerRail(g: THREE.Group, mats: TowerMats, half: number): void {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(TOWER_COL * 1.2, TOWER_H * 0.92, TOWER_COL * 2.2), mats.steelBright);
  rail.position.set(TOWER_OX - half - TOWER_COL * 0.4, TOWER_OY0 + TOWER_H * 0.48, 0);
  g.add(rail);
}

function addTowerPeakAndSheave(g: THREE.Group, mats: TowerMats, half: number): void {
  const peak = new THREE.Mesh(new THREE.BoxGeometry(TOWER_FACE * 1.15, 0.008, TOWER_FACE * 1.15), mats.steelBright);
  peak.position.set(TOWER_OX, TOWER_OY0 + TOWER_H + 0.002, 0);
  g.add(peak);
  const sheave = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, TOWER_FACE * 0.7, 10), mats.steelDark);
  sheave.rotation.z = Math.PI / 2;
  sheave.position.set(TOWER_OX - half * 0.3, TOWER_OY0 + TOWER_H + 0.006, 0);
  g.add(sheave);
}

function addTowerRailAndPeak(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  addTowerRail(g, mats, half);
  addTowerPeakAndSheave(g, mats, half);
}

function addChopstickCheeks(g: THREE.Group, mats: TowerMats, carryY: number, half: number): void {
  for (const side of [-1, 1] as const) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(TOWER_FACE * 0.55, 0.008, 0.004), mats.steelBright);
    cheek.position.set(TOWER_OX - half * 0.3, carryY + 0.002, side * (TOWER_FACE * 0.72));
    g.add(cheek);
  }
}

function addChopstickCarriage(g: THREE.Group, mats: TowerMats, carryY: number): void {
  const half = TOWER_FACE * 0.5;
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(TOWER_FACE * 1.35, 0.012, TOWER_FACE * 1.55), mats.steelDark);
  carriage.position.set(TOWER_OX, carryY, 0);
  carriage.name = "pad-chopstick-carriage";
  carriage.userData.restY = carryY;
  g.add(carriage);
  addChopstickCheeks(g, mats, carryY, half);
}

function buildChopstickArm(mats: TowerMats, side: number): THREE.Group {
  const armLen = 0.026;
  const armSq = 0.0028;
  const stick = new THREE.Group();
  stick.name = side < 0 ? "pad-chopstick-L" : "pad-chopstick-R";
  addChopstickParts(stick, mats, armLen, armSq);
  return stick;
}

function addChopstickParts(stick: THREE.Group, mats: TowerMats, armLen: number, armSq: number): void {
  const beam = new THREE.Mesh(new THREE.BoxGeometry(armLen, armSq, armSq * 1.6), mats.steelBright);
  beam.position.set(-armLen * 0.5, 0, 0);
  stick.add(beam);
  const railUnd = new THREE.Mesh(new THREE.BoxGeometry(armLen * 0.92, armSq * 0.45, armSq * 0.55), mats.accent);
  railUnd.position.set(-armLen * 0.5, -armSq * 0.55, 0);
  stick.add(railUnd);
  addChopstickTip(stick, mats, armLen, armSq);
}

function addChopstickTip(stick: THREE.Group, mats: TowerMats, armLen: number, armSq: number): void {
  const finger = new THREE.Mesh(new THREE.BoxGeometry(0.007, armSq * 1.5, armSq * 2.6), mats.steel);
  finger.position.set(-armLen + 0.002, 0, 0);
  stick.add(finger);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.0035, armSq * 1.1, 0.012), mats.accent);
  tooth.position.set(-armLen + 0.005, 0, 0);
  stick.add(tooth);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.006, 8), mats.steelDark);
  pin.position.set(-armLen + 0.003, 0.001, 0);
  stick.add(pin);
}

function addChopsticks(g: THREE.Group, mats: TowerMats, carryY: number): void {
  const half = TOWER_FACE * 0.5;
  for (const side of [-1, 1] as const) {
    const stick = buildChopstickArm(mats, side);
    stick.position.set(TOWER_OX - half, carryY + 0.005, side * 0.013);
    stick.rotation.y = side * 0.05;
    stick.rotation.z = -0.03;
    stick.userData.restRotY = stick.rotation.y;
    stick.userData.restRotZ = stick.rotation.z;
    g.add(stick);
  }
}

function addQdArm(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const qdY = TOWER_OY0 + 0.098;
  const qd = new THREE.Group();
  qd.name = "pad-qd-arm";
  addQdBoom(qd, mats);
  addQdHead(qd, mats);
  qd.position.set(TOWER_OX - half, qdY, 0.004);
  qd.rotation.z = 0.08;
  g.add(qd);
}

function addQdBellows(qd: THREE.Group, mats: TowerMats): void {
  for (let i = 0; i < 4; i++) {
    const bellow = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0016, 0.0018, 8), mats.steelDark);
    bellow.rotation.z = Math.PI / 2;
    bellow.position.set(-0.018 - i * 0.0016, -0.001, 0);
    qd.add(bellow);
  }
}

function addQdBoom(qd: THREE.Group, mats: TowerMats): void {
  const qdBoom = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.0024, 0.0024), mats.steelBright);
  qdBoom.position.set(-0.011, 0, 0);
  qd.add(qdBoom);
  const qdTruss = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.001, 0.001), mats.accent);
  qdTruss.position.set(-0.01, -0.0022, 0);
  qd.add(qdTruss);
  addQdBellows(qd, mats);
}

function addQdHead(qd: THREE.Group, mats: TowerMats): void {
  const qdHead = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.0055, 0.0055), mats.steelDark);
  qdHead.position.set(-0.024, 0, 0);
  qd.add(qdHead);
  const qdFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.0012, 0.004, 0.004),
    new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.5, roughness: 0.55 }),
  );
  qdFace.position.set(-0.027, 0, 0);
  qd.add(qdFace);
}

function addOlm(g: THREE.Group, mats: TowerMats): void {
  const olmMat = new THREE.MeshStandardMaterial({
    color: 0x4a4844, metalness: 0.62, roughness: 0.55, side: THREE.DoubleSide,
  });
  // Open-ended ring (real OLM is a table with a hole) so trench cam sees Raptors.
  const olm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.004, 20, 1, true), olmMat);
  olm.position.set(0, TOWER_OY0 + 0.002, 0);
  olm.name = "pad-olm";
  g.add(olm);
  addOlmTopAndLegs(g, mats);
}

function addOlmTop(g: THREE.Group): void {
  const olmTop = new THREE.Mesh(
    new THREE.RingGeometry(0.006, 0.0115, 24, 1),
    new THREE.MeshStandardMaterial({ color: 0x2a2824, metalness: 0.4, roughness: 0.75, map: makeScorchTexture() }),
  );
  olmTop.rotation.x = -Math.PI / 2;
  olmTop.position.set(0, TOWER_OY0 + 0.0042, 0);
  g.add(olmTop);
}

function addOlmLegs(g: THREE.Group, mats: TowerMats): void {
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.008, 0.0025), mats.accent);
    leg.position.set(Math.cos(ang) * 0.011, TOWER_OY0 + 0.004, Math.sin(ang) * 0.011);
    g.add(leg);
  }
}

function addOlmTopAndLegs(g: THREE.Group, mats: TowerMats): void {
  addOlmTop(g);
  addOlmLegs(g, mats);
}

function addTowerUpper(g: THREE.Group, mats: TowerMats): void {
  addTowerColumns(g, mats);
  addTowerRings(g, mats);
  addTowerBracing(g, TOWER_OX, TOWER_OY0, TOWER_H, TOWER_FACE, TOWER_COL, 12, mats.accent);
  addTowerRailAndPeak(g, mats);
}

function addTowerArmsAndOlm(g: THREE.Group, mats: TowerMats): void {
  const carryY = TOWER_OY0 + 0.078;
  addChopstickCarriage(g, mats, carryY);
  addChopsticks(g, mats, carryY);
  addQdArm(g, mats);
  addOlm(g, mats);
}

export function createMechazillaTower(): THREE.Group {
  const g = new THREE.Group();
  g.name = "mechazilla";
  const mats = makeTowerMats();
  addTowerUpper(g, mats);
  addTowerArmsAndOlm(g, mats);
  return g;
}

/**
 * Diagonal X-brace panels on Mechazilla faces.
 * Places braces every other ring bay to avoid an over-dense lattice from LEO.
 */
function addBracePairX(
  g: THREE.Group, ox: number, half: number, midY: number, len: number, tilt: number, col: number, mat: THREE.Material,
): void {
  for (const flip of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(col * 0.35, len, col * 0.35), mat);
    b.position.set(ox - half, midY, 0);
    b.rotation.x = flip * tilt;
    g.add(b);
  }
}

function addBracePairZ(
  g: THREE.Group, ox: number, half: number, midY: number, len: number, tilt: number, col: number, mat: THREE.Material,
): void {
  for (const z of [-half, half]) {
    for (const flip of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(col * 0.35, len, col * 0.35), mat);
      b.position.set(ox, midY, z);
      b.rotation.z = flip * tilt;
      g.add(b);
    }
  }
}

function addBraceBay(
  g: THREE.Group, ox: number, half: number, y0: number, h: number, face: number,
  col: number, nRings: number, i: number, mat: THREE.Material,
): void {
  const ya = y0 + ((i + 0.12) / nRings) * h * 0.96;
  const yb = y0 + ((i + 0.88) / nRings) * h * 0.96;
  const midY = (ya + yb) * 0.5;
  const len = Math.hypot(face, yb - ya);
  const tilt = Math.atan2(face, yb - ya);
  addBracePairX(g, ox, half, midY, len, tilt, col, mat);
  addBracePairZ(g, ox, half, midY, len, tilt, col, mat);
}

function addTowerBracing(
  g: THREE.Group, ox: number, y0: number, h: number, face: number, col: number, nRings: number, mat: THREE.Material,
): void {
  const half = face * 0.5;
  for (let i = 0; i < nRings - 1; i += 1) {
    if (i % 2 === 0) addBraceBay(g, ox, half, y0, h, face, col, nRings, i, mat);
  }
}

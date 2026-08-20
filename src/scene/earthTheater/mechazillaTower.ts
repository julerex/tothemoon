/** Mechazilla tower, OLM, chopsticks; recovery pose updates. */
import * as THREE from "three";
import { addChopstickCarriage } from "./mechazillaChopsticks";
export {
  CHOPSTICK_LEN_M, OLT_HEIGHT_M, OLT_TRUSS_M, TOWER_BEACON_Y, TOWER_H, TOWER_OX,
  CHOPSTICK_REST_M, CHOPSTICK_CATCH_M, CHOPSTICK_CATCH_DROP_KM,
} from "./mechazillaDims";
import {
  BOOST_QD_Y, SHIP_QD_Y, TOWER_BEACON_Y, TOWER_COL, TOWER_FACE, TOWER_H,
  TOWER_OX, TOWER_OY0,
} from "./mechazillaDims";
import { makeTowerMats, type TowerMats } from "./mechazillaMats";
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

function addTowerRings(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const nRings = 14;
  for (let i = 1; i <= nRings; i++) {
    addTowerRingBeamsZ(g, mats, TOWER_OY0 + (i / nRings) * TOWER_H * 0.96, half);
    addTowerRingBeamsX(g, mats, TOWER_OY0 + (i / nRings) * TOWER_H * 0.96, half);
  }
}

function addTowerRail(g: THREE.Group, mats: TowerMats, half: number): void {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(TOWER_COL * 1.35, TOWER_H * 0.94, TOWER_COL * 2.4), mats.steelBright);
  rail.position.set(TOWER_OX - half - TOWER_COL * 0.45, TOWER_OY0 + TOWER_H * 0.48, 0);
  g.add(rail);
}

function addTowerPeakAndSheave(g: THREE.Group, mats: TowerMats, half: number): void {
  const peakH = 0.008;
  const peak = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_FACE * 1.15, peakH, TOWER_FACE * 1.15),
    mats.steelBright,
  );
  peak.position.set(TOWER_OX, TOWER_OY0 + TOWER_H + peakH * 0.5, 0);
  g.add(peak);
  const sheave = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, TOWER_FACE * 0.7, 10), mats.steelDark);
  sheave.rotation.z = Math.PI / 2;
  sheave.position.set(TOWER_OX - half * 0.3, TOWER_OY0 + TOWER_H + peakH + 0.002, 0);
  g.add(sheave);
  const rodH = TOWER_BEACON_Y - TOWER_H - peakH;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.00035, 0.00025, rodH, 6), mats.steelDark);
  rod.position.set(TOWER_OX, TOWER_OY0 + TOWER_H + peakH + rodH * 0.5, 0);
  g.add(rod);
}

function addTowerRailAndPeak(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  addTowerRail(g, mats, half);
  addTowerPeakAndSheave(g, mats, half);
}

function addQdArm(g: THREE.Group, mats: TowerMats, y: number, name: string, boomLen: number): void {
  const half = TOWER_FACE * 0.5;
  const qd = new THREE.Group();
  qd.name = name;
  addQdBoom(qd, mats, boomLen);
  addQdHead(qd, mats, boomLen);
  qd.position.set(TOWER_OX - half, TOWER_OY0 + y, name === "pad-qd-arm" ? 0.004 : -0.003);
  qd.rotation.z = 0.08;
  g.add(qd);
}

function addQdBellows(qd: THREE.Group, mats: TowerMats, boomLen: number): void {
  for (let i = 0; i < 4; i++) {
    const bellow = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0016, 0.0018, 8), mats.steelDark);
    bellow.rotation.z = Math.PI / 2;
    bellow.position.set(-boomLen * 0.82 - i * 0.0016, -0.001, 0);
    qd.add(bellow);
  }
}

function addQdBoom(qd: THREE.Group, mats: TowerMats, boomLen: number): void {
  const qdBoom = new THREE.Mesh(new THREE.BoxGeometry(boomLen, 0.0028, 0.0028), mats.steelBright);
  qdBoom.position.set(-boomLen * 0.5, 0, 0);
  qd.add(qdBoom);
  const qdTruss = new THREE.Mesh(new THREE.BoxGeometry(boomLen * 0.82, 0.0012, 0.0012), mats.accent);
  qdTruss.position.set(-boomLen * 0.45, -0.0024, 0);
  qd.add(qdTruss);
  addQdBellows(qd, mats, boomLen);
}

function addQdHead(qd: THREE.Group, mats: TowerMats, boomLen: number): void {
  const qdHead = new THREE.Mesh(new THREE.BoxGeometry(0.0055, 0.006, 0.006), mats.steelDark);
  qdHead.position.set(-boomLen, 0, 0);
  qd.add(qdHead);
  const qdFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.0012, 0.0044, 0.0044),
    new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.5, roughness: 0.55 }),
  );
  qdFace.position.set(-boomLen - 0.003, 0, 0);
  qd.add(qdFace);
}

function addOlm(g: THREE.Group, mats: TowerMats): void {
  const olmMat = new THREE.MeshStandardMaterial({
    color: 0x4a4844, metalness: 0.62, roughness: 0.55, side: THREE.DoubleSide,
  });
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
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.0028, 0.009, 0.0028), mats.accent);
    leg.position.set(Math.cos(ang) * 0.011, TOWER_OY0 + 0.0045, Math.sin(ang) * 0.011);
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
  addTowerBracing(g, TOWER_OX, TOWER_OY0, TOWER_H, TOWER_FACE, TOWER_COL, 14, mats.accent);
  addTowerRailAndPeak(g, mats);
}

function addTowerArmsAndOlm(g: THREE.Group, mats: TowerMats): void {
  addChopstickCarriage(g, mats);
  addQdArm(g, mats, SHIP_QD_Y, "pad-qd-arm", 0.022);
  addQdArm(g, mats, BOOST_QD_Y, "pad-boost-qd-arm", 0.02);
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

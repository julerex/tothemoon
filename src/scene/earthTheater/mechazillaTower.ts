/** Mechazilla tower, OLM, chopsticks; recovery pose updates. */
import * as THREE from "three";
import { addChopstickCarriage } from "./mechazillaChopsticks";
export {
  CHOPSTICK_LEN_M, OLT_HEIGHT_M, OLT_TRUSS_M, TOWER_BEACON_Y, TOWER_H, TOWER_OX,
  CHOPSTICK_REST_M, CHOPSTICK_CATCH_M, CHOPSTICK_CATCH_DROP_KM,
} from "./mechazillaDims";
import {
  BOOST_QD_Y, SHIP_QD_Y, TOWER_FACE, TOWER_OX, TOWER_OY0,
} from "./mechazillaDims";
import { makeTowerMats, type TowerMats } from "./mechazillaMats";
import { addMechazillaTruss } from "./mechazillaTruss";
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
  addMechazillaTruss(g, mats);
  addTowerArmsAndOlm(g, mats);
  return g;
}

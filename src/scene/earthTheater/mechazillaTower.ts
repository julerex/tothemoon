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
  addQdHoseBundle(qd, mats, boomLen);
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

/** Hose bundle + interface plate at the vehicle face (V23.4). */
function addQdHoseBundle(qd: THREE.Group, mats: TowerMats, boomLen: number): void {
  const hoseGeo = new THREE.CylinderGeometry(0.00035, 0.0004, boomLen * 0.55, 6);
  for (let i = 0; i < 5; i++) {
    const hose = new THREE.Mesh(hoseGeo, i % 2 === 0 ? mats.steelDark : mats.accent);
    hose.rotation.z = Math.PI / 2;
    const oy = ((i % 3) - 1) * 0.0011;
    const oz = (Math.floor(i / 3) - 0.5) * 0.0014;
    hose.position.set(-boomLen * 0.55, oy - 0.0028, oz);
    qd.add(hose);
  }
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
  // Interface plate toward the vehicle.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.0008, 0.0055, 0.0055),
    mats.steelBright,
  );
  plate.position.set(-boomLen - 0.0042, 0, 0);
  qd.add(plate);
}

function addOlm(g: THREE.Group, mats: TowerMats): void {
  const olmMat = new THREE.MeshStandardMaterial({
    color: 0x4a4844, metalness: 0.62, roughness: 0.55, side: THREE.DoubleSide,
  });
  // Taller / thicker mount shell (V23.3) — raised OLM silhouette from aerial.
  const olm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0115, 0.0145, 0.0075, 24, 1, true),
    olmMat,
  );
  olm.position.set(0, TOWER_OY0 + 0.0035, 0);
  olm.name = "pad-olm";
  g.add(olm);
  addOlmTopAndLegs(g, mats);
  addOlmDeflector(g, mats);
}

function addOlmTop(g: THREE.Group): void {
  const olmTop = new THREE.Mesh(
    new THREE.RingGeometry(0.0055, 0.0118, 28, 1),
    new THREE.MeshStandardMaterial({ color: 0x2a2824, metalness: 0.4, roughness: 0.75, map: makeScorchTexture() }),
  );
  olmTop.rotation.x = -Math.PI / 2;
  olmTop.position.set(0, TOWER_OY0 + 0.0074, 0);
  g.add(olmTop);
}

function addOlmLegs(g: THREE.Group, mats: TowerMats): void {
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.011, 0.0026), mats.accent);
    leg.position.set(Math.cos(ang) * 0.012, TOWER_OY0 + 0.0055, Math.sin(ang) * 0.012);
    g.add(leg);
  }
}

/** Faceted flame-deflector wedges under the OLM ring (theater silhouette). */
function addOlmDeflector(g: THREE.Group, mats: TowerMats): void {
  const deflector = new THREE.Group();
  deflector.name = "pad-olm-deflector";
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const wedge = new THREE.Mesh(
      new THREE.BoxGeometry(0.0045, 0.0035, 0.007),
      mats.steelDark,
    );
    wedge.position.set(Math.cos(ang) * 0.0065, TOWER_OY0 + 0.0012, Math.sin(ang) * 0.0065);
    wedge.rotation.y = -ang;
    wedge.rotation.x = 0.35;
    deflector.add(wedge);
  }
  g.add(deflector);
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

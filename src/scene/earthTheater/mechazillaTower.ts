/** Mechazilla tower, OLM, chopsticks; recovery pose updates. */
import * as THREE from "three";
import { addChopstickCarriage } from "./mechazillaChopsticks";
import { addQdArm } from "./mechazillaQd";
export {
  CHOPSTICK_LEN_M, OLT_HEIGHT_M, OLT_TRUSS_M, TOWER_BEACON_Y, TOWER_H, TOWER_OX,
  TOWER_OZ, TOWER_YAW_RAD,
  CHOPSTICK_REST_M, CHOPSTICK_CATCH_M, CHOPSTICK_CATCH_DROP_KM,
  PAD1_X_KM, PAD1_Z_KM, PAD1_TOWER_DX_KM, PAD1_TOWER_DZ_KM,
} from "./mechazillaDims";
import {
  BOOST_QD_Y, SHIP_QD_Y, TOWER_OX, TOWER_OZ, TOWER_YAW_RAD,
} from "./mechazillaDims";
import { makeTowerMats, type TowerMats } from "./mechazillaMats";
import { addMechazillaBase } from "./mechazillaBase";
import { addMechazillaTruss } from "./mechazillaTruss";
import { addOlm } from "./padOlm";

export type MechazillaBuildOpts = {
  /** False for OLP-1 at Flight 13 (mount pulled for V3 rebuild). Default true. */
  includeOlm?: boolean;
  /**
   * `olp2` (default) seats and yaws the truss on the surveyed Pad 2 pin.
   * `local` keeps the truss at the group origin facing −X (Pad 1 shifts it).
   */
  frame?: "olp2" | "local";
};

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

function addTowerArms(g: THREE.Group, mats: TowerMats): void {
  addChopstickCarriage(g, mats);
  addQdArm(g, mats, SHIP_QD_Y, "pad-qd-arm", 0.022);
  addQdArm(g, mats, BOOST_QD_Y, "pad-boost-qd-arm", 0.02);
}

export function createMechazillaTower(opts: MechazillaBuildOpts = {}): THREE.Group {
  const g = new THREE.Group();
  g.name = "mechazilla";
  const mats = makeTowerMats();
  g.userData.worklightMat = mats.lamp;
  const parts = new THREE.Group();
  addMechazillaTruss(parts, mats);
  addMechazillaBase(parts, mats);
  addTowerArms(parts, mats);
  // Authored with the truss centre at x = TOWER_OX, z = 0; recenter to origin.
  parts.position.set(-TOWER_OX, 0, 0);
  const tower = new THREE.Group();
  tower.name = "pad-tower";
  tower.add(parts);
  if (opts.frame !== "local") {
    tower.position.set(TOWER_OX, 0, TOWER_OZ);
    tower.rotation.y = TOWER_YAW_RAD;
  }
  g.add(tower);
  if (opts.includeOlm !== false) addOlm(g, mats);
  return g;
}

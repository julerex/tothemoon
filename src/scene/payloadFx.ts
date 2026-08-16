/**
 * Flight 13 Pez door + Starlink V3 silhouette theater FX.
 *
 * Scrub-deterministic via {@link payloadDeployStrength} / hatch / sat poses.
 * Parent under the craft group so sats share ship attitude; peel offsets are
 * craft-local (same suborbital path — no extra integrator).
 */

import * as THREE from "three";
import {
  PAYLOAD_SAT_COUNT,
  payloadDeployStrength,
  payloadHatchOpen,
  payloadSatPose,
} from "./payloadDeploy";

const HATCH_PIVOT = "pez-hatch";
const SAT_GROUP = "payload-sats";

function makeHatchMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xc8c4bc,
    metalness: 0.75,
    roughness: 0.35,
  });
}

function makeSatMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xb0bcc8,
    metalness: 0.4,
    roughness: 0.55,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
}

/** Pez door on the leeward mid-barrel (stainless side). */
function addPezHatch(ship: THREE.Object3D): THREE.Group | null {
  const pivot = new THREE.Group();
  pivot.name = HATCH_PIVOT;
  // Leeward (−Y), mid barrel — readable from chase / hull-cam.
  pivot.position.set(0, -0.118, 0.58);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.01, 0.14),
    makeHatchMat(),
  );
  door.name = "pez-door";
  door.position.set(0, -0.005, 0.07);
  pivot.add(door);
  // Thin bay lip so the open hole reads against tiles.
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(0.095, 0.008, 0.02),
    makeHatchMat(),
  );
  lip.position.set(0, -0.004, -0.01);
  pivot.add(lip);
  ship.add(pivot);
  return pivot;
}

function addSatSilhouettes(group: THREE.Group): THREE.Mesh[] {
  const sats: THREE.Mesh[] = [];
  const geom = new THREE.BoxGeometry(0.028, 0.006, 0.04);
  const mat = makeSatMat();
  for (let i = 0; i < PAYLOAD_SAT_COUNT; i++) {
    const mesh = new THREE.Mesh(geom, mat.clone());
    mesh.name = `starlink-v3-${i}`;
    mesh.visible = false;
    group.add(mesh);
    sats.push(mesh);
  }
  return sats;
}

export type PayloadFx = Readonly<{
  group: THREE.Group;
  update: (missionT: number) => void;
}>;

/**
 * Build Pez hatch on the ship + sat silhouettes under `craft`.
 * Safe no-op (empty group) if the ship mesh is missing.
 */
export function createPayloadFx(craft: THREE.Object3D): PayloadFx {
  const group = new THREE.Group();
  group.name = "payload-fx";
  const ship = craft.getObjectByName("ship");
  const hatch = ship ? addPezHatch(ship) : null;
  const satGroup = new THREE.Group();
  satGroup.name = SAT_GROUP;
  // Bay origin in craft/ship-stacked frame; sats peel from here.
  satGroup.position.set(0, -0.12, 0.58);
  if (ship) ship.add(satGroup);
  else group.add(satGroup);
  const sats = addSatSilhouettes(satGroup);
  craft.add(group);

  return Object.freeze({
    group,
    update(missionT: number) {
      const strength = payloadDeployStrength(missionT);
      const open = payloadHatchOpen(missionT);
      if (hatch) {
        hatch.visible = strength > 0.02 || open > 0.02;
        // Hinge open about +X (door swings leeward / out).
        hatch.rotation.x = open * 1.35;
      }
      satGroup.visible = strength > 0.02;
      for (let i = 0; i < sats.length; i++) {
        const pose = payloadSatPose(i, missionT);
        const mesh = sats[i]!;
        mesh.visible = pose.visible;
        if (!pose.visible) continue;
        mesh.position.set(pose.x, pose.y, pose.z);
        mesh.scale.setScalar(pose.scale / 0.035);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = pose.opacity;
      }
    },
  });
}

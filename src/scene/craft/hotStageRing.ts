/**
 * Super Heavy V3 integrated hot-stage truss (theater-grade).
 *
 * SpaceX’s 2025 “integrated hot-stage for full and rapid reuse” render is an
 * open N1-style A-frame of stainless tubes on the methane forward dome — not
 * the Block 1/2 jettisonable vented cylinder. Bays are {@link HOT_STAGE_BAYS}.
 *
 * @see docs/STARSHIP.md — Hot-staging
 */

import * as THREE from "three";
import {
  BOOST_H,
  HOT_STAGE_BAYS,
  HOT_STAGE_H,
  R,
} from "./dimensions";
import { makeBarrelRing } from "./meshShared";

export type HotStageMats = {
  strut: THREE.Material;
  ring: THREE.Material;
  dome: THREE.Material;
};

export type HotStageNode = { x: number; y: number; z: number };

/** Half-bay fraction so adjacent A-frames keep a visible gap. */
const AFRAME_HALF = 0.38;
const STRUT_R = 0.0038;
const Y_UP = new THREE.Vector3(0, 1, 0);

/**
 * One downward A-frame on the 9 m barrel (two diagonals + implicit top ring).
 *
 * @param i - Bay index; wraps modulo {@link HOT_STAGE_BAYS}
 */
export function hotStageAFrame(
  i: number,
  n = HOT_STAGE_BAYS,
): { topL: HotStageNode; topR: HotStageNode; bot: HotStageNode } {
  const tau = Math.PI * 2;
  const mid = ((((i % n) + n) % n) / n) * tau;
  const half = (tau / n) * AFRAME_HALF;
  const r = R * 1.012;
  const zTop = BOOST_H;
  const zBot = BOOST_H - HOT_STAGE_H;
  const at = (ang: number, z: number): HotStageNode => ({
    x: Math.cos(ang) * r,
    y: Math.sin(ang) * r,
    z,
  });
  return {
    topL: at(mid - half, zTop),
    topR: at(mid + half, zTop),
    bot: at(mid, zBot),
  };
}

/** Open triangular hot-stage truss at the ship / booster join. */
export function addHotStageRing(host: THREE.Group, mats: HotStageMats): void {
  const g = new THREE.Group();
  g.name = "hot-stage-ring";
  addHoops(g, mats.ring);
  addDome(g, mats.dome);
  addStruts(g, mats.strut);
  host.add(g);
}

function addHoops(g: THREE.Group, mat: THREE.Material): void {
  const top = makeBarrelRing(R * 1.02, 0.0042, BOOST_H, mat);
  top.name = "hot-stage-top-ring";
  g.add(top);
  g.add(makeBarrelRing(R * 1.016, 0.0032, BOOST_H - HOT_STAGE_H, mat));
}

function addDome(g: THREE.Group, mat: THREE.Material): void {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.96, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    mat,
  );
  dome.name = "hot-stage-dome";
  dome.rotation.x = -Math.PI / 2;
  dome.scale.z = 0.32;
  dome.position.z = BOOST_H - HOT_STAGE_H;
  g.add(dome);
}

function addStruts(g: THREE.Group, mat: THREE.Material): void {
  const dummy = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(STRUT_R, STRUT_R, 1, 6),
    mat,
    HOT_STAGE_BAYS * 2,
  );
  mesh.name = "hot-stage-struts";
  mesh.frustumCulled = false;
  let i = 0;
  for (let bay = 0; bay < HOT_STAGE_BAYS; bay++) {
    const { topL, topR, bot } = hotStageAFrame(bay);
    poseBetween(dummy, topL, bot);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    i += 1;
    poseBetween(dummy, topR, bot);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    i += 1;
  }
  mesh.instanceMatrix.needsUpdate = true;
  g.add(mesh);
}

function poseBetween(dummy: THREE.Object3D, a: HotStageNode, b: HotStageNode): void {
  const start = new THREE.Vector3(a.x, a.y, a.z);
  const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = dir.length();
  dummy.position.copy(start).addScaledVector(dir, 0.5);
  dummy.quaternion.setFromUnitVectors(Y_UP, dir.normalize());
  dummy.scale.set(1, len, 1);
}

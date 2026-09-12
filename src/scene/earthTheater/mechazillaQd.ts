/**
 * Ship / booster QD arms — lattice boom + wrap-around clamp (V27).
 * Node names `pad-qd-arm` / `pad-boost-qd-arm` stay put for shadows + recovery.
 */
import * as THREE from "three";
import { TOWER_FACE, TOWER_OX, TOWER_OY0 } from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";
import { addWorklight } from "./mechazillaWorklights";

const QD_BAYS = 5;

export function addQdArm(
  g: THREE.Group, mats: TowerMats, y: number, name: string, boomLen: number,
): void {
  const half = TOWER_FACE * 0.5;
  const qd = new THREE.Group();
  qd.name = name;
  addQdBoom(qd, mats, boomLen);
  addQdHoseBundle(qd, mats, boomLen);
  addQdHead(qd, mats, boomLen);
  addQdClamp(qd, mats, boomLen);
  addQdWalkway(qd, mats, boomLen);
  addWorklight(qd, mats, -boomLen * 0.35, 0.0028, 0.0012);
  addWorklight(qd, mats, -boomLen * 0.75, 0.0028, -0.0012);
  qd.position.set(TOWER_OX - half, TOWER_OY0 + y, name === "pad-qd-arm" ? 0.004 : -0.003);
  qd.rotation.z = 0.08;
  g.add(qd);
}

function addQdBoom(qd: THREE.Group, mats: TowerMats, boomLen: number): void {
  const h = 0.0034;
  const w = 0.0032;
  for (const y of [h * 0.4, -h * 0.4]) {
    for (const z of [w * 0.35, -w * 0.35]) {
      const chord = new THREE.Mesh(
        new THREE.BoxGeometry(boomLen * 0.96, 0.00055, 0.00055),
        y > 0 ? mats.steelBright : mats.steelDark,
      );
      chord.position.set(-boomLen * 0.48, y, z);
      qd.add(chord);
    }
  }
  const bay = boomLen / QD_BAYS;
  for (let i = 0; i < QD_BAYS; i++) {
    const x = -boomLen * ((i + 0.5) / QD_BAYS);
    const vert = new THREE.Mesh(new THREE.BoxGeometry(0.0007, h * 0.95, w * 0.22), mats.steelDark);
    vert.position.set(x, 0, 0);
    qd.add(vert);
    if (i >= QD_BAYS - 1) continue;
    const diag = new THREE.Mesh(new THREE.BoxGeometry(bay * 0.82, 0.00045, 0.00045), mats.accent);
    diag.position.set(x - bay * 0.5, 0, w * 0.3);
    diag.rotation.z = 0.55;
    qd.add(diag);
    const diag2 = diag.clone();
    diag2.rotation.z = -0.55;
    diag2.position.z = -w * 0.3;
    qd.add(diag2);
  }
  addQdBellows(qd, mats, boomLen);
}

function addQdBellows(qd: THREE.Group, mats: TowerMats, boomLen: number): void {
  for (let i = 0; i < 4; i++) {
    const bellow = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0016, 0.0018, 8), mats.steelDark);
    bellow.rotation.z = Math.PI / 2;
    bellow.position.set(-boomLen * 0.82 - i * 0.0016, -0.001, 0);
    qd.add(bellow);
  }
}

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
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.0008, 0.0055, 0.0055),
    mats.steelBright,
  );
  plate.position.set(-boomLen - 0.0042, 0, 0);
  qd.add(plate);
}

function addQdClamp(qd: THREE.Group, mats: TowerMats, boomLen: number): void {
  const clamp = new THREE.Group();
  clamp.name = "pad-qd-clamp";
  const jawZ = 0.0054;
  const wrap = 0.0048;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.0024, 0.0036, jawZ * 2.2), mats.steel);
  bar.position.set(-boomLen, 0.0004, 0);
  clamp.add(bar);
  for (const side of [-1, 1] as const) {
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(wrap, 0.0026, 0.002), mats.steelDark);
    jaw.position.set(-boomLen - wrap * 0.42, -0.0003, side * jawZ);
    clamp.add(jaw);
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.0018, 0.0038, 0.0016), mats.steelBright);
    finger.position.set(-boomLen - wrap * 0.88, 0, side * jawZ * 0.7);
    clamp.add(finger);
  }
  qd.add(clamp);
}

function addQdWalkway(qd: THREE.Group, mats: TowerMats, boomLen: number): void {
  const walk = new THREE.Mesh(
    new THREE.BoxGeometry(boomLen * 0.88, 0.00022, 0.0034),
    mats.steelDark,
  );
  walk.name = "pad-qd-walkway";
  walk.position.set(-boomLen * 0.46, 0.0024, 0);
  qd.add(walk);
  const railGeo = new THREE.BoxGeometry(boomLen * 0.82, 0.00016, 0.00016);
  for (const z of [-0.0016, 0.0016]) {
    const rail = new THREE.Mesh(railGeo, mats.steelBright);
    rail.position.set(-boomLen * 0.46, 0.0036, z);
    qd.add(rail);
  }
}

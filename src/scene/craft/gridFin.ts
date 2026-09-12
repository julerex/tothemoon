/**
 * Super Heavy V3 grid fin (theater-grade).
 *
 * SpaceX 2025 factory stills show a deep diamond (chevron) lattice, not a
 * square waffle, with catch-pin hardware at the root. On the pad the lattice
 * plane is perpendicular to the booster axis (horizontal shelf).
 *
 * @see docs/STARSHIP.md — Grid fins and catch (V3)
 */

import * as THREE from "three";
import {
  GRID_FIN_LATTICE_ANGLE,
  GRID_FIN_LATTICE_N,
  GRID_FIN_LAUNCH_TILT,
  U,
} from "./dimensions";

export type GridFinMats = {
  frame: THREE.Material;
  lattice: THREE.Material;
  pivot: THREE.Material;
  housing: THREE.Material;
};

/**
 * Seat a fin on the booster at launch attitude: radial azimuth `ang`,
 * lattice plane horizontal (⊥ booster +Z).
 */
export function setGridFinLaunchPose(
  fin: THREE.Group,
  ang: number,
  attachR: number,
  finZ: number,
): void {
  fin.position.set(Math.cos(ang) * attachR, Math.sin(ang) * attachR, finZ);
  fin.rotation.set(GRID_FIN_LAUNCH_TILT, 0, ang);
}

/** Super Heavy grid fin with dark outer frame + diamond lattice. */
export function makeGridFin(
  finH: number,
  finW: number,
  finT: number,
  mats: GridFinMats,
): THREE.Group {
  const fin = new THREE.Group();
  fin.name = "grid-fin";
  addGridFinFrame(fin, finH, finW, finT, mats.frame);
  addGridFinLattice(fin, finH, finW, finT, mats.lattice);
  addGridFinPivot(fin, finH, mats.pivot);
  addGridFinActuator(fin, finH, finW, mats);
  return fin;
}

function addFrameBarsZ(
  fin: THREE.Group,
  finH: number,
  finW: number,
  frameT: number,
  frameBar: number,
  mat: THREE.Material,
): void {
  for (const z of [-finW * 0.5, finW * 0.5]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(finH * 1.02, frameT, frameBar), mat);
    bar.position.z = z;
    fin.add(bar);
  }
}

function addFrameBarsX(
  fin: THREE.Group,
  finH: number,
  finW: number,
  frameT: number,
  frameBar: number,
  mat: THREE.Material,
): void {
  for (const x of [-finH * 0.5, finH * 0.5]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(frameBar, frameT, finW * 1.02), mat);
    bar.position.x = x;
    fin.add(bar);
  }
}

function addGridFinFrame(
  fin: THREE.Group,
  finH: number,
  finW: number,
  finT: number,
  mat: THREE.Material,
): void {
  const frameT = Math.min(finT * 0.42, 0.38 * U);
  const frameBar = 0.28 * U;
  addFrameBarsZ(fin, finH, finW, frameT, frameBar, mat);
  addFrameBarsX(fin, finH, finW, frameT, frameBar, mat);
}

function addGridFinLattice(
  fin: THREE.Group,
  finH: number,
  finW: number,
  finT: number,
  mat: THREE.Material,
): void {
  const nLat = GRID_FIN_LATTICE_N;
  const barDeep = finT * 0.92;
  const barThick = finT * 0.42;
  for (const sign of [1, -1] as const) {
    const angle = sign * GRID_FIN_LATTICE_ANGLE;
    for (let i = 0; i < nLat; i++) {
      const t = (i + 0.5) / nLat - 0.5;
      addDiamondBar(fin, finH, finW, barDeep, barThick, mat, angle, t);
    }
  }
}

function addDiamondBar(
  fin: THREE.Group,
  finH: number,
  finW: number,
  barDeep: number,
  barThick: number,
  mat: THREE.Material,
  angle: number,
  t: number,
): void {
  const off = t * (finH + finW) * 0.38;
  const len = Math.max(finH * 0.22, Math.hypot(finH, finW) * 0.62 - Math.abs(off) * 1.15);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(len, barDeep, barThick), mat);
  bar.name = "grid-fin-lattice";
  bar.rotation.y = angle;
  bar.position.x = off * Math.cos(angle + Math.PI / 2);
  bar.position.z = off * Math.sin(angle + Math.PI / 2);
  fin.add(bar);
}

function addGridFinPivot(fin: THREE.Group, finH: number, mat: THREE.Material): void {
  const pivot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.016, 0.048, 10),
    mat,
  );
  pivot.rotation.z = Math.PI / 2;
  pivot.position.x = -finH * 0.45;
  fin.add(pivot);
}

/** Hydraulic ram, bright root housing, and catch pin (T+5:14 still). */
function addGridFinActuator(
  fin: THREE.Group,
  finH: number,
  finW: number,
  mats: GridFinMats,
): void {
  const ram = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * U, 0.20 * U, finH * 0.28, 8),
    mats.pivot,
  );
  ram.name = "grid-fin-ram";
  ram.rotation.z = Math.PI / 2;
  ram.position.x = -finH * 0.38;
  fin.add(ram);
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(finH * 0.16, 0.55 * U, finW * 0.22),
    mats.housing,
  );
  housing.name = "grid-fin-housing";
  housing.position.set(-finH * 0.42, 0, 0);
  fin.add(housing);
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * U, 0.22 * U, finW * 0.28, 8),
    mats.housing,
  );
  pin.name = "grid-fin-pin";
  pin.position.set(-finH * 0.36, 0.35 * U, 0);
  fin.add(pin);
}

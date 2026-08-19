/**
 * Super Heavy V3 grid fin (theater-grade).
 *
 * Flight 13 hull stills (T+5:14) show a long lattice paddle, a bright
 * actuator housing at the root, and catch-pin hardware integrated with
 * the fin — not a bare box. Lattice density is {@link GRID_FIN_LATTICE_N}.
 *
 * @see docs/VISUAL_REALISM.md — V4 / V22
 */

import * as THREE from "three";
import { GRID_FIN_LATTICE_N } from "./dimensions";

export type GridFinMats = {
  frame: THREE.Material;
  lattice: THREE.Material;
  plate: THREE.Material;
  pivot: THREE.Material;
  housing: THREE.Material;
};

/** Super Heavy grid fin with dark outer frame + denser lattice (V4 / V22). */
export function makeGridFin(
  finH: number,
  finW: number,
  finT: number,
  mats: GridFinMats,
): THREE.Group {
  const fin = new THREE.Group();
  fin.name = "grid-fin";
  addGridFinPlate(fin, finH, finW, finT, mats.plate);
  addGridFinFrame(fin, finH, finW, finT, mats.frame);
  addGridFinLattice(fin, finH, finW, finT, mats.lattice);
  addGridFinPivot(fin, finH, mats.pivot);
  addGridFinActuator(fin, finH, finW, finT, mats);
  return fin;
}

function addGridFinPlate(
  fin: THREE.Group,
  finH: number,
  finW: number,
  finT: number,
  mat: THREE.Material,
): void {
  fin.add(new THREE.Mesh(
    new THREE.BoxGeometry(finH * 0.96, finT * 0.55, finW * 0.96),
    mat,
  ));
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
  const frameT = finT * 1.55;
  const frameBar = finT * 1.35;
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
  for (let i = 0; i < nLat; i++) {
    const t = (i + 0.5) / nLat - 0.5;
    addLatticeCross(fin, finH, finW, finT, mat, t);
  }
}

function addLatticeCross(
  fin: THREE.Group,
  finH: number,
  finW: number,
  finT: number,
  mat: THREE.Material,
  t: number,
): void {
  const zBar = new THREE.Mesh(new THREE.BoxGeometry(finH * 0.9, finT * 0.95, finT * 0.72), mat);
  zBar.position.z = t * finW * 0.88;
  fin.add(zBar);
  const xBar = new THREE.Mesh(new THREE.BoxGeometry(finT * 0.72, finT * 0.95, finW * 0.9), mat);
  xBar.position.x = t * finH * 0.88;
  fin.add(xBar);
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
  finT: number,
  mats: GridFinMats,
): void {
  const ram = new THREE.Mesh(
    new THREE.CylinderGeometry(finT * 0.55, finT * 0.62, finH * 0.28, 8),
    mats.pivot,
  );
  ram.name = "grid-fin-ram";
  ram.rotation.z = Math.PI / 2;
  ram.position.x = -finH * 0.38;
  fin.add(ram);
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(finH * 0.16, finT * 2.1, finW * 0.22),
    mats.housing,
  );
  housing.name = "grid-fin-housing";
  housing.position.set(-finH * 0.42, 0, 0);
  fin.add(housing);
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(finT * 0.7, finT * 0.7, finW * 0.28, 8),
    mats.housing,
  );
  pin.name = "grid-fin-pin";
  pin.position.set(-finH * 0.36, finT * 1.15, 0);
  fin.add(pin);
}

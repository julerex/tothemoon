/**
 * Super Heavy V3 grid fin (theater-grade).
 *
 * Sketchfab Super Heavy V3 Y+ occupancy is a hexagonal paddle (narrow root
 * neck, parallel mid-face, chamfered tip) with a diamond lattice. SpaceX
 * 2025 factory stills keep the deep 3D honeycomb and catch-pin hardware;
 * the download's 0.33 m sheet is not the chord. On the pad the lattice
 * plane is perpendicular to the booster axis (horizontal shelf).
 *
 * @see docs/STARSHIP.md — Grid fins and catch (V3)
 */

import * as THREE from "three";
import {
  GRID_FIN_LATTICE_ANGLE,
  GRID_FIN_LATTICE_N,
  GRID_FIN_LATTICE_WALL_M,
  GRID_FIN_LAUNCH_TILT,
  GRID_FIN_ROOT_TAPER_U,
  GRID_FIN_ROOT_WIDTH_FRAC,
  GRID_FIN_TIP_CHAMFER_U,
  U,
  gridFinHalfWidthFrac,
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

type Xz = readonly [number, number];

/** Octagon in XZ: −X root, +X tip. Matches Sketchfab Y+ width envelope. */
function paddleOutline(finH: number, finW: number): Xz[] {
  const x0 = -finH * 0.5;
  const xs = [
    x0,
    x0 + GRID_FIN_ROOT_TAPER_U * finH,
    x0 + (1 - GRID_FIN_TIP_CHAMFER_U) * finH,
    x0 + finH,
  ];
  const top: Xz[] = xs.map((x) => {
    const u = (x - x0) / finH;
    return [x, gridFinHalfWidthFrac(u) * finW * 0.5];
  });
  const bot: Xz[] = top.map(([x, z]) => [x, -z] as const).reverse();
  return [...top, ...bot];
}

function addFrameEdge(
  fin: THREE.Group,
  a: Xz,
  b: Xz,
  frameT: number,
  frameBar: number,
  mat: THREE.Material,
): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-8) return;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(len, frameT, frameBar), mat);
  bar.name = "grid-fin-frame";
  bar.position.set((a[0] + b[0]) * 0.5, 0, (a[1] + b[1]) * 0.5);
  // local +X → (cos θ, −sin θ) = (dx, dz)/len
  bar.rotation.y = Math.atan2(-dz, dx);
  fin.add(bar);
}

function addGridFinFrame(
  fin: THREE.Group,
  finH: number,
  finW: number,
  finT: number,
  mat: THREE.Material,
): void {
  const frameBar = Math.min(0.22 * U, finW * 0.08);
  const verts = paddleOutline(finH, finW);
  for (let i = 0; i < verts.length; i++) {
    const next = verts[(i + 1) % verts.length]!;
    addFrameEdge(fin, verts[i]!, next, finT, frameBar, mat);
  }
}

function clipBarToPaddle(
  ox: number,
  oz: number,
  dirX: number,
  dirZ: number,
  finH: number,
  finW: number,
): { x: number; z: number; len: number } | null {
  const span = Math.hypot(finH, finW);
  let tMin = Infinity;
  let tMax = -Infinity;
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = -span + (2 * span * i) / steps;
    const x = ox + t * dirX;
    const z = oz + t * dirZ;
    const u = (x + finH * 0.5) / finH;
    if (u < 0.06 || u > 0.94) continue;
    const hw = gridFinHalfWidthFrac(u) * finW * 0.5 * 0.88;
    if (Math.abs(z) <= hw) {
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
    }
  }
  const len = tMax - tMin;
  if (!(len > finH * 0.12)) return null;
  return {
    x: ox + 0.5 * (tMin + tMax) * dirX,
    z: oz + 0.5 * (tMin + tMax) * dirZ,
    len,
  };
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
  const barThick = Math.min(GRID_FIN_LATTICE_WALL_M * U, finT * 0.18);
  for (const sign of [1, -1] as const) {
    const angle = sign * GRID_FIN_LATTICE_ANGLE;
    const dirX = Math.cos(angle);
    const dirZ = -Math.sin(angle);
    for (let i = 0; i < nLat; i++) {
      const t = (i + 0.5) / nLat - 0.5;
      const off = t * (finH + finW) * 0.38;
      const ox = off * Math.cos(angle + Math.PI / 2);
      const oz = off * Math.sin(angle + Math.PI / 2);
      const clipped = clipBarToPaddle(ox, oz, dirX, dirZ, finH, finW);
      if (!clipped) continue;
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(clipped.len, barDeep, barThick),
        mat,
      );
      bar.name = "grid-fin-lattice";
      bar.rotation.y = angle;
      bar.position.set(clipped.x, 0, clipped.z);
      fin.add(bar);
    }
  }
}

function addGridFinPivot(fin: THREE.Group, finH: number, mat: THREE.Material): void {
  const pivot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 0.06, 12),
    mat,
  );
  pivot.rotation.z = Math.PI / 2;
  pivot.position.x = -finH * 0.48;
  fin.add(pivot);
}

/** Hydraulic ram, bright root housing, and catch pin (T+5:11 still). */
function addGridFinActuator(
  fin: THREE.Group,
  finH: number,
  finW: number,
  mats: GridFinMats,
): void {
  const rootW = GRID_FIN_ROOT_WIDTH_FRAC * finW;
  const ram = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * U, 0.2 * U, finH * 0.28, 8),
    mats.pivot,
  );
  ram.name = "grid-fin-ram";
  ram.rotation.z = Math.PI / 2;
  ram.position.x = -finH * 0.38;
  fin.add(ram);
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(
      finH * GRID_FIN_ROOT_TAPER_U * 0.55,
      0.55 * U,
      rootW * 0.95,
    ),
    mats.housing,
  );
  housing.name = "grid-fin-housing";
  housing.position.set(-finH * (0.5 - GRID_FIN_ROOT_TAPER_U * 0.22), 0, 0);
  fin.add(housing);
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * U, 0.22 * U, finW * 0.22, 8),
    mats.housing,
  );
  pin.name = "grid-fin-pin";
  pin.position.set(-finH * 0.36, 0.35 * U, 0);
  fin.add(pin);
}

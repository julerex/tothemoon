import * as THREE from "three";
import {
  GRID_FIN_LATTICE_N,
  R,
  SHIP_OGIVE_BASE_Z,
  SHIP_OGIVE_H,
  SHIP_OGIVE_H_M,
  U,
} from "./dimensions";
import { shipOgiveRadiusM } from "./dimensions";
import type { CraftMats } from "./materials";

function shipOgivePoints(rScale = 1): THREE.Vector2[] {
  const n = 18;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const xFromTipM = (1 - t) * SHIP_OGIVE_H_M;
    const rM = Math.max(shipOgiveRadiusM(xFromTipM), 0.22);
    pts.push(new THREE.Vector2(rM * U * rScale, t * SHIP_OGIVE_H));
  }
  return pts;
}

/** Lathe ogive aligned to craft +Z (tip at +Z). */
export function zOgive(rScale: number, mat: THREE.Material, phiStart = 0, phiLength = Math.PI * 2): THREE.Mesh {
  const geom = new THREE.LatheGeometry(shipOgivePoints(rScale), 28, phiStart, phiLength);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = SHIP_OGIVE_BASE_Z;
  return mesh;
}

/** Cylinder aligned to craft +Z (default Three cylinder is +Y). */
export function zCylinder(
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  z: number,
  rotX = Math.PI / 2,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = rotX;
  mesh.position.z = z;
  return mesh;
}

export type FlapSpec = {
  chord: number;
  span: number;
  thickness: number;
  sweepFwd: number;
  sweepAft: number;
};

/** Trapezoid in XY (x = span from hinge, y = chord); extrude along Z = thickness. */
export function makeFlapGeom(spec: FlapSpec): THREE.ExtrudeGeometry {
  const c = spec.chord / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, -c);
  shape.lineTo(0, c);
  shape.lineTo(spec.span, c - spec.sweepFwd);
  shape.lineTo(spec.span, -c + spec.sweepAft);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: spec.thickness,
    bevelEnabled: false,
    steps: 1,
  });
  geom.translate(0, 0, -spec.thickness / 2);
  return geom;
}

/** Child meshes: local +X = span after rotX so pivot.rotation.x remains the hinge. */
export function addFlapChildren(
  pivot: THREE.Group,
  spec: FlapSpec,
  mats: CraftMats,
  withWear: boolean,
): void {
  const body = new THREE.Mesh(makeFlapGeom(spec), mats.steelDark);
  body.rotation.x = Math.PI / 2;
  pivot.add(body);
  const tileSpec: FlapSpec = {
    chord: spec.chord * 0.88,
    span: spec.span * 0.92,
    thickness: spec.thickness * 0.22,
    sweepFwd: spec.sweepFwd * 0.88,
    sweepAft: spec.sweepAft * 0.88,
  };
  const tile = new THREE.Mesh(makeFlapGeom(tileSpec), mats.tile);
  tile.rotation.x = Math.PI / 2;
  tile.position.set(spec.span * 0.04, spec.thickness * 0.38, 0);
  pivot.add(tile);
  if (withWear) {
    const wear = new THREE.Mesh(
      new THREE.BoxGeometry(spec.span * 0.55, spec.thickness * 0.18, spec.chord * 0.12),
      mats.tileWear,
    );
    wear.position.set(spec.span * 0.45, spec.thickness * 0.42, -spec.chord * 0.22);
    pivot.add(wear);
  }
  const hinge = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, spec.thickness * 1.6, spec.chord * 0.22),
    mats.accent,
  );
  hinge.position.set(-0.004, 0, spec.chord * 0.12);
  pivot.add(hinge);
}

/** Named hinge: Euler ZYX so azimuth (Z) then pitch (X) for V7 belly throw. */
export function makeFlapPivot(name: string, az: number, z: number, restX: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.rotation.order = "ZYX";
  pivot.position.set(Math.cos(az) * R, Math.sin(az) * R, z);
  pivot.rotation.z = az;
  pivot.rotation.x = restX;
  pivot.userData.restX = restX;
  return pivot;
}

export function addNamedCam(
  host: THREE.Group,
  camName: string,
  lookName: string,
  camPos: readonly [number, number, number],
  lookPos: readonly [number, number, number],
): void {
  const cam = new THREE.Object3D();
  cam.name = camName;
  cam.position.set(camPos[0], camPos[1], camPos[2]);
  host.add(cam);
  const look = new THREE.Object3D();
  look.name = lookName;
  look.position.set(lookPos[0], lookPos[1], lookPos[2]);
  host.add(look);
}

export function makeBarrelRing(
  radius: number,
  tube: number,
  z: number,
  mat: THREE.Material,
): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 36), mat);
  ring.position.z = z;
  return ring;
}

/** Thin open cylinder flush to the barrel (ship welds — not a hovering torus). */
export function makeFlushWeldBand(
  radius: number,
  height: number,
  z: number,
  mat: THREE.Material,
): THREE.Mesh {
  return zCylinder(
    new THREE.CylinderGeometry(radius, radius, height, 36, 1, true),
    mat,
    z,
  );
}

/** Super Heavy grid fin with dark outer frame + denser lattice (V4). */
export function makeGridFin(
  finH: number,
  finW: number,
  finT: number,
  mats: {
    frame: THREE.Material;
    lattice: THREE.Material;
    plate: THREE.Material;
    pivot: THREE.Material;
  },
): THREE.Group {
  const fin = new THREE.Group();
  fin.name = "grid-fin";
  addGridFinPlate(fin, finH, finW, finT, mats.plate);
  addGridFinFrame(fin, finH, finW, finT, mats.frame);
  addGridFinLattice(fin, finH, finW, finT, mats.lattice);
  addGridFinPivot(fin, finH, mats.pivot);
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


export function makeBellBody(rTop: number, rBot: number, h: number, bodyMat: THREE.Material): THREE.Mesh {
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 10, 1, true), bodyMat);
  bell.rotation.x = Math.PI / 2;
  return bell;
}

export function makeBellRim(rBot: number, h: number, rimMat: THREE.Material): THREE.Mesh {
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rBot * 0.92, rBot * 0.08, 4, 12), rimMat);
  rim.position.z = -h * 0.5;
  return rim;
}

export function makeBell(
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  bodyMat: THREE.Material,
  rimMat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  g.add(makeBellBody(rTop, rBot, h, bodyMat));
  g.add(makeBellRim(rBot, h, rimMat));
  g.position.set(x, y, z);
  return g;
}

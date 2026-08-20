import * as THREE from "three";
import {
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

/**
 * Windward TPS arc (rad) — must match `addHeatMain` `phiLength`.
 * U=1 on the hex map spans this arc × barrel radius.
 */
const TPS_PHI_LENGTH = Math.PI * 0.64;

/** Mesh units for U=1 / V=1 on the windward hex map (same as hull TPS). */
export function tpsMapWorldSize(): { uMesh: number; vMesh: number } {
  return {
    uMesh: TPS_PHI_LENGTH * R,
    vMesh: Math.max(SHIP_OGIVE_BASE_Z - 0.05, 0.2),
  };
}

/**
 * Hex-map UV for a flap vertex. `x` is span from the hinge, `y` is chord
 * (0 at mid-chord). Scaled so tiles match hull TPS size.
 */
export function flapTileUv(
  x: number,
  y: number,
  chord: number,
  vOffset = 0,
): { u: number; v: number } {
  const { uMesh, vMesh } = tpsMapWorldSize();
  return {
    u: x / uMesh,
    v: (y + chord * 0.5) / vMesh + vOffset,
  };
}

/** Remap ExtrudeGeometry UVs from shape units onto the hull hex map. */
export function applyFlapTileUvs(
  geom: THREE.BufferGeometry,
  chord: number,
  vOffset = 0,
): void {
  const pos = geom.getAttribute("position");
  const uv = geom.getAttribute("uv");
  if (!pos || !uv) return;
  for (let i = 0; i < pos.count; i++) {
    const p = flapTileUv(pos.getX(i), pos.getY(i), chord, vOffset);
    uv.setXY(i, p.u, p.v);
  }
  uv.needsUpdate = true;
}

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

function makeFlapTileGeom(spec: FlapSpec, vOffset: number): THREE.ExtrudeGeometry {
  const geom = makeFlapGeom(spec);
  applyFlapTileUvs(geom, spec.chord, vOffset);
  return geom;
}

function addFlapWear(pivot: THREE.Group, spec: FlapSpec, mats: CraftMats): void {
  const wear = new THREE.Mesh(
    new THREE.BoxGeometry(spec.span * 0.55, spec.thickness * 0.18, spec.chord * 0.12),
    mats.tileWear,
  );
  wear.position.set(spec.span * 0.45, spec.thickness * 0.42, -spec.chord * 0.22);
  pivot.add(wear);
}

function addFlapHinge(pivot: THREE.Group, spec: FlapSpec, mats: CraftMats): void {
  const hinge = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, spec.thickness * 1.6, spec.chord * 0.22),
    mats.accent,
  );
  hinge.position.set(-0.004, 0, spec.chord * 0.12);
  pivot.add(hinge);
}

/** Child meshes: local +X = span after rotX so pivot.rotation.x remains the hinge. */
export function addFlapChildren(
  pivot: THREE.Group,
  spec: FlapSpec,
  mats: CraftMats,
  withWear: boolean,
  vOffset = 0,
): void {
  const body = new THREE.Mesh(makeFlapTileGeom(spec, vOffset), mats.tile);
  body.name = "flap-tps";
  body.rotation.x = Math.PI / 2;
  pivot.add(body);
  if (withWear) addFlapWear(pivot, spec, mats);
  addFlapHinge(pivot, spec, mats);
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



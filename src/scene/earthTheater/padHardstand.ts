/**
 * Starbase site hardstand: surveyed polygonal apron + a small circular OLM ring.
 *
 * The 80–120 m concentric rings read as a round pad from aerial and fought
 * the real multi-angled concrete. Keep a ~20 m ring at the mount so trench /
 * scorch decals still have a circular lip. The polygon spans OLP-2 through
 * the farm to OLP-1; sit it below per-bank slabs and the Pad 1 yard.
 * Apron meshes share a tiled mottled-concrete albedo (not a flat grey fill).
 */
import * as THREE from "three";
import {
  makeConcreteTexture,
  mottledConcreteMat,
  setPlanarUvKm,
} from "./padConcrete";
import { pad2ApronXz } from "./starbaseSurvey";
import { addGroundRing, type PadSurroundMats } from "./padSurroundMats";

/** Inner hole matches trench / OLM clear (~12 m). */
const APRON_INNER = 0.012;
/** Circular mount lip (~20 m). */
const APRON_OUTER = 0.02;

function addOlmApronRing(
  g: THREE.Group,
  mats: PadSurroundMats,
  map: THREE.Texture,
): void {
  const geo = new THREE.RingGeometry(APRON_INNER, APRON_OUTER, 48, 1);
  setPlanarUvKm(geo);
  const apron = new THREE.Mesh(geo, mottledConcreteMat(mats.concreteLight, map));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.0006;
  apron.name = "pad-olm-apron";
  g.add(apron);
}

function addPad2Apron(
  g: THREE.Group,
  mats: PadSurroundMats,
  map: THREE.Texture,
): void {
  const shape = new THREE.Shape();
  const verts = pad2ApronXz();
  const first = verts[0]!;
  // Shape XY → pad XZ via rotation.x = −π/2, so shapeY = −padZ.
  shape.moveTo(first[0], -first[1]);
  for (let i = 1; i < verts.length; i++) {
    const v = verts[i]!;
    shape.lineTo(v[0], -v[1]);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, APRON_INNER, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape);
  geo.computeVertexNormals();
  setPlanarUvKm(geo);
  const mesh = new THREE.Mesh(geo, mottledConcreteMat(mats.concreteLight, map, true));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.0018;
  mesh.name = "pad2-apron";
  g.add(mesh);
}

function addOlmCurb(g: THREE.Group, mats: PadSurroundMats): void {
  const curb = new THREE.Mesh(
    new THREE.TorusGeometry(APRON_OUTER * 0.98, 0.0012, 6, 48),
    mats.concreteDark,
  );
  curb.rotation.x = Math.PI / 2;
  curb.position.y = -0.0002;
  curb.name = "pad-hardstand-curb";
  g.add(curb);
}

function dressOuterRing(g: THREE.Group, mats: PadSurroundMats, map: THREE.Texture): void {
  const outer = g.getObjectByName("pad-hardstand-outer") as THREE.Mesh | undefined;
  if (!outer?.isMesh) return;
  setPlanarUvKm(outer.geometry);
  outer.material = mottledConcreteMat(mats.concrete, map);
}

/** Surveyed site apron (Pad 2 through farm to Pad 1) + small circular OLM lip. */
export function addPadHardstand(g: THREE.Group, mats: PadSurroundMats): void {
  const map = makeConcreteTexture();
  addPad2Apron(g, mats, map);
  addOlmApronRing(g, mats, map);
  addOlmCurb(g, mats);
  addGroundRing(g, APRON_OUTER, 0.028, mats.concrete, 0, -0.001, 0, 36, "pad-hardstand-outer");
  dressOuterRing(g, mats, map);
}

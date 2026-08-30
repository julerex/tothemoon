/**
 * OLP-2 hardstand: surveyed polygonal apron + a small circular OLM ring.
 *
 * The 80–120 m concentric rings read as a round pad from aerial and fought
 * the real multi-angled concrete. Keep a ~20 m ring at the mount so trench /
 * scorch decals still have a circular lip.
 */
import * as THREE from "three";
import { pad2ApronXz } from "./starbaseSurvey";
import { addGroundRing, type PadSurroundMats } from "./padSurroundMats";

/** Inner hole matches trench / OLM clear (~12 m). */
const APRON_INNER = 0.012;
/** Circular mount lip (~20 m). */
const APRON_OUTER = 0.02;

function addOlmApronRing(g: THREE.Group, mats: PadSurroundMats): void {
  const apron = new THREE.Mesh(
    new THREE.RingGeometry(APRON_INNER, APRON_OUTER, 48, 1),
    mats.concreteLight,
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.0006;
  apron.name = "pad-olm-apron";
  g.add(apron);
}

function addPad2Apron(g: THREE.Group, mats: PadSurroundMats): void {
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
  const mat = mats.concreteLight.clone();
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.0012;
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

/** Polygonal Pad 2 apron + small circular OLM lip. */
export function addPadHardstand(g: THREE.Group, mats: PadSurroundMats): void {
  addPad2Apron(g, mats);
  addOlmApronRing(g, mats);
  addOlmCurb(g, mats);
  addGroundRing(g, APRON_OUTER, 0.028, mats.concrete, 0, -0.001, 0, 36, "pad-hardstand-outer");
}

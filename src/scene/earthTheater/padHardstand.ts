/**
 * Circular OLM hardstand (V23.3) — concentric concrete rings, not a 220 m slab.
 * Keeps trench opening + scorch/water decals from the surroundings parent.
 */
import * as THREE from "three";
import { addGroundRing, type PadSurroundMats } from "./padSurroundMats";

/** Inner hole matches trench / OLM clear (~12 m). */
const APRON_INNER = 0.012;
/** Primary circular apron outer radius (~80 m). */
const APRON_OUTER = 0.08;
/** Outer service ring (~120 m) — reads as the circular pad from aerial. */
const HARDSTAND_OUTER = 0.12;

function addOlmApronRing(g: THREE.Group, mats: PadSurroundMats): void {
  const apron = new THREE.Mesh(
    new THREE.RingGeometry(APRON_INNER, APRON_OUTER, 48, 1),
    mats.concreteLight,
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.001;
  apron.name = "pad-olm-apron";
  g.add(apron);
}

function addConcentricHardstand(g: THREE.Group, mats: PadSurroundMats): void {
  // Mid tone ring between apron and outer service deck.
  addGroundRing(g, APRON_OUTER, 0.1, mats.concrete, 0, -0.0014, 0, 48, "pad-hardstand-mid");
  addGroundRing(g, 0.1, HARDSTAND_OUTER, mats.concreteDark, 0, -0.0018, 0, 48, "pad-hardstand-outer");
  // Raised curb lip at the apron edge (thin torus-ish via short cylinder).
  const curb = new THREE.Mesh(
    new THREE.TorusGeometry(APRON_OUTER * 0.98, 0.0012, 6, 48),
    mats.concreteDark,
  );
  curb.rotation.x = Math.PI / 2;
  curb.position.y = -0.0002;
  curb.name = "pad-hardstand-curb";
  g.add(curb);
}

/**
 * Small east/south service pads (not the old 220×200 m rectangle that read as
 * a grey box under aerial). Kept for GSE / warehouse approach massing.
 */
function addServicePads(g: THREE.Group, mats: PadSurroundMats): void {
  const pads: { size: [number, number, number]; pos: [number, number, number]; kind: keyof PadSurroundMats }[] = [
    { size: [0.06, 0.0022, 0.04], pos: [0.16, -0.0026, 0.08], kind: "concrete" },
    { size: [0.05, 0.0022, 0.035], pos: [0.18, -0.0027, -0.04], kind: "concreteLight" },
    { size: [0.045, 0.0022, 0.05], pos: [0.08, -0.0028, 0.14], kind: "concreteDark" },
  ];
  for (const s of pads) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(...s.size), mats[s.kind]);
    slab.position.set(...s.pos);
    g.add(slab);
  }
}

/** Circular hardstand + small service pads around the OLM. */
export function addPadHardstand(g: THREE.Group, mats: PadSurroundMats): void {
  addOlmApronRing(g, mats);
  addConcentricHardstand(g, mats);
  addServicePads(g, mats);
}

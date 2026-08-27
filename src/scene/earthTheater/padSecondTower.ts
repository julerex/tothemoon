/**
 * OLP-1 / Pad A second tower — east of Flight 13’s live OLP-2 stack.
 *
 * Flight 13 launched from Pad 2 (Wikipedia). Pad 1’s tower still stands;
 * its OLM was pulled for a V3 rebuild (top deck at Sanchez, mid-2026).
 * Theater: empty circular apron + stripped foundation, no vehicle.
 * Chopstick / QD node names are prefixed so recovery keeps the live pad.
 */
import * as THREE from "three";
import { PAD1_X_KM, PAD1_Z_KM } from "./mechazillaDims";
import { createMechazillaTower } from "./mechazillaTower";
import { makePadSurroundMats } from "./padSurroundMats";

function prefixPadNames(root: THREE.Object3D, prefix: string): void {
  root.traverse((obj) => {
    if (obj.name.startsWith("pad-") || obj.name === "mechazilla") {
      obj.name = `${prefix}${obj.name}`;
    }
  });
}

function addPad1Apron(g: THREE.Group): void {
  const mats = makePadSurroundMats();
  const apron = new THREE.Mesh(
    new THREE.RingGeometry(0.012, 0.07, 40, 1),
    mats.concreteDark,
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.0012;
  apron.name = "pad1-apron";
  g.add(apron);
  const curb = new THREE.Mesh(
    new THREE.TorusGeometry(0.068, 0.001, 6, 36),
    mats.concrete,
  );
  curb.rotation.x = Math.PI / 2;
  curb.position.y = -0.0004;
  g.add(curb);
}

/** Low ring where Pad 1’s donut OLM sat — mount is off-site at Flight 13. */
function addStrippedMount(g: THREE.Group): void {
  const mats = makePadSurroundMats();
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.02, 0.0024, 16, 1, true),
    mats.steelDark,
  );
  ring.position.y = 0.0012;
  ring.name = "pad1-stripped-mount";
  g.add(ring);
  const deck = new THREE.Mesh(
    new THREE.RingGeometry(0.008, 0.016, 20, 1),
    mats.steelDark,
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.0024;
  g.add(deck);
}

function addPadLinkRoad(g: THREE.Group): void {
  const mats = makePadSurroundMats();
  // Stop short of the live OLM so the 320 m slab is not in the trench-cam frustum.
  const stopShortKm = 0.045;
  const len = -PAD1_X_KM - stopShortKm;
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(len, 0.0016, 0.012),
    mats.asphalt,
  );
  // Group origin is Pad 1; +X toward the live pad. Center sits halfway along `len`.
  road.position.set(len * 0.5, -0.0028, 0);
  road.name = "pad1-link-road";
  g.add(road);
}

/**
 * Second launch tower (OLP-1) at the gulf-side pad.
 * @returns Group named `mechazilla-pad1`, parented in pad-local metres.
 */
export function createPad1Tower(): THREE.Group {
  const g = new THREE.Group();
  g.name = "mechazilla-pad1";
  g.position.set(PAD1_X_KM, 0, PAD1_Z_KM);
  const tower = createMechazillaTower({ includeOlm: false });
  prefixPadNames(tower, "pad1-");
  g.add(tower);
  addPad1Apron(g);
  addStrippedMount(g);
  addPadLinkRoad(g);
  return g;
}

/**
 * OLP-1 / Pad A second tower — east of Flight 13’s live OLP-2 stack.
 *
 * Flight 13 launched from Pad 2 (Wikipedia). Pad 1’s tower still stands;
 * its OLM was pulled for a V3 rebuild (top deck at Sanchez, mid-2026).
 * Theater: compact yard + stripped foundation + crawler crane, no vehicle.
 * Chopstick / QD node names are prefixed so recovery keeps the live pad.
 */
import * as THREE from "three";
import { PAD1_TOWER_DX_KM, PAD1_TOWER_DZ_KM, PAD1_X_KM, PAD1_Z_KM } from "./mechazillaDims";
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
  // Compact yard covering the empty mount and the tower ~32 m west — not a 70 m disc.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.0014, 0.055), mats.concreteDark);
  slab.position.set(0.016, -0.0014, -0.006);
  slab.name = "pad1-apron";
  g.add(slab);
  const lip = new THREE.Mesh(
    new THREE.RingGeometry(0.012, 0.022, 28, 1),
    mats.concrete,
  );
  lip.rotation.x = -Math.PI / 2;
  lip.position.y = -0.0006;
  g.add(lip);
  const dirt = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.001, 0.03), mats.dirt);
  dirt.position.set(-0.02, -0.0018, -0.028);
  g.add(dirt);
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

function addPad1Crane(g: THREE.Group): void {
  const yellow = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.42, roughness: 0.48 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.55, roughness: 0.5 });
  const crane = new THREE.Group();
  crane.name = "pad1-crane";
  crane.position.set(PAD1_TOWER_DX_KM + 0.02, 0, PAD1_TOWER_DZ_KM + 0.014);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.005, 0.008), yellow);
  body.position.y = 0.0035;
  crane.add(body);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.0014, 0.028, 0.0014), yellow);
  mast.position.set(0.002, 0.018, 0);
  crane.add(mast);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0012, 0.042), yellow);
  boom.position.set(0.002, 0.031, 0.016);
  boom.rotation.x = -0.45;
  crane.add(boom);
  const track = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0016, 0.01), steel);
  track.position.y = 0.0008;
  crane.add(track);
  g.add(crane);
}

function addPadLinkRoad(g: THREE.Group): void {
  const mats = makePadSurroundMats();
  // Stop short of the live OLM so the ~369 m slab is not in the trench-cam frustum.
  const stopShortKm = 0.045;
  const len = -PAD1_X_KM - stopShortKm;
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(len, 0.0016, 0.022),
    mats.concreteDark,
  );
  // Group origin is Pad 1; +X toward the live pad. Center sits halfway along `len`.
  road.position.set(len * 0.5, -0.0028, 0.008);
  road.name = "pad1-link-road";
  g.add(road);
}

/**
 * Second launch tower (OLP-1) at the gulf-side pad (~363 m east, ~69 m south).
 * @returns Group named `mechazilla-pad1`, parented in pad-local metres.
 */
export function createPad1Tower(): THREE.Group {
  const g = new THREE.Group();
  g.name = "mechazilla-pad1";
  g.position.set(PAD1_X_KM, 0, PAD1_Z_KM);
  const tower = createMechazillaTower({ includeOlm: false, frame: "local" });
  tower.position.set(PAD1_TOWER_DX_KM, 0, PAD1_TOWER_DZ_KM);
  prefixPadNames(tower, "pad1-");
  g.add(tower);
  addPad1Apron(g);
  addStrippedMount(g);
  addPad1Crane(g);
  addPadLinkRoad(g);
  return g;
}

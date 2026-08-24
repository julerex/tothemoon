/**
 * Hexagonal truncated-pyramid OLM (V24) vs Flight 13 T− stills.
 * Theater-grade massing — not CAD. Scene unit = 1 km.
 *
 * Look targets: `tminus-000500-pad-hold-wide.jpg` (aerial hex),
 * `tminus-000200-full-stack.jpg` (sloped faces), `tminus-000130-engines-up.jpg`
 * (painted inner bowl + catwalk). Open bottom so trench-cam still sees engines.
 */
import * as THREE from "three";
import { TOWER_OY0 } from "./mechazillaDims";
import type { TowerMats } from "./mechazillaMats";
import { makeScorchTexture } from "./padTextures";

/** Radial segments for the outer frustum (hex silhouette). */
export const OLM_HEX_SEGMENTS = 6;
/** Mount height (km) — ~12 m, taller than the V23.3 7.5 m cylinder. */
export const OLM_H = 0.012;
/** Top outer radius (km). */
export const OLM_TOP_R = 0.011;
/** Base outer radius (km) — flare vs T−2 / T−5 stills. */
export const OLM_BASE_R = 0.019;
/**
 * Painted inner bowl radius (km). Trench cam sits at ~7.8 m radial, so this
 * must stay larger. Tighter than V23.3's 12 m open cylinder so engines fill
 * the bowl the way T−1:30 does. Must stay inside {@link OLM_TOP_R}.
 */
export const OLM_INNER_R = 0.0098;
/** Work-lamp ring on the top lip (padLaunchMeshes). */
export const OLM_LAMP_R = 0.0112;
export const OLM_LAMP_Y = TOWER_OY0 + OLM_H + 0.00035;

const CATWALK_INNER = 0.0082;
const CATWALK_Y = TOWER_OY0 + OLM_H - 0.0016;

function hexAng(i: number): number {
  return (i / OLM_HEX_SEGMENTS) * Math.PI * 2;
}

function scorchMap(): THREE.CanvasTexture | undefined {
  return typeof document === "undefined" ? undefined : makeScorchTexture();
}

function withOptionalScorch(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const map = scorchMap();
  if (map) mat.map = map;
  return mat;
}

/** Weathered plate steel — T−2 stills are grey-tan slopes, not charcoal. */
function makeOuterPlate(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x7a7670,
    metalness: 0.38,
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
}

function makeScorchSteel(): THREE.MeshStandardMaterial {
  return withOptionalScorch(new THREE.MeshStandardMaterial({
    color: 0x3a3632,
    metalness: 0.48,
    roughness: 0.76,
    side: THREE.DoubleSide,
  }));
}

function makeInnerPaint(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xc8ccd2,
    metalness: 0.28,
    roughness: 0.74,
    side: THREE.BackSide,
  });
}

function addOuterShell(olm: THREE.Group): void {
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(OLM_TOP_R, OLM_BASE_R, OLM_H, OLM_HEX_SEGMENTS, 1, true),
    makeOuterPlate(),
  );
  shell.position.set(0, TOWER_OY0 + OLM_H * 0.5, 0);
  shell.name = "pad-olm-shell";
  olm.add(shell);
}

function addInnerShell(olm: THREE.Group): void {
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(OLM_INNER_R, OLM_INNER_R, OLM_H * 0.92, 24, 1, true),
    makeInnerPaint(),
  );
  inner.position.set(0, TOWER_OY0 + OLM_H * 0.5, 0);
  inner.name = "pad-olm-inner";
  olm.add(inner);
}

/** Dark scorched collar under the top lip (T−2 two-tone: light slope, dark cap). */
function addTopCollar(olm: THREE.Group): void {
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(OLM_TOP_R * 1.02, OLM_TOP_R * 1.08, 0.0022, OLM_HEX_SEGMENTS, 1, true),
    makeScorchSteel(),
  );
  collar.position.set(0, TOWER_OY0 + OLM_H - 0.0011, 0);
  collar.name = "pad-olm-collar";
  olm.add(collar);
}

function addTopDeck(olm: THREE.Group): void {
  const deck = new THREE.Mesh(
    new THREE.RingGeometry(OLM_INNER_R * 0.92, OLM_TOP_R + 0.0008, 28, 1),
    withOptionalScorch(new THREE.MeshStandardMaterial({
      color: 0x2a2824,
      metalness: 0.4,
      roughness: 0.78,
      side: THREE.DoubleSide,
    })),
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, TOWER_OY0 + OLM_H, 0);
  deck.name = "pad-olm-deck";
  olm.add(deck);
}

function addCornerRib(olm: THREE.Group, mats: TowerMats, i: number): void {
  const ang = hexAng(i);
  const x0 = Math.cos(ang) * OLM_BASE_R;
  const z0 = Math.sin(ang) * OLM_BASE_R;
  const x1 = Math.cos(ang) * OLM_TOP_R;
  const z1 = Math.sin(ang) * OLM_TOP_R;
  const y0 = TOWER_OY0;
  const y1 = TOWER_OY0 + OLM_H;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const rib = new THREE.Mesh(
    new THREE.CylinderGeometry(0.00045, 0.00055, 1, 6),
    mats.accent,
  );
  rib.scale.y = len;
  rib.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
  rib.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx, dy, dz).normalize(),
  );
  olm.add(rib);
}

function addCornerRibs(olm: THREE.Group, mats: TowerMats): void {
  for (let i = 0; i < OLM_HEX_SEGMENTS; i++) addCornerRib(olm, mats, i);
}

function addCatwalk(olm: THREE.Group, mats: TowerMats): void {
  const catwalk = new THREE.Group();
  catwalk.name = "pad-olm-catwalk";
  const deck = new THREE.Mesh(
    new THREE.RingGeometry(CATWALK_INNER, OLM_INNER_R - 0.00015, 32, 1),
    mats.steel,
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = CATWALK_Y;
  catwalk.add(deck);
  const rail = new THREE.Mesh(
    new THREE.TorusGeometry(CATWALK_INNER + 0.00035, 0.0001, 6, 32),
    mats.steelBright,
  );
  rail.rotation.x = Math.PI / 2;
  rail.position.y = CATWALK_Y + 0.00085;
  catwalk.add(rail);
  addCatwalkPosts(catwalk, mats);
  olm.add(catwalk);
}

function addCatwalkPosts(catwalk: THREE.Group, mats: TowerMats): void {
  const postGeo = new THREE.CylinderGeometry(0.00007, 0.00007, 0.00085, 5);
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const r = CATWALK_INNER + 0.00035;
    const post = new THREE.Mesh(postGeo, mats.steelBright);
    post.position.set(Math.cos(ang) * r, CATWALK_Y + 0.00042, Math.sin(ang) * r);
    catwalk.add(post);
  }
}

function addInnerPipe(olm: THREE.Group, mats: TowerMats, ang: number, y: number): void {
  const pipe = new THREE.Mesh(
    new THREE.TorusGeometry(OLM_INNER_R - 0.00035, 0.00016, 6, 16, Math.PI * 0.55),
    mats.steelDark,
  );
  pipe.position.set(0, y, 0);
  pipe.rotation.x = Math.PI / 2;
  pipe.rotation.z = ang;
  olm.add(pipe);
}

function addInnerPipes(olm: THREE.Group, mats: TowerMats): void {
  addInnerPipe(olm, mats, 0.4, TOWER_OY0 + 0.0045);
  addInnerPipe(olm, mats, 2.1, TOWER_OY0 + 0.0062);
  addInnerPipe(olm, mats, 4.0, TOWER_OY0 + 0.0036);
  const drop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.00014, 0.00014, 0.0055, 6),
    mats.steelDark,
  );
  drop.position.set(Math.cos(0.9) * (OLM_INNER_R - 0.0004), TOWER_OY0 + 0.005, Math.sin(0.9) * (OLM_INNER_R - 0.0004));
  olm.add(drop);
}

function addDeflector(olm: THREE.Group, mats: TowerMats): void {
  const deflector = new THREE.Group();
  deflector.name = "pad-olm-deflector";
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(OLM_INNER_R * 0.88, OLM_INNER_R * 1.15, 0.0032, OLM_HEX_SEGMENTS, 1, true),
    mats.steelDark,
  );
  funnel.position.set(0, TOWER_OY0 + 0.0018, 0);
  deflector.add(funnel);
  olm.add(deflector);
}

/** Hex OLM + interior catwalk, parented under `pad-olm`. */
export function addOlm(g: THREE.Group, mats: TowerMats): void {
  const olm = new THREE.Group();
  olm.name = "pad-olm";
  addOuterShell(olm);
  addInnerShell(olm);
  addTopCollar(olm);
  addTopDeck(olm);
  addCornerRibs(olm, mats);
  addCatwalk(olm, mats);
  addInnerPipes(olm, mats);
  addDeflector(olm, mats);
  g.add(olm);
}

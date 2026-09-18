/**
 * Sea-level Raptor prototype from the Ijsz23 Sketchfab Super Heavy (CC BY).
 * Runtime uses a decimated GLB clone-per-engine (shared BufferGeometry).
 * Missing file → procedural {@link makeBell}.
 */

import * as THREE from "three";
import {
  BOOST_RING_INNER,
  BOOST_RING_MID,
  BOOST_RING_OUTER,
  SL_BELL_H,
  SL_BELL_R,
  U,
} from "./dimensions";
import { loadGltfScene } from "../assetLoad";
import { makeBell } from "./raptorBell";

/** Public path for the committed theater-grade SL Raptor. */
export const RAPTOR_SL_GLB = "models/raptor-sl.glb";

const BELL_Z = -0.02;

let slPrototype: THREE.Group | null = null;

/** Last successfully loaded prototype (null → procedural bells). */
export function raptorSlPrototype(): THREE.Group | null {
  return slPrototype;
}

/** Test / bootstrap hook. */
export function setRaptorSlPrototype(proto: THREE.Group | null): void {
  slPrototype = proto;
}

/**
 * Vite base-relative URL for the SL Raptor GLB.
 *
 * @param base - `import.meta.env.BASE_URL` (always trailing-slash in Vite)
 */
export function raptorSlUrl(base: string): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}${RAPTOR_SL_GLB}`;
}

/**
 * Sketchfab booster Y-up meters → theater mesh units.
 * Engine centroid `(cx,cy,cz)` becomes the group origin; −Y (nozzle) → −Z.
 */
export function sketchfabRaptorToTheater(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
): [number, number, number] {
  return [(x - cx) * U, (z - cz) * U, (y - cy) * U];
}

/**
 * Deep-clone a prototype but share BufferGeometry (and materials until
 * `uniquifyBellMaterials` runs on the detached booster).
 */
export function cloneRaptorAt(
  proto: THREE.Group,
  x: number,
  y: number,
  z: number,
): THREE.Group {
  const g = proto.clone(true);
  g.name = "raptor";
  g.position.set(x, y, z);
  return g;
}

function ringAngle(i: number, n: number): number {
  return (i / n) * Math.PI * 2 + (n === 3 ? 0 : 0.08);
}

export type ProceduralBell = typeof makeBell;

function addRing(
  g: THREE.Group,
  proto: THREE.Group | null,
  n: number,
  r: number,
  br: number,
  h: number,
  bellZ: number,
  procedural: ProceduralBell,
): void {
  for (let i = 0; i < n; i++) {
    const ang = ringAngle(i, n);
    const x = Math.cos(ang) * r;
    const y = Math.sin(ang) * r;
    if (proto) g.add(cloneRaptorAt(proto, x, y, bellZ));
    else g.add(procedural(br * 0.55, br, h, x, y, bellZ));
  }
}

/**
 * 3 / 10 / 20 sea-level bells parented as `booster-engines`.
 * Each child is named `raptor` so landing-burn dimming can walk them.
 */
export function addBoosterRaptorField(
  booster: THREE.Group,
  proto: THREE.Group | null,
  bellZ: number = BELL_Z,
  procedural: ProceduralBell = makeBell,
): void {
  const g = new THREE.Group();
  g.name = "booster-engines";
  const br = SL_BELL_R;
  const h = SL_BELL_H;
  if (proto) {
    addRing(g, proto, 3, BOOST_RING_INNER, br, h, bellZ, procedural);
    addRing(g, proto, 10, BOOST_RING_MID, br, h, bellZ, procedural);
    addRing(g, proto, 20, BOOST_RING_OUTER, br, h, bellZ, procedural);
  } else {
    addRing(g, null, 3, BOOST_RING_INNER, br * 0.95, h, bellZ, procedural);
    addRing(g, null, 10, BOOST_RING_MID, br, h * 0.98, bellZ, procedural);
    addRing(g, null, 20, BOOST_RING_OUTER, br, h * 0.96, bellZ, procedural);
  }
  booster.add(g);
}

function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && o instanceof THREE.Mesh) found = o;
  });
  return found;
}

/**
 * Wrap a loaded GLTF scene as a reusable prototype (identity pose at origin).
 */
export function prototypeFromGltfScene(scene: THREE.Group | THREE.Scene): THREE.Group {
  const proto = new THREE.Group();
  proto.name = "raptor-sl-proto";
  const root = scene.clone(true);
  proto.add(root);
  const mesh = firstMesh(proto);
  if (mesh) mesh.name = mesh.name || "raptor-body";
  return proto;
}

/**
 * Fetch `public/models/raptor-sl.glb` and cache it for {@link raptorSlPrototype}.
 * Missing / failed load leaves the cache null (procedural bells).
 */
export async function loadRaptorSlPrototype(): Promise<THREE.Group | null> {
  const base =
    typeof import.meta.env?.BASE_URL === "string" ? import.meta.env.BASE_URL : "/tothemoon/";
  const scene = await loadGltfScene(raptorSlUrl(base));
  if (!scene) {
    setRaptorSlPrototype(null);
    return null;
  }
  const proto = prototypeFromGltfScene(scene);
  setRaptorSlPrototype(proto);
  return proto;
}

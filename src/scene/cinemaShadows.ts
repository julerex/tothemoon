/**
 * Sun shadow maps, pad shadow policy, and per-frame shadow focus.
 */

import * as THREE from "three";
import {
  SHADOW_FADE_ALT_KM,
  SHADOW_FULL_ALT_KM,
  altitudeFade,
  shadowHalfExtentKm,
  type Vec3Like,
} from "./cinemaExposure";

/**
 * Enable soft shadow maps on the renderer and configure the sun light.
 * Call once after creating the renderer + sun light.
 *
 * Bias notes (scene unit = 1 km): flat pad slabs must **not** cast (see
 * {@link markPadShadowMeshes}) or they self-acne into TV-snow noise.
 */
function configureShadowCamera(cam: THREE.OrthographicCamera): void {
  cam.near = 0.05;
  cam.far = 8;
  cam.left = -0.4;
  cam.right = 0.4;
  cam.top = 0.4;
  cam.bottom = -0.4;
  cam.updateProjectionMatrix();
}

export function enableSunShadows(
  renderer: THREE.WebGLRenderer,
  sunLight: THREE.DirectionalLight,
): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.004;
  sunLight.shadow.radius = 3;
  configureShadowCamera(sunLight.shadow.camera);
}

/**
 * Mark meshes under a root as shadow casters and/or receivers.
 * Skips lights, sprites, and non-mesh objects.
 */
function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function isAdditiveBasic(m: THREE.Material): boolean {
  return (
    (m as THREE.MeshBasicMaterial).isMeshBasicMaterial &&
    m.transparent &&
    m.blending === THREE.AdditiveBlending
  );
}

function applyMeshShadowFlags(
  mesh: THREE.Mesh,
  cast: boolean,
  receive: boolean,
): void {
  const mats = materialsOf(mesh);
  if (mats.some((m) => m && (m as THREE.Material).userData?.noShadow)) return;
  if (mats.some((m) => m && isAdditiveBasic(m))) {
    mesh.castShadow = false;
    mesh.receiveShadow = receive;
    return;
  }
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
}

export function markShadowMeshes(
  root: THREE.Object3D,
  opts: { cast?: boolean; receive?: boolean } = { cast: true, receive: true },
): void {
  const cast = opts.cast !== false;
  const receive = opts.receive !== false;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) applyMeshShadowFlags(mesh, cast, receive);
  });
}

/**
 * Pad shadow policy:
 * - **Cast** only from vertical structures (tower, tanks, OLM, chopsticks).
 * - **Receive** on hardstand slabs + scorch (craft/tower contact shadows).
 * - Large flat scrub discs / landmark rings neither cast nor receive —
 *   coplanar multi-disc stacks and multi-km receivers both produce TV-snow
 *   shadow-map acne on pad cams.
 */
const PAD_CAST_ROOTS = [
  "mechazilla", "mechazilla-pad1", "pad-tank-farm", "pad-warehouse", "pad-olm",
  "pad-chopstick-carriage", "pad-chopstick-L", "pad-chopstick-R", "pad-qd-arm",
  "pad-flood-fixture-0", "pad-flood-fixture-1", "pad-flood-fixture-2", "pad-flood-fixture-3",
] as const;

/** Large coplanar flats — never cast or receive. */
const PAD_NO_SHADOW = [
  "pad-landmark-scrub", "pad-landmark-ring", "pad-landmark-rim",
  "pad-scrub-terrain", "pad-pond", "pad-satellite-plate", "pad-naip-plate",
] as const;

/** Small apron surfaces that should still catch craft/tower shadows. */
const PAD_RECEIVE_ONLY = ["pad-scorch"] as const;

function isFlatBoxGeometry(geom: THREE.BoxGeometry): boolean {
  const p = geom.parameters as { width: number; height: number; depth: number };
  return Math.min(p.width, p.height, p.depth) < Math.max(p.width, p.height, p.depth) * 0.08;
}

function isLargeFlatPadGeometry(geom: THREE.BufferGeometry): boolean {
  return (
    geom instanceof THREE.CircleGeometry ||
    geom instanceof THREE.RingGeometry ||
    geom instanceof THREE.PlaneGeometry
  );
}

function isFlatPadGeometry(geom: THREE.BufferGeometry): boolean {
  if (isLargeFlatPadGeometry(geom)) return true;
  if (geom instanceof THREE.BoxGeometry) return isFlatBoxGeometry(geom);
  return false;
}

/**
 * Surroundings: thin hardstand boxes receive; discs/planes/rings do not
 * (large coplanar receivers snow under the pad sun frustum).
 */
function silenceFlatPadMeshes(node: THREE.Object3D): void {
  node.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!isFlatPadGeometry(mesh.geometry)) return;
    mesh.castShadow = false;
    mesh.receiveShadow = !isLargeFlatPadGeometry(mesh.geometry);
  });
}

function markPadCastRoots(pad: THREE.Object3D): void {
  for (const name of PAD_CAST_ROOTS) {
    const node = pad.getObjectByName(name);
    if (node) markShadowMeshes(node, { cast: true, receive: true });
  }
}

function markPadNoShadow(pad: THREE.Object3D): void {
  for (const name of PAD_NO_SHADOW) {
    const node = pad.getObjectByName(name);
    if (node) markShadowMeshes(node, { cast: false, receive: false });
  }
}

function markPadReceiveOnly(pad: THREE.Object3D): void {
  for (const name of PAD_RECEIVE_ONLY) {
    const node = pad.getObjectByName(name);
    if (node) markShadowMeshes(node, { cast: false, receive: true });
  }
  const surroundings = pad.getObjectByName("pad-surroundings");
  if (surroundings) silenceFlatPadMeshes(surroundings);
}

export function markPadShadowMeshes(pad: THREE.Object3D): void {
  markShadowMeshes(pad, { cast: false, receive: true });
  markPadCastRoots(pad);
  markPadReceiveOnly(pad);
  markPadNoShadow(pad);
}

/**
 * Re-center the sun light + tight shadow frustum on a world-space focus
 * (craft or pad). Preserves sun direction via `sunUnit` (Earth→Sun).
 *
 * When inactive (high altitude), disables casting so AU views stay cheap;
 * caller should still run {@link applySunLight} for unit-offset illumination.
 *
 * @returns effective shadow strength 0..1 (for optional UI / debug)
 */
function setOrthoHalf(cam: THREE.OrthographicCamera, half: number, far: number): void {
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 0.05;
  cam.far = far;
  cam.updateProjectionMatrix();
}

function placeSunShadow(
  sunLight: THREE.DirectionalLight, focus: Vec3Like, sunUnit: Vec3Like, half: number, pull: number,
): void {
  sunLight.position.set(focus.x + sunUnit.x * pull, focus.y + sunUnit.y * pull, focus.z + sunUnit.z * pull);
  sunLight.target.position.set(focus.x, focus.y, focus.z);
  sunLight.target.updateMatrixWorld();
  setOrthoHalf(sunLight.shadow.camera, half, pull + half * 3);
}

function enableSunShadowFocus(
  sunLight: THREE.DirectionalLight,
  focus: Vec3Like,
  sunUnit: Vec3Like,
  camAltKm: number,
  strength: number,
): number {
  sunLight.castShadow = true;
  const half = shadowHalfExtentKm(camAltKm);
  placeSunShadow(sunLight, focus, sunUnit, half, Math.max(1.2, half * 4));
  sunLight.shadow.radius = 1.8 + 1.2 * strength;
  return strength;
}

export function updateSunShadowFocus(
  sunLight: THREE.DirectionalLight,
  focus: Vec3Like,
  sunUnit: Vec3Like,
  camAltKm: number,
): number {
  const strength = altitudeFade(camAltKm, SHADOW_FULL_ALT_KM, SHADOW_FADE_ALT_KM);
  if (strength < 0.02) {
    sunLight.castShadow = false;
    return 0;
  }
  return enableSunShadowFocus(sunLight, focus, sunUnit, camAltKm, strength);
}

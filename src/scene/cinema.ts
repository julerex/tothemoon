/**
 * Visual V5 cinema: tight sun shadows (pad + craft), mild bloom, exposure
 * adaptation, and altitude-aware atmosphere / star fade.
 *
 * Theater-grade — not film-grade. Scrub-safe (driven by mission state /
 * camera altitude). Scene unit = 1 km.
 *
 * Shadows: directional sun with a tight orthographic frustum re-centered on
 * the craft/pad each frame. Disabled far from Earth **and** the Moon so
 * AU-scale views stay cheap. Lunar landing uses Moon-relative camera altitude.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { R_EARTH, R_MOON } from "../physics/constants";

/** Full soft shadows below this camera altitude (km above mean surface). */
export const SHADOW_FULL_ALT_KM = 12;
/** Shadows fully off above this altitude (km). */
export const SHADOW_FADE_ALT_KM = 80;

/** Pad / low-alt exposure (brighter for readable concrete + floods). */
export const EXPOSURE_PAD = 1.18;
/** Mid / LEO exposure. */
export const EXPOSURE_LEO = 1.05;
/** Deep-space / cislunar exposure (slightly restrained). */
export const EXPOSURE_SPACE = 0.96;

export type Vec3Like = { x: number; y: number; z: number };

export type CinemaBundle = {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  renderPass: RenderPass;
};

/**
 * Softstep altitude fade: 1 at/below `fullKm`, 0 at/above `fadeKm`.
 */
export function altitudeFade(
  altKm: number,
  fullKm: number,
  fadeKm: number,
): number {
  if (!Number.isFinite(altKm)) return 0;
  if (fadeKm <= fullKm) return altKm <= fullKm ? 1 : 0;
  if (altKm <= fullKm) return 1;
  if (altKm >= fadeKm) return 0;
  const t = (altKm - fullKm) / (fadeKm - fullKm);
  const s = t * t * (3 - 2 * t);
  return 1 - s;
}

/**
 * Tone-mapping exposure from camera altitude (km above mean surface).
 * Brighter on the pad; slightly restrained in deep space.
 */
export function cinemaExposure(camAltKm: number): number {
  if (!Number.isFinite(camAltKm) || camAltKm < 0) return EXPOSURE_PAD;
  // Pad band → LEO
  const toLeo = altitudeFade(camAltKm, 2, 120);
  const padLeo = EXPOSURE_PAD * toLeo + EXPOSURE_LEO * (1 - toLeo);
  // LEO → deep space
  const toSpace = altitudeFade(camAltKm, 200, 5000);
  return padLeo * toSpace + EXPOSURE_SPACE * (1 - toSpace);
}

/**
 * Mild bloom strength: a touch stronger near the pad (plumes + floods),
 * restrained in deep space so the Sun does not wash the frame.
 */
export function cinemaBloomStrength(camAltKm: number, burning: boolean): number {
  const near = altitudeFade(camAltKm, 5, 200);
  const base = 0.22 + 0.14 * near;
  const burnBoost = burning ? 0.08 * Math.max(near, 0.25) : 0;
  return base + burnBoost;
}

/**
 * Bloom luminance threshold — high so only engines / Sun / floods glow.
 */
export function cinemaBloomThreshold(camAltKm: number): number {
  const near = altitudeFade(camAltKm, 5, 150);
  // Slightly lower near pad so plume cores read; higher in space for Sun only
  return 0.78 + 0.1 * (1 - near);
}

/**
 * Star-dome opacity: full in space, pulled back near the pad so ground-sky
 * owns the horizon; further reduced during entry brownout.
 *
 * @param brownout - 0..1 from {@link atmosphereBrownout}
 */
export function starDomeOpacity(camAltKm: number, brownout = 0): number {
  const space = 1 - altitudeFade(camAltKm, 15, 100);
  // Near pad still keep a faint starfield above the blue dome
  const op = 0.22 + 0.78 * space;
  const b = Math.max(0, Math.min(1, brownout));
  return op * (1 - 0.65 * b);
}

/**
 * Entry brownout factor for atmosphere / star tint (0..1).
 * Uses phase + altitude (+ optional plasma strength from entry FX).
 */
function entryAltBrownout(altKm: number): number {
  // Theater fallback when plasma helper is not wired (lunar mission)
  if (!Number.isFinite(altKm) || altKm > 100 || altKm < 0.5) return 0;
  // Peak around 40–70 km: rise through 15–35 km, fall through 55–95 km
  const rise = 1 - altitudeFade(altKm, 15, 35);
  const fall = altitudeFade(altKm, 55, 95);
  return Math.max(0, Math.min(1, rise * fall * 0.55));
}

export function atmosphereBrownout(
  phase: string | undefined,
  altKm: number,
  plasmaStrength = 0,
): number {
  const plasma = Math.max(0, Math.min(1, plasmaStrength));
  if (plasma > 0.02) return Math.min(1, plasma * 0.95);
  if (phase !== "entry" && phase !== "descent") return 0;
  return entryAltBrownout(altKm);
}

/**
 * Half-extent (km) for the orthographic sun shadow camera.
 * Tight on the pad; widens modestly during low ascent.
 */
export function shadowHalfExtentKm(camAltKm: number): number {
  if (!Number.isFinite(camAltKm) || camAltKm < 0) return 0.28;
  return Math.min(2.2, 0.22 + camAltKm * 0.08);
}

/**
 * Whether sun shadows should run at this camera altitude.
 */
export function shadowsActive(camAltKm: number): boolean {
  return altitudeFade(camAltKm, SHADOW_FULL_ALT_KM, SHADOW_FADE_ALT_KM) > 0.02;
}

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
  "mechazilla", "pad-tank-farm", "pad-warehouse", "pad-olm",
  "pad-chopstick-carriage", "pad-chopstick-L", "pad-chopstick-R", "pad-qd-arm",
  "pad-flood-fixture-0", "pad-flood-fixture-1", "pad-flood-fixture-2", "pad-flood-fixture-3",
] as const;

/** Large coplanar flats — never cast or receive. */
const PAD_NO_SHADOW = [
  "pad-landmark-scrub", "pad-landmark-ring", "pad-landmark-rim",
  "pad-scrub-terrain", "pad-pond", "pad-satellite-plate",
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

/**
 * Camera altitude (km) above mean Earth surface from world positions.
 */
export function cameraAltitudeEarthKm(
  cameraPos: Vec3Like,
  earthPos: Vec3Like,
): number {
  const dx = cameraPos.x - earthPos.x;
  const dy = cameraPos.y - earthPos.y;
  const dz = cameraPos.z - earthPos.z;
  return Math.hypot(dx, dy, dz) - R_EARTH;
}

/**
 * Camera altitude (km) above mean Moon surface from world positions.
 */
export function cameraAltitudeMoonKm(
  cameraPos: Vec3Like,
  moonPos: Vec3Like,
): number {
  const dx = cameraPos.x - moonPos.x;
  const dy = cameraPos.y - moonPos.y;
  const dz = cameraPos.z - moonPos.z;
  return Math.hypot(dx, dy, dz) - R_MOON;
}

/**
 * Shadow / near-surface cinema altitude: the nearer of Earth and Moon AGL.
 * Pad shots use Earth; lunar landing uses the Moon; cislunar stays huge.
 */
export function shadowAltitudeKm(earthAltKm: number, moonAltKm: number): number {
  const e = Number.isFinite(earthAltKm) ? earthAltKm : Number.POSITIVE_INFINITY;
  const m = Number.isFinite(moonAltKm) ? moonAltKm : Number.POSITIVE_INFINITY;
  return Math.min(e, m);
}

/**
 * Build EffectComposer with mild Unreal bloom + OutputPass (tone map / color).
 */
function makeBloomPass(size: THREE.Vector2): UnrealBloomPass {
  return new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, size.x), Math.max(1, size.y)),
    0.28, 0.45, 0.82,
  );
}

export function createCinemaComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): CinemaBundle {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = makeBloomPass(size);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return { composer, bloom, renderPass };
}

/**
 * Resize the composer + bloom targets when the canvas changes.
 */
export function resizeCinema(
  bundle: CinemaBundle,
  width: number,
  height: number,
  pixelRatio: number,
): void {
  bundle.composer.setSize(width, height);
  bundle.composer.setPixelRatio(pixelRatio);
  bundle.bloom.setSize(width * pixelRatio, height * pixelRatio);
}

/**
 * Apply per-frame cinema uniforms: exposure, bloom, star dome, then render.
 */
export function renderCinema(
  bundle: CinemaBundle,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  opts: {
    camAltKm: number;
    burning: boolean;
    brownout: number;
  },
): void {
  renderer.toneMappingExposure = cinemaExposure(opts.camAltKm);
  bundle.bloom.strength = cinemaBloomStrength(opts.camAltKm, opts.burning);
  bundle.bloom.threshold = cinemaBloomThreshold(opts.camAltKm);
  updateStarDomeCinema(scene, opts.camAltKm, opts.brownout);
  bundle.composer.render();
}

/**
 * Fade / dim the star dome for low-altitude and brownout (V5 haze).
 */
function tintStarDome(mat: THREE.MeshBasicMaterial, brownout: number): void {
  if (brownout > 0.02) {
    const t = Math.min(1, brownout);
    mat.color.setRGB(0.35 + 0.25 * t, 0.32 + 0.05 * t, 0.38 * (1 - 0.5 * t));
  } else {
    mat.color.setHex(0x555566);
  }
}

export function updateStarDomeCinema(
  scene: THREE.Scene,
  camAltKm: number,
  brownout: number,
): void {
  const stars = scene.getObjectByName("star-dome") as THREE.Mesh | undefined;
  if (!stars) return;
  const mat = stars.material as THREE.MeshBasicMaterial;
  if (!mat.isMeshBasicMaterial) return;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.opacity = starDomeOpacity(camAltKm, brownout);
  tintStarDome(mat, brownout);
}

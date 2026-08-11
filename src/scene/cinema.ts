/**
 * Visual V5 cinema: tight sun shadows (pad + craft), mild bloom, exposure
 * adaptation, and altitude-aware atmosphere / star fade.
 *
 * Theater-grade — not film-grade. Scrub-safe (driven by mission state /
 * camera altitude). Scene unit = 1 km.
 *
 * Shadows: directional sun with a tight orthographic frustum re-centered on
 * the craft/pad each frame. Disabled far from Earth so AU-scale views stay cheap.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { R_EARTH } from "../physics/constants";

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
export function atmosphereBrownout(
  phase: string | undefined,
  altKm: number,
  plasmaStrength = 0,
): number {
  const plasma = Math.max(0, Math.min(1, plasmaStrength));
  if (plasma > 0.02) {
    return Math.min(1, plasma * 0.95);
  }
  if (phase !== "entry" && phase !== "descent") return 0;
  // Theater fallback when plasma helper is not wired (lunar mission)
  if (!Number.isFinite(altKm)) return 0;
  if (altKm > 100 || altKm < 0.5) return 0;
  // Peak around 40–70 km: rise through 15–35 km, fall through 55–95 km
  const rise = 1 - altitudeFade(altKm, 15, 35);
  const fall = altitudeFade(altKm, 55, 95);
  return Math.max(0, Math.min(1, rise * fall * 0.55));
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
export function enableSunShadows(
  renderer: THREE.WebGLRenderer,
  sunLight: THREE.DirectionalLight,
): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  // Conservative bias: enough to hide residual acne on craft/OLM without
  // large peter-panning (values in world km / shadow depth).
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.004;
  sunLight.shadow.radius = 3;
  const cam = sunLight.shadow.camera;
  cam.near = 0.05;
  cam.far = 8;
  cam.left = -0.4;
  cam.right = 0.4;
  cam.top = 0.4;
  cam.bottom = -0.4;
  cam.updateProjectionMatrix();
}

/**
 * Mark meshes under a root as shadow casters and/or receivers.
 * Skips lights, sprites, and non-mesh objects.
 */
export function markShadowMeshes(
  root: THREE.Object3D,
  opts: { cast?: boolean; receive?: boolean } = { cast: true, receive: true },
): void {
  const cast = opts.cast !== false;
  const receive = opts.receive !== false;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Skip pure additive / HUD-like basic materials that should not write shadows
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const shadowOk = mats.some((m) => {
      if (!m) return false;
      // Sprites / particles often use transparent additive — skip
      if ((m as THREE.Material).userData?.noShadow) return false;
      return true;
    });
    if (!shadowOk) return;
    // Don't cast from fully transparent additive fire / steam if MeshBasic + additive
    for (const m of mats) {
      if (
        m &&
        (m as THREE.MeshBasicMaterial).isMeshBasicMaterial &&
        (m as THREE.Material).transparent &&
        (m as THREE.Material).blending === THREE.AdditiveBlending
      ) {
        mesh.castShadow = false;
        mesh.receiveShadow = receive;
        return;
      }
    }
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
}

/**
 * Pad shadow policy: **receive** craft/tower shadows on all pad surfaces, but
 * only **cast** from vertical structures (tower, tanks, OLM, chopsticks).
 *
 * Flat hardstand / scrub / landmark rings must not cast — coplanar cast+receive
 * produces noisy self-acne (“TV snow”) on the launch apron.
 */
export function markPadShadowMeshes(pad: THREE.Object3D): void {
  // Ground / apron / FX: receive only
  markShadowMeshes(pad, { cast: false, receive: true });

  // Named vertical massing that should throw a real shadow on the concrete
  const castRoots = [
    "mechazilla",
    "pad-tank-farm",
    "pad-warehouse",
    "pad-olm",
    "pad-chopstick-carriage",
    "pad-chopstick-L",
    "pad-chopstick-R",
    "pad-qd-arm",
    "pad-flood-fixture-0",
    "pad-flood-fixture-1",
    "pad-flood-fixture-2",
    "pad-flood-fixture-3",
  ] as const;

  for (const name of castRoots) {
    const node = pad.getObjectByName(name);
    if (node) markShadowMeshes(node, { cast: true, receive: true });
  }

  // Explicitly silence large flat landmark discs (receive only, never cast)
  for (const name of [
    "pad-landmark-scrub",
    "pad-landmark-ring",
    "pad-scorch",
    "pad-surroundings",
  ] as const) {
    const node = pad.getObjectByName(name);
    if (!node) continue;
    if (name === "pad-surroundings") {
      // Surroundings: keep receive; only re-enable cast on nested farm/warehouse
      // (already handled via getObjectByName above if parented under pad).
      // Force flat discs under surroundings not to cast.
      node.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geom = mesh.geometry;
        if (
          geom instanceof THREE.CircleGeometry ||
          geom instanceof THREE.RingGeometry ||
          geom instanceof THREE.PlaneGeometry
        ) {
          mesh.castShadow = false;
          mesh.receiveShadow = true;
        } else if (geom instanceof THREE.BoxGeometry) {
          // Thin horizontal slabs (hardstand): do not cast
          const p = geom.parameters as {
            width: number;
            height: number;
            depth: number;
          };
          const minDim = Math.min(p.width, p.height, p.depth);
          const maxDim = Math.max(p.width, p.height, p.depth);
          if (minDim < maxDim * 0.08) {
            mesh.castShadow = false;
            mesh.receiveShadow = true;
          }
        }
      });
    } else {
      markShadowMeshes(node, { cast: false, receive: true });
    }
  }
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
export function updateSunShadowFocus(
  sunLight: THREE.DirectionalLight,
  focus: Vec3Like,
  sunUnit: Vec3Like,
  camAltKm: number,
): number {
  const strength = altitudeFade(
    camAltKm,
    SHADOW_FULL_ALT_KM,
    SHADOW_FADE_ALT_KM,
  );
  if (strength < 0.02) {
    sunLight.castShadow = false;
    return 0;
  }

  sunLight.castShadow = true;
  const half = shadowHalfExtentKm(camAltKm);
  // Pull light sunward of focus so the ortho frustum covers pad + stack
  const pull = Math.max(1.2, half * 4);
  sunLight.position.set(
    focus.x + sunUnit.x * pull,
    focus.y + sunUnit.y * pull,
    focus.z + sunUnit.z * pull,
  );
  sunLight.target.position.set(focus.x, focus.y, focus.z);
  sunLight.target.updateMatrixWorld();

  const cam = sunLight.shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 0.05;
  cam.far = pull + half * 3;
  cam.updateProjectionMatrix();
  // Soften as we fade out with altitude
  sunLight.shadow.radius = 1.8 + 1.2 * strength;
  return strength;
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
 * Build EffectComposer with mild Unreal bloom + OutputPass (tone map / color).
 */
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

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, size.x), Math.max(1, size.y)),
    0.28, // strength — kept mild
    0.45, // radius
    0.82, // threshold
  );
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
  // Warm the dome slightly during brownout so residual stars don't stay pure white
  if (brownout > 0.02) {
    const t = Math.min(1, brownout);
    mat.color.setRGB(
      0.35 + 0.25 * t,
      0.32 + 0.05 * t,
      0.38 * (1 - 0.5 * t),
    );
  } else {
    mat.color.setHex(0x555566);
  }
}

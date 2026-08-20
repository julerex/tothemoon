/**
 * EffectComposer bloom / onboard post / render.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { createOnboardPostPass, onboardPostEnabled } from "./onboardPost";
import {
  cinemaBloomStrength,
  cinemaBloomThreshold,
  cinemaExposure,
  starDomeOpacity,
} from "./cinemaExposure";

export type CinemaBundle = {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  renderPass: RenderPass;
  /** V18 onboard fisheye/grain — enabled only for fin / gridfin. */
  onboardPost: ShaderPass;
};

/**
 * Build EffectComposer with mild Unreal bloom, optional onboard post (V18),
 * and OutputPass (tone map / color). Onboard pass sits before OutputPass and
 * starts disabled — {@link renderCinema} gates it by camera focus.
 */
function makeBloomPass(size: THREE.Vector2): UnrealBloomPass {
  return new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, size.x), Math.max(1, size.y)),
    0.18, 0.28, 0.9,
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
  const onboardPost = createOnboardPostPass();
  composer.addPass(onboardPost);
  composer.addPass(new OutputPass());
  return { composer, bloom, renderPass, onboardPost };
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
 * Apply per-frame cinema uniforms: exposure, bloom, star dome, onboard post
 * gate (V18), then render.
 */
export function renderCinema(
  bundle: CinemaBundle,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  opts: {
    camAltKm: number;
    burning: boolean;
    brownout: number;
    phase?: string;
    /** CameraDirector focus — gates fin/gridfin onboard look. */
    focus?: string;
  },
): void {
  renderer.toneMappingExposure = cinemaExposure(opts.camAltKm);
  bundle.bloom.strength = cinemaBloomStrength(opts.camAltKm, opts.burning, opts.phase);
  bundle.bloom.threshold = cinemaBloomThreshold(opts.camAltKm);
  bundle.onboardPost.enabled = onboardPostEnabled(opts.focus);
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

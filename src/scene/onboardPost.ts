/**
 * Visual V18 — onboard-cam post (fin + gridfin only).
 *
 * Mild barrel (fisheye-ish) distortion only. Grain / dirt overlays were too
 * hazy on hull-style mounts (gridfin). Theater-grade; scrub-safe.
 * Hull keeps the wide FOV from V13 but does **not** get this pass.
 *
 * @see docs/VISUAL_REALISM.md — V18
 */

import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

/** Mild barrel strength — keep in a narrow band so tests can pin it. */
export const ONBOARD_BARREL_STRENGTH = 0.12;
/** Grain mix amount (0..1). Off — hashed grain read as a hazy film. */
export const ONBOARD_GRAIN_STRENGTH = 0;
/** Dirt overlay opacity. Off with grain. */
export const ONBOARD_DIRT_STRENGTH = 0;

/**
 * True when the cinema stack should apply the onboard look.
 * Fin + gridfin only — not hull, trench, chase, Earth, Free, etc.
 */
export function onboardPostEnabled(focus: string | undefined): boolean {
  return focus === "fin" || focus === "gridfin";
}

/**
 * Barrel strength used by the shader (exported so tests can lock the band).
 */
export function onboardBarrelStrength(): number {
  return ONBOARD_BARREL_STRENGTH;
}

function paintDirtOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  // Soft vignette corners + sparse smudges (static — scrub-safe).
  const g = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.2, w * 0.5, h * 0.5, w * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.7, "rgba(0,0,0,0.05)");
  g.addColorStop(1, "rgba(12,10,8,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const x = ((i * 53) % w);
    const y = ((i * 97) % h);
    const r = 1 + (i % 5);
    const a = 0.04 + (i % 4) * 0.03;
    ctx.fillStyle = `rgba(30, 28, 24, ${a})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 2, r, (i % 6) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // A few hair-line scratches near the frame edge.
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.03 + (i % 3) * 0.02})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const y = 8 + i * (h / 7);
    ctx.moveTo(4, y);
    ctx.lineTo(w * 0.18, y + (i % 2) * 4 - 2);
    ctx.stroke();
  }
}

function makeDirtTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  paintDirtOverlay(canvas.getContext("2d")!, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** GLSL shader: barrel + grain + dirt. Grain hashed from UV (scrub-safe). */
export const OnboardCamShader = {
  name: "OnboardCamShader",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDirt: { value: null as THREE.Texture | null },
    barrel: { value: ONBOARD_BARREL_STRENGTH },
    grain: { value: ONBOARD_GRAIN_STRENGTH },
    dirt: { value: ONBOARD_DIRT_STRENGTH },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDirt;
    uniform float barrel;
    uniform float grain;
    uniform float dirt;
    varying vec2 vUv;

    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv * 2.0 - 1.0;
      float r2 = dot(uv, uv);
      // Mild barrel: pull mid-frame out slightly (webcast hull-cam feel).
      uv *= 1.0 + barrel * r2;
      vec2 sampleUv = uv * 0.5 + 0.5;
      // Edge clamp — avoid wrap artifacts outside the distorted disc.
      sampleUv = clamp(sampleUv, 0.0, 1.0);

      vec4 base = texture2D(tDiffuse, sampleUv);
      float n = hash21(vUv * 1024.0);
      vec3 gcol = base.rgb + (n - 0.5) * grain;
      vec4 dirtSample = texture2D(tDirt, vUv);
      vec3 mixed = mix(gcol, gcol * (1.0 - dirtSample.a * 0.85), dirt);
      mixed = mix(mixed, dirtSample.rgb, dirt * dirtSample.a * 0.35);
      gl_FragColor = vec4(mixed, base.a);
    }
  `,
};

/**
 * Build the onboard ShaderPass (disabled by default; enable per frame).
 */
export function createOnboardPostPass(): ShaderPass {
  const pass = new ShaderPass(OnboardCamShader);
  pass.uniforms["tDirt"]!.value = makeDirtTexture();
  pass.uniforms["barrel"]!.value = ONBOARD_BARREL_STRENGTH;
  pass.uniforms["grain"]!.value = ONBOARD_GRAIN_STRENGTH;
  pass.uniforms["dirt"]!.value = ONBOARD_DIRT_STRENGTH;
  pass.enabled = false;
  return pass;
}

/**
 * Visual V19 — altitude-gated LEO cloud shell + ocean sun-glint.
 *
 * Issue #14 removed the procedural globe cloud deck so Earth-cam keeps NASA
 * Blue Marble land/ocean. Hull / fin / gridfin / chase at LEO still need
 * broken cloud depth and a glitter path. This shell is **hidden** for
 * Earth-cam and pad cameras — not a full-sphere overlay and not volumetric
 * Mie.
 *
 * Scene unit = 1 km. Scrub-safe (camera altitude + focus, not wall-clock).
 *
 * @see docs/VISUAL_REALISM.md — V19
 */

import * as THREE from "three";
import { R_EARTH } from "../physics/constants";
import { altitudeFade } from "./cinema";
import { applyWgs84ToGeometry } from "./wgs84Mesh";

/** Named root for tests + scene queries. */
export const LEO_CLOUDS_GROUP = "leo-clouds";
export const LEO_CLOUD_MESH = "leo-cloud-shell";
export const LEO_GLITTER_MESH = "leo-ocean-glitter";

/**
 * Camera focuses that may show the LEO shell. Earth-cam / pad / system
 * views stay on cloudless Blue Marble (#14).
 */
export const LEO_CLOUD_FOCUSES = [
  "hull",
  "fin",
  "gridfin",
  "engines",
  "enginesDown",
  "chase",
] as const;

/** Fade in just above the ~51 km shell so pad/ascent stay inside and FrontSide-culled. */
export const LEO_CLOUD_FADE_IN_KM = 55;
/** Full deck from typical SECO / coast. */
export const LEO_CLOUD_FULL_LOW_KM = 110;
/** Stay full through LEO; fade before Earth-cam framing distances. */
export const LEO_CLOUD_FULL_HIGH_KM = 500;
export const LEO_CLOUD_FADE_OUT_KM = 2200;

/** Peak material opacity — broken deck, not a white blanket. */
export const LEO_CLOUD_PEAK_OPACITY = 0.58;
/** Glitter is a tight sun-path, quieter than the deck. */
export const LEO_GLITTER_SCALE = 0.7;

/** Cloud shell ~51 km AGL (same radius as the retired globe deck). */
export const LEO_CLOUD_RADIUS = R_EARTH * 1.008;
/** Glitter sits closer to the ocean surface. */
export const LEO_GLITTER_RADIUS = R_EARTH * 1.0015;

const VISIBLE_EPS = 0.02;

export type LeoClouds = {
  group: THREE.Group;
  clouds: THREE.Mesh;
  glitter: THREE.Mesh;
};

export type LeoCloudsFrame = {
  /** CameraDirector focus — gates hull/fin/chase vs Earth-cam / pad. */
  focus?: string;
  /** Camera altitude above mean Earth surface (km). */
  camAltKm: number;
  /** Unit Earth → Sun in world space. */
  sunDir: { x: number; y: number; z: number };
};

/**
 * True when this camera focus is allowed to see the LEO shell.
 */
export function leoCloudsFocusEnabled(focus: string | undefined): boolean {
  return (
    focus === "hull" ||
    focus === "fin" ||
    focus === "gridfin" ||
    focus === "engines" ||
    focus === "enginesDown" ||
    focus === "chase"
  );
}

/**
 * Cloud-shell opacity in [0, 1] from Earth AGL + camera focus.
 * Zero for Earth-cam / pad / non-finite altitude so #14 stands.
 */
export function leoCloudOpacity(camAltKm: number, focus?: string): number {
  if (!leoCloudsFocusEnabled(focus)) return 0;
  if (!Number.isFinite(camAltKm) || camAltKm < 0) return 0;
  const fadeIn = 1 - altitudeFade(camAltKm, LEO_CLOUD_FADE_IN_KM, LEO_CLOUD_FULL_LOW_KM);
  const fadeOut = altitudeFade(camAltKm, LEO_CLOUD_FULL_HIGH_KM, LEO_CLOUD_FADE_OUT_KM);
  return fadeIn * fadeOut;
}

/**
 * Ocean glitter opacity in [0, 1] — same gate, scaled quieter than the deck.
 */
export function leoGlitterOpacity(camAltKm: number, focus?: string): number {
  return leoCloudOpacity(camAltKm, focus) * LEO_GLITTER_SCALE;
}

/** Seeded LCG so the deck is identical across reloads (scrub-stable look). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function lonLatToXy(lon: number, lat: number, w: number, h: number): [number, number] {
  return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
}

function cloudStops(g: CanvasGradient, a: number): void {
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(0.35, `rgba(248,250,255,${a * 0.68})`);
  g.addColorStop(0.72, `rgba(255,255,255,${a * 0.22})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
}

function fillCloudEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  a: number,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  cloudStops(g, a);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function paintCloudCell(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number,
): void {
  const lon = -180 + rng() * 360;
  const lat = -52 + rng() * 104;
  const [x, y] = lonLatToXy(lon, lat, w, h);
  fillCloudEllipse(
    ctx, x, y,
    (0.028 + rng() * 0.11) * w,
    (0.01 + rng() * 0.045) * h,
    (rng() - 0.5) * 1.15,
    0.18 + rng() * 0.48,
  );
}

function paintCloudCells(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  for (let i = 0; i < 78; i++) paintCloudCell(ctx, w, h, rng);
}

function paintHighlight(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  const lon = -180 + rng() * 360;
  const lat = -38 + rng() * 76;
  const [x, y] = lonLatToXy(lon, lat, w, h);
  fillCloudEllipse(
    ctx, x, y,
    (0.012 + rng() * 0.04) * w,
    (0.006 + rng() * 0.02) * h,
    (rng() - 0.5) * 0.8,
    0.12 + rng() * 0.22,
  );
}

function paintHighlights(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  for (let i = 0; i < 28; i++) paintHighlight(ctx, w, h, rng);
}

function paintItczBand(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  const y = h * (0.42 + rng() * 0.16);
  const g = ctx.createLinearGradient(0, y - 10, 0, y + 10);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, `rgba(255,255,255,${0.08 + rng() * 0.1})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 12, w, 24);
}

function paintItczBands(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  for (let i = 0; i < 7; i++) paintItczBand(ctx, w, h, rng);
}

/**
 * Broken white cloud deck (transparent background). Seeded — not Math.random.
 */
export function makeLeoCloudTexture(size = 1024): HTMLCanvasElement {
  const w = size;
  const h = Math.round(size / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const rng = makeRng(0x1e0c10d);
  paintCloudCells(ctx, w, h, rng);
  paintHighlights(ctx, w, h, rng);
  paintItczBands(ctx, w, h, rng);
  return canvas;
}

function makeCloudMap(size: number): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(makeLeoCloudTexture(size));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.needsUpdate = true;
  return map;
}

function makeCloudMaterial(map: THREE.CanvasTexture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    roughness: 0.94,
    metalness: 0,
    side: THREE.FrontSide,
  });
}

function makeCloudMesh(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(LEO_CLOUD_RADIUS, 64, 48);
  applyWgs84ToGeometry(geo);
  const mesh = new THREE.Mesh(
    geo,
    makeCloudMaterial(makeCloudMap(1024)),
  );
  mesh.name = LEO_CLOUD_MESH;
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  return mesh;
}

const GLITTER_VERTEX = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const GLITTER_FRAGMENT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uSunDir;
  uniform float uOpacity;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    if (uOpacity < 0.004) discard;
    vec3 n = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 sun = normalize(uSunDir);
    float day = smoothstep(-0.05, 0.35, dot(n, sun));
    vec3 reflected = reflect(-sun, n);
    float spec = pow(max(0.0, dot(reflected, viewDir)), 52.0);
    float streak = pow(max(0.0, dot(reflected, viewDir)), 12.0) * 0.22;
    float a = (spec + streak) * day * uOpacity;
    if (a < 0.003) discard;
    vec3 col = mix(vec3(0.55, 0.72, 0.95), vec3(0.95, 0.98, 1.0), spec);
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
    #include <logdepthbuf_fragment>
  }
`;

function makeGlitterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: 0 },
    },
    vertexShader: GLITTER_VERTEX,
    fragmentShader: GLITTER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
  });
}

function makeGlitterMesh(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(LEO_GLITTER_RADIUS, 64, 48);
  applyWgs84ToGeometry(geo);
  const mesh = new THREE.Mesh(geo, makeGlitterMaterial());
  mesh.name = LEO_GLITTER_MESH;
  mesh.renderOrder = 0.5;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * Build the gated LEO cloud + glitter group (parent under Earth's axis).
 * Starts hidden; {@link updateLeoClouds} opens it for LEO hull/fin/chase.
 */
export function createLeoClouds(): LeoClouds {
  const group = new THREE.Group();
  group.name = LEO_CLOUDS_GROUP;
  group.visible = false;
  const glitter = makeGlitterMesh();
  const clouds = makeCloudMesh();
  group.add(glitter, clouds);
  return { group, clouds, glitter };
}

function applyCloudOpacity(clouds: THREE.Mesh, opacity: number): void {
  const mat = clouds.material as THREE.MeshStandardMaterial;
  mat.opacity = opacity * LEO_CLOUD_PEAK_OPACITY;
  clouds.visible = opacity > VISIBLE_EPS;
}

function applyGlitterFrame(
  glitter: THREE.Mesh,
  opacity: number,
  sunDir: LeoCloudsFrame["sunDir"],
): void {
  const mat = glitter.material as THREE.ShaderMaterial;
  mat.uniforms.uOpacity!.value = opacity;
  const u = mat.uniforms.uSunDir!.value as THREE.Vector3;
  u.set(sunDir.x, sunDir.y, sunDir.z);
  glitter.visible = opacity > VISIBLE_EPS;
}

/**
 * Per-frame gate: hide on Earth-cam / pad / deep space; show a broken deck
 * from LEO hull/fin/chase. Sun dir drives the ocean glitter path.
 */
export function updateLeoClouds(leo: LeoClouds, frame: LeoCloudsFrame): void {
  const cloudA = leoCloudOpacity(frame.camAltKm, frame.focus);
  const glitterA = leoGlitterOpacity(frame.camAltKm, frame.focus);
  const on = cloudA > VISIBLE_EPS || glitterA > VISIBLE_EPS;
  leo.group.visible = on;
  if (!on) return;
  applyCloudOpacity(leo.clouds, cloudA);
  applyGlitterFrame(leo.glitter, glitterA, frame.sunDir);
}

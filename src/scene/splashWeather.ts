/**
 * Splash-zone sea state + puffy weather deck for Flight 13.
 *
 * Local to the Indian Ocean site plate — not a globe cloud overlay (V19 / #14
 * stay). Vertex swell is scrub-deterministic from mission time; fragment
 * ripples add water texture the 80 km plate cannot tessellate. Cumulus sits
 * at {@link WEATHER_CLOUD_ALT_KM} so the ship falls through on terminal
 * descent and the recovery drone still has clouds overhead.
 *
 * Scene unit = 1 km.
 *
 * @see terminalFx.ts — opacity / swell helpers
 * @see terminalSiteFx.ts — site parenting
 * @see docs/VISUAL_REALISM.md — V21
 */

import * as THREE from "three";
import { EARTH_SURFACE_RADIUS_KM } from "../physics/constants";
import { drapePlatePoint } from "./starbasePlate";
import {
  OCEAN_CHOP_AMP_KM,
  OCEAN_SWELL_AMP_KM,
  WEATHER_CLOUD_ALT_KM,
} from "./terminalFx";

export const SPLASH_OCEAN_MESH = "splash-ocean-plate";
export const SPLASH_OCEAN_CHOP_MESH = "splash-ocean-chop";
export const SPLASH_WEATHER_CLOUDS = "splash-weather-clouds";

/** Outer sunlit plate — fills the recovery-drone horizon. */
export const SPLASH_OCEAN_RADIUS_KM = 80;
/** Inner chop plate — tessellated enough for ~0.6 km waves. */
export const SPLASH_OCEAN_CHOP_RADIUS_KM = 10;

const OUTER_SEGS = 48;
const CHOP_SEGS = 72;
const VISIBLE_EPS = 0.02;

export type SplashOcean = {
  group: THREE.Group;
  setFrame: (opacity: number, missionT: number) => void;
};

export type WeatherClouds = {
  group: THREE.Group;
  setOpacity: (opacity: number) => void;
};

/** Seeded LCG so sea / clouds are identical across reloads. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function paintSeaBase(
  ctx: CanvasRenderingContext2D,
  size: number,
  cx: number,
  cy: number,
  r: number,
): void {
  const g = ctx.createRadialGradient(cx, cy, r * 0.06, cx, cy, r);
  g.addColorStop(0, "rgba(78, 142, 168, 1)");
  g.addColorStop(0.22, "rgba(58, 122, 150, 0.98)");
  g.addColorStop(0.52, "rgba(42, 102, 132, 0.94)");
  g.addColorStop(0.78, "rgba(30, 78, 108, 0.58)");
  g.addColorStop(1, "rgba(18, 52, 76, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function paintSeaMottle(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
): void {
  ctx.globalCompositeOperation = "overlay";
  for (let i = 0; i < 56; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rx = (0.035 + rng() * 0.11) * size;
    const ry = rx * (0.35 + rng() * 0.5);
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    const light = rng() > 0.42;
    g.addColorStop(
      0,
      light ? "rgba(186, 224, 236, 0.42)" : "rgba(16, 44, 64, 0.4)",
    );
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintSwellBand(
  ctx: CanvasRenderingContext2D,
  size: number,
  band: number,
  i: number,
  n: number,
): void {
  const angle = 0.18 + band * 0.41;
  const y0 = ((i + 0.28) / n) * size;
  const light = (i + band) % 2 === 0;
  ctx.strokeStyle = light ? "rgba(228, 246, 255, 0.28)" : "rgba(22, 52, 72, 0.2)";
  ctx.lineWidth = size * (0.007 + band * 0.002);
  ctx.beginPath();
  ctx.moveTo(0, y0);
  for (let x = 0; x <= size; x += 6) {
    const wobble =
      Math.sin(x * 0.055 + i * 0.7 + band) * size * 0.012 +
      Math.sin(x * 0.13 + band * 2) * size * 0.005;
    const y = y0 + Math.sin(angle) * (x - size * 0.5) * 0.08 + wobble;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function paintSeaSwell(
  ctx: CanvasRenderingContext2D,
  size: number,
): void {
  ctx.globalCompositeOperation = "soft-light";
  for (let band = 0; band < 3; band++) {
    const n = 20 + band * 10;
    for (let i = 0; i < n; i++) paintSwellBand(ctx, size, band, i, n);
  }
}

function paintFoamFleck(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
): void {
  const x = rng() * size;
  const y = rng() * size;
  const len = (0.018 + rng() * 0.05) * size;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rng() - 0.5) * 0.8);
  ctx.strokeStyle = `rgba(236, 248, 255, ${0.12 + rng() * 0.18})`;
  ctx.lineWidth = 1 + rng() * 1.4;
  ctx.beginPath();
  ctx.moveTo(-len * 0.5, 0);
  ctx.quadraticCurveTo(0, (rng() - 0.5) * 3, len * 0.5, 0);
  ctx.stroke();
  ctx.restore();
}

function paintSeaFoam(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
): void {
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 90; i++) paintFoamFleck(ctx, size, rng);
}

function paintSeaEdgeFade(
  ctx: CanvasRenderingContext2D,
  size: number,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.globalCompositeOperation = "destination-in";
  const a = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  a.addColorStop(0, "rgba(0,0,0,1)");
  a.addColorStop(0.58, "rgba(0,0,0,0.94)");
  a.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
}

/** Sky-reflected morning sea with swell bands and foam flecks. */
export function paintSunlitOcean(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.5;
  const rng = makeRng(0x5ea1e55);
  paintSeaBase(ctx, size, cx, cy, r);
  paintSeaMottle(ctx, size, rng);
  paintSeaSwell(ctx, size);
  paintSeaFoam(ctx, size, rng);
  paintSeaEdgeFade(ctx, size, cx, cy, r);
}

function paintRipplePixel(
  data: Uint8ClampedArray,
  i: number,
  j: number,
  size: number,
): void {
  const u = i / size;
  const v = j / size;
  const twoPi = Math.PI * 2;
  const h =
    0.5 +
    0.22 * Math.sin(u * twoPi * 4) * Math.sin(v * twoPi * 3) +
    0.16 * Math.sin(u * twoPi * 7 + v * twoPi * 2) +
    0.1 * Math.sin(v * twoPi * 11 + u * twoPi);
  const k = (j * size + i) * 4;
  const g = Math.round(Math.max(0, Math.min(1, h)) * 255);
  data[k] = g;
  data[k + 1] = g;
  data[k + 2] = g;
  data[k + 3] = 255;
}

/** Seamless wavelet tile (integer cycles) for repeating near-field chop. */
function paintRippleTile(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) paintRipplePixel(img.data, i, j, size);
  }
  ctx.putImageData(img, 0, 0);
}

function makeCanvasTex(
  size: number,
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeat: boolean,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext("2d")!, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  if (repeat) {
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
  }
  map.needsUpdate = true;
  return map;
}

const OCEAN_VERTEX = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec2 restXZ;
  uniform float uTime;
  uniform float uChop;
  varying vec2 vRestXZ;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  float swell(vec2 p, float t) {
    float a = sin(p.x * 0.22 + p.y * 0.14 + t * 0.65);
    float b = sin(p.x * -0.16 + p.y * 0.25 + t * 0.88);
    float c = sin(p.x * 0.41 + p.y * -0.11 + t * 1.15);
    return (a + b * 0.55 + c * 0.28) * ${OCEAN_SWELL_AMP_KM.toFixed(6)};
  }

  float chop(vec2 p, float t) {
    float a = sin(p.x * 10.4 + p.y * 7.1 + t * 1.45);
    float b = sin(p.x * -8.2 + p.y * 12.6 + t * 1.9);
    return (a + b * 0.64) * ${OCEAN_CHOP_AMP_KM.toFixed(6)};
  }

  void main() {
    vRestXZ = restXZ;
    float h = swell(restXZ, uTime) + uChop * chop(restXZ, uTime);
    vec3 n = normalize(normal);
    vec3 pos = position + n * h;
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const OCEAN_FRAGMENT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform sampler2D uRipple;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vRestXZ;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    if (uOpacity < 0.004) discard;
    vec2 mapUv = vRestXZ / ${(SPLASH_OCEAN_RADIUS_KM * 2).toFixed(1)} + 0.5;
    vec4 sea = texture2D(uMap, mapUv);
    if (sea.a < 0.01) discard;

    vec2 ruv = vRestXZ * 12.5 + vec2(uTime * 0.035, -uTime * 0.022);
    float rip = texture2D(uRipple, ruv).r;
    vec2 ruv2 = vRestXZ * 7.4 + vec2(-uTime * 0.018, uTime * 0.028);
    float rip2 = texture2D(uRipple, ruv2).r;
    float chop = (rip - 0.5) * 0.55 + (rip2 - 0.5) * 0.35;

    vec3 n = normalize(vWorldNormal);
    n = normalize(n + vec3(chop * 0.45, 0.0, chop * 0.35));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float ndv = max(0.0, dot(n, viewDir));
    float fresnel = pow(1.0 - ndv, 3.2);
    float spec = pow(max(0.0, dot(reflect(-viewDir, n), viewDir)), 28.0);
    float sparkle = pow(max(0.0, chop + 0.15), 5.0) * 0.55;

    vec3 deep = sea.rgb * vec3(0.92, 0.96, 1.02);
    vec3 sky = vec3(0.78, 0.88, 0.98);
    vec3 foam = vec3(0.9, 0.95, 1.0);
    vec3 col = mix(deep, sky, fresnel * 0.42);
    col = mix(col, foam, sparkle * 0.35);
    col += vec3(0.85, 0.93, 1.0) * spec * 0.22;
    col += vec3(chop * 0.08);

    gl_FragColor = vec4(col, sea.a * uOpacity);
    #include <logdepthbuf_fragment>
  }
`;

function makeOceanMaterial(
  map: THREE.CanvasTexture,
  ripple: THREE.CanvasTexture,
  chop: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uRipple: { value: ripple },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uChop: { value: chop },
    },
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: true,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  });
}

function drapeOceanGeometry(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute("position");
  if (!pos) return;
  const rest = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    rest[i * 2] = x;
    rest[i * 2 + 1] = z;
    const p = drapePlatePoint(x, z, EARTH_SURFACE_RADIUS_KM);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.setAttribute("restXZ", new THREE.BufferAttribute(rest, 2));
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function makeOceanMesh(
  name: string,
  radiusKm: number,
  segs: number,
  mat: THREE.ShaderMaterial,
  yKm: number,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radiusKm * 2, radiusKm * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  drapeOceanGeometry(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.position.y = yKm;
  mesh.renderOrder = 1;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mat.userData.noShadow = true;
  return mesh;
}

/**
 * Sunlit splash sea: wide textured plate + inner chop mesh.
 * Starts hidden; {@link SplashOcean.setFrame} opens it near the surface.
 */
export function createSplashOcean(): SplashOcean {
  const group = new THREE.Group();
  group.name = "splash-ocean";
  const map = makeCanvasTex(512, paintSunlitOcean, false);
  const ripple = makeCanvasTex(128, paintRippleTile, true);
  const outerMat = makeOceanMaterial(map, ripple, 0);
  const chopMat = makeOceanMaterial(map, ripple, 1);
  const outer = makeOceanMesh(
    SPLASH_OCEAN_MESH, SPLASH_OCEAN_RADIUS_KM, OUTER_SEGS, outerMat, 0.001,
  );
  const chop = makeOceanMesh(
    SPLASH_OCEAN_CHOP_MESH, SPLASH_OCEAN_CHOP_RADIUS_KM, CHOP_SEGS, chopMat, 0.0014,
  );
  group.add(outer, chop);
  group.visible = false;
  return {
    group,
    setFrame(opacity, missionT) {
      const on = opacity > VISIBLE_EPS;
      group.visible = on;
      outer.visible = on;
      chop.visible = on;
      if (!on) return;
      const t = Number.isFinite(missionT) ? missionT : 0;
      outerMat.uniforms.uOpacity!.value = opacity;
      outerMat.uniforms.uTime!.value = t;
      chopMat.uniforms.uOpacity!.value = opacity;
      chopMat.uniforms.uTime!.value = t;
    },
  };
}

function paintCumulusLobe(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
): void {
  const x = size * (0.32 + rng() * 0.36);
  const y = size * (0.34 + rng() * 0.3);
  const rx = size * (0.14 + rng() * 0.18);
  const ry = rx * (0.62 + rng() * 0.28);
  const g = ctx.createRadialGradient(x, y - ry * 0.15, rx * 0.08, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(255,255,255,${0.72 + rng() * 0.22})`);
  g.addColorStop(0.4, `rgba(236, 242, 248,${0.42 + rng() * 0.18})`);
  g.addColorStop(0.78, `rgba(210, 220, 230,${0.12 + rng() * 0.1})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, (rng() - 0.5) * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function paintCumulusBase(
  ctx: CanvasRenderingContext2D,
  size: number,
): void {
  const g = ctx.createRadialGradient(
    size * 0.5, size * 0.62, size * 0.04,
    size * 0.5, size * 0.58, size * 0.42,
  );
  g.addColorStop(0, "rgba(228, 234, 240, 0.55)");
  g.addColorStop(0.55, "rgba(200, 210, 220, 0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.6, size * 0.4, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Irregular multi-lobe cumulus impostor (transparent background). */
function paintCumulusPuff(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  ctx.clearRect(0, 0, size, size);
  const rng = makeRng(seed);
  paintCumulusBase(ctx, size);
  const lobes = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < lobes; i++) paintCumulusLobe(ctx, size, rng);
}

function makePuffMaps(): THREE.CanvasTexture[] {
  return [0xc10d01, 0xc10d02, 0xc10d03, 0xc10d04].map((seed) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    paintCumulusPuff(canvas.getContext("2d")!, 256, seed);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    return map;
  });
}

function puffMaterial(map: THREE.CanvasTexture, opacity: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
    alphaTest: 0.08,
  });
}

type PuffMat = { mat: THREE.SpriteMaterial; base: number };

function addPuffSprite(
  group: THREE.Group,
  mats: PuffMat[],
  maps: readonly THREE.CanvasTexture[],
  rng: () => number,
  x: number,
  y: number,
  z: number,
): void {
  const map = maps[Math.floor(rng() * maps.length)]!;
  const base = 0.42 + rng() * 0.28;
  const mat = puffMaterial(map, 0);
  mats.push({ mat, base });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, y, z);
  const w = 2.2 + rng() * 5.4;
  const h = w * (0.42 + rng() * 0.28);
  sprite.scale.set(w, h, 1);
  sprite.renderOrder = 3;
  sprite.castShadow = false;
  sprite.receiveShadow = false;
  group.add(sprite);
}

function addCloudCluster(
  group: THREE.Group,
  mats: PuffMat[],
  maps: readonly THREE.CanvasTexture[],
  rng: () => number,
  cx: number,
  cz: number,
  alt: number,
): void {
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    addPuffSprite(
      group, mats, maps, rng,
      cx + (rng() - 0.5) * 2.4,
      alt + (rng() - 0.45) * 0.7,
      cz + (rng() - 0.5) * 2.4,
    );
  }
}

function ringCluster(
  rng: () => number,
  r0: number,
  r1: number,
): { x: number; z: number } {
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(r0 * r0 + rng() * (r1 * r1 - r0 * r0));
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function scatterWeatherClouds(
  group: THREE.Group,
  mats: PuffMat[],
  maps: readonly THREE.CanvasTexture[],
): void {
  const rng = makeRng(0x2c10d13);
  for (let i = 0; i < 10; i++) {
    const p = ringCluster(rng, 0.6, 6.5);
    const alt = WEATHER_CLOUD_ALT_KM + (rng() - 0.4) * 0.9;
    addCloudCluster(group, mats, maps, rng, p.x, p.z, alt);
  }
  for (let i = 0; i < 28; i++) {
    const p = ringCluster(rng, 8, 58);
    const alt = WEATHER_CLOUD_ALT_KM + (rng() - 0.35) * 1.4;
    addCloudCluster(group, mats, maps, rng, p.x, p.z, alt);
  }
}

/**
 * Broken cumulus field at weather altitude around the splash site.
 * Corridor puffs sit on the descent path so the ship falls through.
 */
export function createWeatherClouds(): WeatherClouds {
  const group = new THREE.Group();
  group.name = SPLASH_WEATHER_CLOUDS;
  group.visible = false;
  const maps = makePuffMaps();
  const mats: PuffMat[] = [];
  scatterWeatherClouds(group, mats, maps);
  return {
    group,
    setOpacity(opacity) {
      const on = opacity > VISIBLE_EPS;
      group.visible = on;
      if (!on) return;
      for (const m of mats) m.mat.opacity = m.base * opacity;
    },
  };
}

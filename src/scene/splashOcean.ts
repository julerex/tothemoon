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
import { EARTH_SURFACE_ALT_KM } from "../physics/constants";
import { FLIGHT13_SPLASH_LAT } from "../physics/flight13Corridor";
import { geocentricRadiusAt } from "../physics/wgs84";
import { drapePlatePoint } from "./starbasePlate";
import {
  OCEAN_CHOP_AMP_KM,
  OCEAN_SWELL_AMP_KM,
} from "./terminalFx";
import { paintRippleTile, paintSunlitOcean } from "./splashOceanPaint";
export { paintSunlitOcean } from "./splashOceanPaint";

export const SPLASH_OCEAN_MESH = "splash-ocean-plate";
export const SPLASH_OCEAN_CHOP_MESH = "splash-ocean-chop";

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
    const p = drapePlatePoint(x, z, geocentricRadiusAt(FLIGHT13_SPLASH_LAT, EARTH_SURFACE_ALT_KM));
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

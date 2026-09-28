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
 * @see terminalFx.ts — opacity / sun-path helpers
 * @see terminalSiteFx.ts — site parenting
 * @see docs/VISUAL_REALISM.md — V21 sea state, V28 sun path, V29 crest foam
 */

import * as THREE from "three";
import { EARTH_SURFACE_ALT_KM } from "../physics/constants";
import { SPLASH_WATERLINE_ALT_KM } from "../physics/flight13Attitude";
import { geocentricRadiusAt } from "../physics/wgs84";
import { drapePlatePoint } from "./starbasePlate";
import { splashOceanShaders } from "./oceanWaves";
import type { Vec3Like } from "./sunLight";
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
const sea = splashOceanShaders(SPLASH_OCEAN_RADIUS_KM);

export type SplashOcean = {
  group: THREE.Group;
  /**
   * @param sunDir - Unit Earth→Sun (same vector as `applySunLight`). Omitted
   *   keeps the previous direction.
   */
  setFrame: (opacity: number, missionT: number, sunDir?: Vec3Like) => void;
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

function makeOceanMaterial(
  map: THREE.CanvasTexture,
  ripple: THREE.CanvasTexture,
  chop: number,
  feather: number,
  sunDir: THREE.Vector3,
  up: THREE.Vector3,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uRipple: { value: ripple },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uChop: { value: chop },
      uFeather: { value: feather },
      uSunDir: { value: sunDir },
      uUp: { value: up },
    },
    vertexShader: sea.vertex,
    fragmentShader: sea.fragment,
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

function drapeOceanGeometry(geo: THREE.BufferGeometry, radiusKm: number): void {
  const pos = geo.getAttribute("position");
  if (!pos) return;
  const rest = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    rest[i * 2] = x;
    rest[i * 2 + 1] = z;
    const p = drapePlatePoint(x, z, radiusKm);
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
  drapeRadiusKm: number,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radiusKm * 2, radiusKm * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  drapeOceanGeometry(geo, drapeRadiusKm);
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
function bindPlateUp(mesh: THREE.Mesh, up: THREE.Vector3, q: THREE.Quaternion): void {
  mesh.onBeforeRender = () => {
    mesh.getWorldQuaternion(q);
    up.set(0, 1, 0).applyQuaternion(q);
  };
}

export function createSplashOcean(latRad = 0): SplashOcean {
  const group = new THREE.Group();
  group.name = "splash-ocean";
  const drapeRadiusKm = geocentricRadiusAt(latRad, EARTH_SURFACE_ALT_KM);
  const map = makeCanvasTex(512, paintSunlitOcean, false);
  const ripple = makeCanvasTex(128, paintRippleTile, true);
  const sunDir = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const upQuat = new THREE.Quaternion();
  const outerMat = makeOceanMaterial(map, ripple, 0, 1, sunDir, up);
  const chopMat = makeOceanMaterial(map, ripple, 1, 0, sunDir, up);
  const outer = makeOceanMesh(
    SPLASH_OCEAN_MESH, SPLASH_OCEAN_RADIUS_KM, OUTER_SEGS, outerMat,
    SPLASH_WATERLINE_ALT_KM - 0.0004, drapeRadiusKm,
  );
  const chop = makeOceanMesh(
    SPLASH_OCEAN_CHOP_MESH, SPLASH_OCEAN_CHOP_RADIUS_KM, CHOP_SEGS, chopMat,
    SPLASH_WATERLINE_ALT_KM, drapeRadiusKm,
  );
  bindPlateUp(outer, up, upQuat);
  bindPlateUp(chop, up, upQuat);
  group.add(outer, chop);
  group.visible = false;
  return {
    group,
    setFrame(opacity, missionT, sun) {
      const on = opacity > VISIBLE_EPS;
      group.visible = on;
      outer.visible = on;
      chop.visible = on;
      if (
        sun
        && Number.isFinite(sun.x)
        && Number.isFinite(sun.y)
        && Number.isFinite(sun.z)
      ) {
        sunDir.set(sun.x, sun.y, sun.z);
        if (sunDir.lengthSq() > 1e-12) sunDir.normalize();
        else sunDir.set(1, 0, 0);
      }
      if (!on) return;
      const t = Number.isFinite(missionT) ? missionT : 0;
      outerMat.uniforms.uOpacity!.value = opacity;
      outerMat.uniforms.uTime!.value = t;
      chopMat.uniforms.uOpacity!.value = opacity;
      chopMat.uniforms.uTime!.value = t;
    },
  };
}

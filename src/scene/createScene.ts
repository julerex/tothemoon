import * as THREE from "three";
import { A_EM, AU, EARTH_OBLIQUITY } from "../physics/constants";
import {
  earthOrbitPathPoints,
  moonPathThroughSim,
  osculatingMoonOrbitPoints,
} from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import { createFatLine, updateFatLinePositions } from "./fatLines";
import { makeStarTexture } from "./textures";
import type { Line2 } from "three/addons/lines/Line2.js";

export type SceneBundle = {
  scene: THREE.Scene;
  sunLight: THREE.DirectionalLight;
  /** Soft anti-sun fill so night silhouettes stay readable (updated each frame). */
  fillLight: THREE.DirectionalLight;
  /** Dim Earth-reflected light on the Moon (updated each frame). */
  earthshine: THREE.DirectionalLight;
  /** Ecliptic grids + Earth path (+ Moon trail added in main) — toggle with O */
  orbitGroup: THREE.Group;
};

function styleGrid(grid: THREE.GridHelper, opacity: number): void {
  grid.renderOrder = -1;
  const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const mat of mats) {
    mat.transparent = true;
    mat.opacity = opacity;
    mat.depthWrite = false;
  }
}

/**
 * Ecliptic plane (XY) — fine grid for the cislunar theater.
 */
function createEclipticGridNear(): THREE.GridHelper {
  const size = A_EM * 3;
  const divisions = 30;
  const grid = new THREE.GridHelper(size, divisions, 0x6e6e7a, 0x3a3a48);
  grid.rotation.x = Math.PI / 2;
  styleGrid(grid, 0.4);
  return grid;
}

/**
 * Same ecliptic plane, coarser and sized out to ~1 AU past Earth's orbit
 * (Sun at origin) without drowning the cislunar view in fine lines.
 */
function createEclipticGridTowardSun(): THREE.GridHelper {
  // Full width 2.2 AU → past Earth's orbit on either side of the Sun
  const size = AU * 2.2;
  const divisions = 22;
  const grid = new THREE.GridHelper(size, divisions, 0x555566, 0x2a2a38);
  grid.rotation.x = Math.PI / 2;
  styleGrid(grid, 0.2);
  return grid;
}

/**
 * Moon’s actual heliocentric location over the mission window (solid blue).
 * Built from bodyPositions so Horizons and analytic fallback stay consistent.
 */
export function createMoonPathThroughSim(
  durationS: number,
  samples = 640,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): THREE.Object3D {
  const pts = moonPathThroughSim(durationS, epoch, samples);
  const vecs = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const line = createFatLine(vecs, {
    color: 0x4aa3ff,
    opacity: 0.75,
    linewidth: 2.75,
  });
  line.name = "moon-path-sim";
  return line;
}

const MOON_REL_ORBIT_SAMPLES = 256;

function ptsToVecs(pts: { x: number; y: number; z: number }[]): THREE.Vector3[] {
  return pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
}

/**
 * Osculating lunar orbit (Earth-relative dashed ring). Parent under the Earth
 * group; call {@link updateMoonRelativeOrbit} each frame so it stays through
 * the Moon as r,v change.
 */
const MOON_REL_ORBIT_OPTS = {
  color: 0x4aa3ff,
  opacity: 0.55,
  linewidth: 2.25,
  dashed: true,
  // Path length ~ 2π·a ≈ 2.4e6 km — dash/gap in km along the path
  dashSize: 12_000,
  gapSize: 10_000,
} as const;

export function createMoonRelativeOrbit(
  t0 = 0,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): Line2 {
  const pts = osculatingMoonOrbitPoints(t0, epoch, MOON_REL_ORBIT_SAMPLES);
  const line = createFatLine(ptsToVecs(pts), { ...MOON_REL_ORBIT_OPTS });
  line.name = "moon-relative-orbit";
  return line;
}

/** Refresh the Earth-relative ring from the osculating state at mission time t. */
export function updateMoonRelativeOrbit(
  line: Line2,
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): void {
  const pts = osculatingMoonOrbitPoints(t, epoch, MOON_REL_ORBIT_SAMPLES);
  const vecs = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  updateFatLinePositions(line, vecs);
}

/**
 * Earth’s orbit around the Sun (origin) — eccentric ecliptic ring (green).
 * Path comes from bodies.earthOrbitPathPoints (Horizons-fitted ellipse).
 */
function createEarthOrbitPath(
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): THREE.Object3D {
  const pts = earthOrbitPathPoints(epoch, 360);
  const vecs = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const line = createFatLine(vecs, {
    color: 0x3ecf7a,
    opacity: 0.55,
    linewidth: 2.5,
  });
  line.name = "earth-orbit-path";
  return line;
}

/**
 * NASA SVS Deep Star Maps 2020 — celestial plate carrée (ICRF/J2000).
 * Map is centered at RA 0h with RA increasing to the left of the image.
 *
 * Three.js SphereGeometry already matches that layout without a U flip when
 * +Y is celestial north and +X is RA 0h (equinox):
 *   u = 0.5 − RA/360,  v = (90° − Dec)/180
 * (geometry u=0.5 → mesh +X; v=0 → mesh +Y).
 */
function applySkyMap(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // No S flip — the previous repeat.x = -1 was wrong once the dome is
  // rotated into the ecliptic frame (it put the galactic center ~60° north).
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  texture.needsUpdate = true;
}

/**
 * Map mesh-local equatorial frame → theater ecliptic J2000 (Horizons).
 *
 * SphereGeometry local: +Y = celestial north, +X = RA 0h, +Z = RA 6h.
 * Theater: +Z = ecliptic north, +X = vernal equinox (same as Horizons ecliptic).
 * Equatorial → ecliptic is a rotation by obliquity about +X after swapping
 * mesh axes (mesh Y,Z) ↔ (eq Z,Y).
 */
function orientStarDomeToEcliptic(stars: THREE.Mesh): void {
  const ε = EARTH_OBLIQUITY;
  const s = Math.sin(ε);
  const c = Math.cos(ε);
  // Row-major: p_ecl = M · p_mesh
  //   x_ecl = x_mesh
  //   y_ecl = sinε · y_mesh + cosε · z_mesh
  //   z_ecl = cosε · y_mesh − sinε · z_mesh
  const m = new THREE.Matrix4().set(1, 0, 0, 0, 0, s, c, 0, 0, c, -s, 0, 0, 0, 0, 1);
  stars.quaternion.setFromRotationMatrix(m);
}

function makeStarDomeMaterial(): THREE.MeshBasicMaterial {
  // Dim the sky map so bodies, trails, and SOI shells read clearly.
  // transparent: V5 cinema fades opacity near pad / during entry brownout.
  return new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    opacity: 1,
    color: 0x555566,
    toneMapped: false,
  });
}

function applyStarMapToMat(mat: THREE.MeshBasicMaterial, tex: THREE.Texture): void {
  applySkyMap(tex);
  mat.map = tex;
  mat.needsUpdate = true;
}

function applyProceduralStarMap(mat: THREE.MeshBasicMaterial): void {
  const starMap = new THREE.CanvasTexture(makeStarTexture(1024));
  starMap.colorSpace = THREE.SRGBColorSpace;
  mat.map = starMap;
  mat.needsUpdate = true;
}

function onStarMapMissing(mat: THREE.MeshBasicMaterial): void {
  console.warn("[tothemoon] NASA star map missing; using procedural fallback");
  applyProceduralStarMap(mat);
}

function loadStarDomeTexture(mat: THREE.MeshBasicMaterial): void {
  const url = `${import.meta.env.BASE_URL}textures/starmap_nasa_svs_2020_4k.jpg`;
  new THREE.TextureLoader().load(
    url, (tex) => applyStarMapToMat(mat, tex), undefined, () => onStarMapMissing(mat),
  );
}

/**
 * Inward-facing sky dome. Prefer NASA Deep Star Maps 2020 (public textures);
 * fall back to a procedural canvas map if the asset is missing.
 */
function createStarDome(): THREE.Mesh {
  const mat = makeStarDomeMaterial();
  // Large enough that solar-camera (near 1 AU) still sits inside the sky dome
  const stars = new THREE.Mesh(new THREE.SphereGeometry(AU * 2.2, 64, 48), mat);
  stars.name = "star-dome";
  orientStarDomeToEcliptic(stars);
  loadStarDomeTexture(mat);
  return stars;
}

function createOrbitOverlayGroup(): THREE.Group {
  // Moon path + Earth-relative ring are added in main (need duration / Earth).
  const orbitGroup = new THREE.Group();
  orbitGroup.name = "orbit-overlays";
  orbitGroup.visible = false;
  orbitGroup.add(createEclipticGridTowardSun());
  orbitGroup.add(createEclipticGridNear());
  orbitGroup.add(createEarthOrbitPath());
  return orbitGroup;
}

function makeNamedDirLight(
  name: string,
  color: number,
  intensity: number,
  pos: [number, number, number],
): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(color, intensity);
  light.name = name;
  light.position.set(pos[0], pos[1], pos[2]);
  return light;
}

function addDirLight(scene: THREE.Scene, light: THREE.DirectionalLight): void {
  scene.add(light);
  scene.add(light.target);
}

function addSceneAmbient(scene: THREE.Scene): void {
  // Soft ambient so night-side silhouettes stay readable (space theater)
  scene.add(new THREE.AmbientLight(0x4a5a78, 0.36));
  scene.add(new THREE.HemisphereLight(0xa8c0e0, 0x121018, 0.4));
}

function createSceneLights(scene: THREE.Scene) {
  const sunLight = makeNamedDirLight("sun-light", 0xfff2dd, 3.4, [-1, 0.2, 0.3]);
  const fillLight = makeNamedDirLight("fill-light", 0x6a7a9a, 0.32, [1, 0, 0]);
  const earthshine = makeNamedDirLight("earthshine", 0x88aacc, 0.16, [0, 0, 1]);
  addDirLight(scene, sunLight);
  addDirLight(scene, fillLight);
  addDirLight(scene, earthshine);
  return { sunLight, fillLight, earthshine };
}

export function createScene(): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010208);
  scene.add(createStarDome());
  // Orbit overlays (ecliptic grids + Earth path) — O toggles visibility.
  const orbitGroup = createOrbitOverlayGroup();
  scene.add(orbitGroup);
  addSceneAmbient(scene);
  const lights = createSceneLights(scene);
  return { scene, ...lights, orbitGroup };
}

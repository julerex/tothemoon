import * as THREE from "three";
import { A_EM, AU } from "../physics/constants";
import { moonOrbitPathPoints } from "../physics/bodies";
import { createFatLine } from "./fatLines";
import { makeStarTexture } from "./textures";

export type SceneBundle = {
  scene: THREE.Scene;
  sunLight: THREE.DirectionalLight;
  /** Ecliptic grids + Moon path — toggle with O */
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
 * Same ecliptic plane, coarser and sized so the grid reaches the Sun (~1 AU
 * from the barycenter) without drowning the cislunar view in fine lines.
 */
function createEclipticGridTowardSun(): THREE.GridHelper {
  // Full width 2.2 AU → edges past the Sun on either side of the barycenter
  const size = AU * 2.2;
  const divisions = 22;
  const grid = new THREE.GridHelper(size, divisions, 0x555566, 0x2a2a38);
  grid.rotation.x = Math.PI / 2;
  styleGrid(grid, 0.2);
  return grid;
}

/** Moon’s path about the barycenter (one sidereal month). */
function createMoonOrbitPath(): THREE.Object3D {
  const pts = moonOrbitPathPoints(256, 0);
  const vecs = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const line = createFatLine(vecs, {
    color: 0x88aacc,
    opacity: 0.55,
    linewidth: 2.75,
  });
  line.name = "moon-orbit-path";
  return line;
}

/** Apply NASA SVS equirectangular star map (RA increases left → flip S). */
function applySkyMap(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = -1;
  texture.needsUpdate = true;
}

/**
 * Inward-facing sky dome. Prefer NASA Deep Star Maps 2020 (public textures);
 * fall back to a procedural canvas map if the asset is missing.
 */
function createStarDome(): THREE.Mesh {
  // Dim the sky map so bodies, trails, and SOI shells read clearly
  const mat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    color: 0x555566,
    toneMapped: false,
  });
  // Large enough that solar-camera (near 1 AU) still sits inside the sky dome
  const stars = new THREE.Mesh(
    new THREE.SphereGeometry(AU * 2.2, 64, 48),
    mat,
  );

  const fallback = () => {
    const starMap = new THREE.CanvasTexture(makeStarTexture(1024));
    starMap.colorSpace = THREE.SRGBColorSpace;
    mat.map = starMap;
    mat.needsUpdate = true;
  };

  new THREE.TextureLoader().load(
    `${import.meta.env.BASE_URL}textures/starmap_nasa_svs_2020_4k.jpg`,
    (tex) => {
      applySkyMap(tex);
      mat.map = tex;
      mat.needsUpdate = true;
    },
    undefined,
    () => {
      console.warn(
        "[tothemoon] NASA star map missing; using procedural fallback",
      );
      fallback();
    },
  );

  return stars;
}

export function createScene(): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010208);
  scene.add(createStarDome());

  // Orbit overlays (ecliptic grids + Moon path) — O toggles visibility
  const orbitGroup = new THREE.Group();
  orbitGroup.name = "orbit-overlays";
  orbitGroup.add(createEclipticGridTowardSun());
  orbitGroup.add(createEclipticGridNear());
  orbitGroup.add(createMoonOrbitPath());
  scene.add(orbitGroup);

  scene.add(new THREE.AmbientLight(0x334466, 0.22));
  scene.add(new THREE.HemisphereLight(0x8899bb, 0x080810, 0.28));

  // Sun light — direction updated each frame from ephemeris (unit-scale offset)
  const sunLight = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sunLight.position.set(-1, 0.2, 0.3);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const rim = new THREE.DirectionalLight(0x6688cc, 0.2);
  rim.position.set(A_EM, -A_EM * 0.3, -A_EM * 0.5);
  scene.add(rim);

  return { scene, sunLight, orbitGroup };
}

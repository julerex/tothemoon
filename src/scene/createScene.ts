import * as THREE from "three";
import {
  A_EM,
  AU,
  MOON_INCLINATION,
  MOON_NODE,
} from "../physics/constants";
import { moonOrbitPathPoints } from "../physics/bodies";
import { makeStarTexture } from "./textures";

export type SceneBundle = {
  scene: THREE.Scene;
  sunLight: THREE.DirectionalLight;
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
 * Ecliptic plane grid (XY / z = 0) — Sun–Earth orbital plane in this theater.
 */
function createEclipticGrid(): THREE.GridHelper {
  const size = A_EM * 2.5;
  const divisions = 25;
  const grid = new THREE.GridHelper(size, divisions, 0x6e6e7a, 0x3a3a48);
  // GridHelper is XZ by default; ecliptic is XY
  grid.rotation.x = Math.PI / 2;
  styleGrid(grid, 0.38);
  return grid;
}

/**
 * Lunar orbital plane grid: inclined ~5.15° to the ecliptic about the line
 * of nodes (Ω = MOON_NODE). Slightly cooler tint so it reads apart from the
 * ecliptic grid.
 */
function createLunarOrbitPlaneGrid(): THREE.GridHelper {
  const size = A_EM * 2.4;
  const divisions = 20;
  const grid = new THREE.GridHelper(size, divisions, 0x6a8aaa, 0x3a5068);
  // Default GridHelper: plane XZ, normal +Y. Map +Y → lunar orbit normal.
  // Orbit normal in ecliptic: (sin i sin Ω, −sin i cos Ω, cos i)
  const i = MOON_INCLINATION;
  const Ω = MOON_NODE;
  const normal = new THREE.Vector3(
    Math.sin(i) * Math.sin(Ω),
    -Math.sin(i) * Math.cos(Ω),
    Math.cos(i),
  ).normalize();
  grid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  styleGrid(grid, 0.32);
  return grid;
}

/** Thin ellipse of the Moon’s path about the barycenter (one sidereal month). */
function createMoonOrbitPath(): THREE.Line {
  const pts = moonOrbitPathPoints(256, 0);
  const vecs = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const geom = new THREE.BufferGeometry().setFromPoints(vecs);
  const mat = new THREE.LineBasicMaterial({
    color: 0x88aacc,
    transparent: true,
    opacity: 0.4,
  });
  const line = new THREE.Line(geom, mat);
  line.frustumCulled = false;
  return line;
}

export function createScene(): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050c);

  const starMap = new THREE.CanvasTexture(makeStarTexture(1024));
  starMap.colorSpace = THREE.SRGBColorSpace;
  // Large enough that solar-camera (near 1 AU) still sits inside the sky dome
  const stars = new THREE.Mesh(
    new THREE.SphereGeometry(AU * 2.2, 48, 32),
    new THREE.MeshBasicMaterial({
      map: starMap,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  scene.add(stars);

  scene.add(createEclipticGrid());
  scene.add(createLunarOrbitPlaneGrid());
  scene.add(createMoonOrbitPath());

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

  return { scene, sunLight };
}

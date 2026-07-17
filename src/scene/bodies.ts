import * as THREE from "three";
import { R_EARTH, R_MOON } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import { makeEarthTexture, makeMoonTexture } from "./textures";

export type Bodies = {
  earth: THREE.Mesh;
  moon: THREE.Mesh;
  earthGroup: THREE.Group;
  moonGroup: THREE.Group;
};

export function createBodies(): Bodies {
  const earthGroup = new THREE.Group();

  const earthMap = new THREE.CanvasTexture(makeEarthTexture(768));
  earthMap.colorSpace = THREE.SRGBColorSpace;
  earthMap.anisotropy = 4;

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(R_EARTH, 64, 48),
    new THREE.MeshStandardMaterial({
      map: earthMap,
      roughness: 0.85,
      metalness: 0.05,
    }),
  );
  earthGroup.add(earth);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R_EARTH * 1.02, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x5aa9ff,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  earthGroup.add(atmo);

  const moonGroup = new THREE.Group();
  const moonMap = new THREE.CanvasTexture(makeMoonTexture(512));
  moonMap.colorSpace = THREE.SRGBColorSpace;
  moonMap.anisotropy = 4;

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(R_MOON, 48, 36),
    new THREE.MeshStandardMaterial({
      map: moonMap,
      roughness: 0.95,
      metalness: 0.0,
    }),
  );
  moonGroup.add(moon);

  // Initial placement
  updateBodies(0, { earthGroup, moonGroup, earth, moon });

  return { earth, moon, earthGroup, moonGroup };
}

export function updateBodies(t: number, bodies: Bodies): void {
  const b = bodyPositions(t);
  bodies.earthGroup.position.set(b.earth.x, b.earth.y, b.earth.z);
  bodies.moonGroup.position.set(b.moon.x, b.moon.y, b.moon.z);
}

/** Visual spin only (not tidally locked physics). */
export function spinBodies(bodies: Bodies, dt: number): void {
  bodies.earth.rotation.y += dt * 7.3e-5; // ~1 rev/day
  bodies.moon.rotation.y += dt * 2.7e-6;
}

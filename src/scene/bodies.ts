import * as THREE from "three";
import { R_EARTH, R_MOON, R_SUN } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import { makeEarthTexture, makeMoonTexture, makeSunGlowTexture } from "./textures";

export type Bodies = {
  earth: THREE.Mesh;
  moon: THREE.Mesh;
  sun: THREE.Mesh;
  earthGroup: THREE.Group;
  moonGroup: THREE.Group;
  sunGroup: THREE.Group;
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

  const { sun, sunGroup } = createSun();

  // Initial placement
  updateBodies(0, { earthGroup, moonGroup, sunGroup, earth, moon, sun });

  return { earth, moon, sun, earthGroup, moonGroup, sunGroup };
}

function createSun(): { sun: THREE.Mesh; sunGroup: THREE.Group } {
  const sunGroup = new THREE.Group();

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(R_SUN, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0xfff2c8,
      toneMapped: false,
    }),
  );
  sunGroup.add(sun);

  // Soft limb / photosphere haze
  const photosphere = new THREE.Mesh(
    new THREE.SphereGeometry(R_SUN * 1.04, 40, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.55,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  sunGroup.add(photosphere);

  // Inner corona shell
  const coronaInner = new THREE.Mesh(
    new THREE.SphereGeometry(R_SUN * 1.35, 32, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffc04a,
      transparent: true,
      opacity: 0.22,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  sunGroup.add(coronaInner);

  // Outer corona shell
  const coronaOuter = new THREE.Mesh(
    new THREE.SphereGeometry(R_SUN * 2.1, 28, 20),
    new THREE.MeshBasicMaterial({
      color: 0xff8a20,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  sunGroup.add(coronaOuter);

  // Billboard shine — reads well from cislunar distances as a soft glare
  const glowMap = new THREE.CanvasTexture(makeSunGlowTexture(256));
  glowMap.colorSpace = THREE.SRGBColorSpace;

  const shine = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowMap,
      color: 0xffe8a0,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  shine.scale.setScalar(R_SUN * 14);
  sunGroup.add(shine);

  // Wider faint halo for long-range "star with corona" look
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowMap,
      color: 0xffaa44,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  halo.scale.setScalar(R_SUN * 36);
  sunGroup.add(halo);

  return { sun, sunGroup };
}

export function updateBodies(t: number, bodies: Bodies): void {
  const b = bodyPositions(t);
  bodies.earthGroup.position.set(b.earth.x, b.earth.y, b.earth.z);
  bodies.moonGroup.position.set(b.moon.x, b.moon.y, b.moon.z);
  bodies.sunGroup.position.set(b.sun.x, b.sun.y, b.sun.z);
}

/** Visual spin only (not tidally locked physics). */
export function spinBodies(bodies: Bodies, dt: number): void {
  bodies.earth.rotation.y += dt * 7.3e-5; // ~1 rev/day
  bodies.moon.rotation.y += dt * 2.7e-6;
  bodies.sun.rotation.y += dt * 2.9e-6; // slow photosphere drift
}

/**
 * Sun core, corona shells, and glow billboards.
 */

import * as THREE from "three";
import { R_SUN } from "../physics/constants";
import { makeSunGlowTexture } from "./textures";
import { ADDITIVE_BACK } from "./bodiesShared";

/** Additive BackSide corona / photosphere shell. */
function makeSunShellMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    opacity,
    toneMapped: false,
    ...ADDITIVE_BACK,
  });
}

function makeSunShell(
  radius: number,
  segs: number,
  color: number,
  opacity: number,
): THREE.Mesh {
  const hSegs = Math.max(16, (segs * 2) / 3);
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, segs, hSegs),
    makeSunShellMat(color, opacity),
  );
}

/** Billboard sun glow sprite material. */
function makeSunGlowMat(
  map: THREE.CanvasTexture,
  color: number,
  opacity: number,
): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/** Billboard sun glow sprite (shared map). */
function makeSunGlowSprite(
  map: THREE.CanvasTexture,
  color: number,
  opacity: number,
  scale: number,
): THREE.Sprite {
  const sprite = new THREE.Sprite(makeSunGlowMat(map, color, opacity));
  sprite.scale.setScalar(scale);
  return sprite;
}

/** Photosphere core sphere (tone-mapped off). */
function makeSunCore(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(R_SUN, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8, toneMapped: false }),
  );
}

/** Shared glow canvas map for sun billboards. */
function makeSunGlowMap(): THREE.CanvasTexture {
  const glowMap = new THREE.CanvasTexture(makeSunGlowTexture(256));
  glowMap.colorSpace = THREE.SRGBColorSpace;
  return glowMap;
}

/** Add photosphere + corona shells to sun group. */
function addSunShells(sunGroup: THREE.Group): void {
  sunGroup.add(makeSunShell(R_SUN * 1.04, 40, 0xffe08a, 0.55));
  sunGroup.add(makeSunShell(R_SUN * 1.35, 32, 0xffc04a, 0.22));
  sunGroup.add(makeSunShell(R_SUN * 2.1, 28, 0xff8a20, 0.1));
}

/** Add shine + outer halo billboards. */
function addSunGlows(sunGroup: THREE.Group): void {
  const glowMap = makeSunGlowMap();
  sunGroup.add(makeSunGlowSprite(glowMap, 0xffe8a0, 0.95, R_SUN * 14));
  sunGroup.add(makeSunGlowSprite(glowMap, 0xffaa44, 0.45, R_SUN * 36));
}

export function createSun(): { sun: THREE.Mesh; sunGroup: THREE.Group } {
  const sunGroup = new THREE.Group();
  const sun = makeSunCore();
  sunGroup.add(sun);
  addSunShells(sunGroup);
  addSunGlows(sunGroup);
  return { sun, sunGroup };
}

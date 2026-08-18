/**
 * Shared body-mesh types and canvas texture helpers.
 */

import * as THREE from "three";
import type { EarthAtmosphere } from "./earthAtmosphere";
import type { LeoClouds } from "./leoClouds";

export type Bodies = {
  earth: THREE.Mesh;
  moon: THREE.Mesh;
  /** Orientation node: axial tilt + tidal lock (child of moonGroup). */
  moonAxis: THREE.Group;
  sun: THREE.Mesh;
  earthGroup: THREE.Group;
  moonGroup: THREE.Group;
  sunGroup: THREE.Group;
  /** Rayleigh-ish multi-shell limb (sun dir updated each frame). */
  earthAtmo: EarthAtmosphere;
  /** V19 gated LEO cloud shell + glitter (hidden for Earth-cam / pad). */
  leoClouds: LeoClouds;
  /** Far-range green locator (constant on-screen size). */
  earthLocator: THREE.Sprite;
  /** Far-range light-blue locator. */
  moonLocator: THREE.Sprite;
};
export const SPRITE_NO_DEPTH = {
  transparent: true,
  depthWrite: false,
  sizeAttenuation: true,
} as const;

export const BASIC_NO_DEPTH = {
  transparent: true,
  depthWrite: false,
} as const;

export const ADDITIVE_BACK = {
  transparent: true,
  side: THREE.BackSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
} as const;

/**
 * Earth orientation vs the orbital plane.
 *
 * Theater frame: Sun–Earth–Moon orbits in XY; ecliptic north = +Z (J2000,
 * same as Horizons). SphereGeometry poles are on ±Y; map mesh +Y (texture
 * north) onto the mean north pole (0, sin ε, cos ε) — lean toward +Y so the
 * axis matches celestial north on the sky dome at northern summer.
/** SRGB canvas texture with anisotropy. */
export function canvasMap(
  canvas: HTMLCanvasElement,
  anisotropy: number,
): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = anisotropy;
  return map;
}

/** Non-color canvas texture with anisotropy. */
export function canvasDataMap(
  canvas: HTMLCanvasElement,
  anisotropy: number,
): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  map.anisotropy = anisotropy;
  return map;
}
export function canvasFromTextureImage(
  tex: THREE.Texture,
  maxWidth = 2048,
): HTMLCanvasElement | null {
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (!img || typeof img.width !== "number" || typeof img.height !== "number") {
    return null;
  }
  const w = Math.min(maxWidth, img.width);
  const h = Math.max(1, Math.round((w * img.height) / img.width));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  return canvas;
}


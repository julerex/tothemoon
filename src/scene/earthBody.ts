/**
 * Earth mesh, axis, atmosphere, and LEO clouds factory.
 */

import * as THREE from "three";
import { EARTH_OBLIQUITY, R_EARTH } from "../physics/constants";
import { makeEarthRoughnessMap, makeEarthTexture } from "./textures";
import {
  applySoftTerminator,
  createEarthAtmosphere,
  type EarthAtmosphere,
} from "./earthAtmosphere";
import { createLeoClouds, type LeoClouds } from "./leoClouds";
import { applyWgs84ToGeometry } from "./wgs84Mesh";
import { markZoomLabel } from "./zoomLabels";
import {
  BASIC_NO_DEPTH,
  canvasDataMap,
  canvasFromTextureImage,
  canvasMap,
  SPRITE_NO_DEPTH,
} from "./bodiesShared";

function createEarthAxisGroup(): THREE.Group {
  const axis = new THREE.Group();
  const north = new THREE.Vector3(
    0,
    Math.sin(EARTH_OBLIQUITY),
    Math.cos(EARTH_OBLIQUITY),
  ).normalize();
  axis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), north);
  return axis;
}

/** Soft dark halo disc for pole label readability. */
function fillPoleHalo(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 48, 0, Math.PI * 2);
  ctx.fill();
}

/** Paint pole letter onto a canvas (halo + glyph). */
function paintPoleLabel(
  ctx: CanvasRenderingContext2D,
  size: number,
  text: string,
  color: string,
): void {
  ctx.clearRect(0, 0, size, size);
  ctx.font = "bold 88px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fillPoleHalo(ctx, size);
  ctx.fillStyle = color;
  ctx.fillText(text, size / 2, size / 2 + 4);
}

/** Canvas + SRGB map for a pole letter. */
function makePoleLabelMap(text: string, color: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paintPoleLabel(canvas.getContext("2d")!, size, text, color);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** Canvas sprite for axis pole labels (always faces camera). */
function makePoleLabel(text: string, color: string): THREE.Sprite {
  const map = makePoleLabelMap(text, color);
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, ...SPRITE_NO_DEPTH }),
  );
  markZoomLabel(spr, { targetPx: 26, aspect: 1, minH: 4 });
  spr.scale.set(R_EARTH * 0.2, R_EARTH * 0.2, 1);
  return spr;
}

/** Basic translucent material for axis shaft / caps. */
function makeAxisBasicMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, opacity, ...BASIC_NO_DEPTH });
}

/** Shaft cylinder through Earth along local +Y. */
function makeAxisShaft(halfLen: number, radius: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, halfLen * 2, 16),
    makeAxisBasicMat(0xffcc66, 0.92),
  );
}

/** Pole cap sphere at ±halfLen. */
function makeAxisCap(halfLen: number, radius: number, sign: 1 | -1): THREE.Mesh {
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.8, 12, 10),
    makeAxisBasicMat(0xffe8a0, 0.95),
  );
  cap.position.y = sign * halfLen;
  return cap;
}

/** Add N/S pole labels outside the shaft ends. */
function addAxisPoleLabels(g: THREE.Group, halfLen: number): void {
  const nLabel = makePoleLabel("N", "#ff8866");
  nLabel.position.y = halfLen + R_EARTH * 0.28;
  g.add(nLabel);
  const sLabel = makePoleLabel("S", "#88aaff");
  sLabel.position.y = -halfLen - R_EARTH * 0.28;
  g.add(sLabel);
}

/**
 * Thick polar axis through Earth (local +Y = north after earthAxis tilt).
 * Does not spin with the globe — sibling of the Earth mesh under earthAxis.
 */
function createEarthAxisVisual(): THREE.Group {
  const g = new THREE.Group();
  const halfLen = R_EARTH * 1.35;
  const radius = R_EARTH * 0.018;
  g.add(makeAxisShaft(halfLen, radius));
  g.add(makeAxisCap(halfLen, radius, 1));
  g.add(makeAxisCap(halfLen, radius, -1));
  addAxisPoleLabels(g, halfLen);
  return g;
}

/** Orthonormalize moon basis into `_moonMat` from Earth-facing +X. */
function makeEarthAlbedoMap(texSize: number): {
  canvas: HTMLCanvasElement;
  map: THREE.CanvasTexture;
} {
  const canvas = makeEarthTexture(texSize);
  return { canvas, map: canvasMap(canvas, 8) };
}

/** Earth roughness map from albedo canvas size. */
function makeEarthRoughnessTex(earthCanvas: HTMLCanvasElement): THREE.CanvasTexture {
  return canvasDataMap(makeEarthRoughnessMap(earthCanvas), 4);
}

/** Base params for Earth MeshStandardMaterial (before soft terminator). */
function earthMaterialParams(
  map: THREE.Texture,
  rough: THREE.Texture,
): THREE.MeshStandardMaterialParameters {
  return {
    map,
    roughnessMap: rough,
    roughness: 0.9,
    metalness: 0.02,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  };
}

/** Earth surface MeshStandardMaterial with soft terminator. */
function makeEarthMaterial(
  map: THREE.Texture,
  rough: THREE.Texture,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial(earthMaterialParams(map, rough));
  applySoftTerminator(mat);
  return mat;
}

/** Earth surface mesh with WGS84 figure (same ECEF as the physics pad). */
function makeEarthMesh(mat: THREE.MeshStandardMaterial): THREE.Mesh {
  const geo = new THREE.SphereGeometry(R_EARTH, 96, 64);
  applyWgs84ToGeometry(geo);
  return new THREE.Mesh(geo, mat);
}

/** Earth surface mesh with albedo / roughness / night maps. */
function makeTexturedEarth(texSize: number): THREE.Mesh {
  const { canvas, map } = makeEarthAlbedoMap(texSize);
  const earth = makeEarthMesh(makeEarthMaterial(map, makeEarthRoughnessTex(canvas)));
  loadEarthPhotoAlbedo(earth);
  return earth;
}

/** Draw a loaded image onto a canvas (optionally downsampled) for roughness remap. */
export function applyEarthPhotoAlbedo(earth: THREE.Mesh, tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const mat = earth.material as THREE.MeshStandardMaterial;
  const prevMap = mat.map;
  const prevRough = mat.roughnessMap;
  mat.map = tex;
  const canvas = canvasFromTextureImage(tex);
  if (canvas) {
    mat.roughnessMap = canvasDataMap(makeEarthRoughnessMap(canvas), 4);
  }
  mat.needsUpdate = true;
  prevMap?.dispose();
  prevRough?.dispose();
}

function onEarthPhotoMissing(): void {
  console.warn("[tothemoon] NASA Blue Marble missing; using procedural Earth");
}

/** Prefer committed Blue Marble; keep procedural albedo if the JPEG is absent. */
function loadEarthPhotoAlbedo(earth: THREE.Mesh): void {
  const url = `${import.meta.env.BASE_URL}textures/earth_bluemarble_4k.jpg`;
  new THREE.TextureLoader().load(
    url,
    (tex) => applyEarthPhotoAlbedo(earth, tex),
    undefined,
    () => onEarthPhotoMissing(),
  );
}

/** Attach atmosphere shells + polar axis visual. */
function addEarthDecor(earthAxis: THREE.Group): EarthAtmosphere {
  const earthAtmo = createEarthAtmosphere();
  earthAxis.add(earthAtmo.group);
  earthAxis.add(createEarthAxisVisual());
  return earthAtmo;
}

/** Attach the V19 gated LEO cloud + glitter shell (starts hidden). */
function addLeoClouds(earthAxis: THREE.Group): LeoClouds {
  const leoClouds = createLeoClouds();
  earthAxis.add(leoClouds.group);
  return leoClouds;
}

/** Populate earthAxis with globe, gated clouds, atmo, axis visual. */
function populateEarthAxis(earthAxis: THREE.Group): {
  earth: THREE.Mesh;
  earthAtmo: EarthAtmosphere;
  leoClouds: LeoClouds;
} {
  const texSize = 1536;
  const earth = makeTexturedEarth(texSize);
  earthAxis.add(earth);
  const leoClouds = addLeoClouds(earthAxis);
  return { earth, earthAtmo: addEarthDecor(earthAxis), leoClouds };
}

/** Build Earth mesh + atmo + axis under earthGroup. */
export function buildEarthBundle(): {
  earthGroup: THREE.Group;
  earth: THREE.Mesh;
  earthAtmo: EarthAtmosphere;
  leoClouds: LeoClouds;
} {
  const earthGroup = new THREE.Group();
  const earthAxis = createEarthAxisGroup();
  earthGroup.add(earthAxis);
  const parts = populateEarthAxis(earthAxis);
  return { earthGroup, ...parts };
}

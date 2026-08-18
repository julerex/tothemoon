/**
 * Moon mesh factory and tidal-lock orientation.
 */

import * as THREE from "three";
import { MOON_OBLIQUITY, R_MOON } from "../physics/constants";
import { makeMoonRoughnessMap, makeMoonTexture } from "./textures";
import {
  ADDITIVE_BACK,
  canvasDataMap,
  canvasFromTextureImage,
  canvasMap,
} from "./bodiesShared";

/** Lunar north in the ecliptic frame (small tilt from +Z). */
const _moonNorth = new THREE.Vector3(
  Math.sin(MOON_OBLIQUITY),
  0,
  Math.cos(MOON_OBLIQUITY),
).normalize();

const _moonX = new THREE.Vector3();
const _moonY = new THREE.Vector3();
const _moonZ = new THREE.Vector3();
const _moonMat = new THREE.Matrix4();

function fillMoonBasis(
  moonPos: { x: number; y: number; z: number },
  earthPos: { x: number; y: number; z: number },
): void {
  _moonX
    .set(earthPos.x - moonPos.x, earthPos.y - moonPos.y, earthPos.z - moonPos.z)
    .normalize();
  _moonY.copy(_moonNorth).addScaledVector(_moonX, -_moonNorth.dot(_moonX));
  if (_moonY.lengthSq() < 1e-12) _moonY.set(0, 0, 1);
  else _moonY.normalize();
  _moonZ.crossVectors(_moonX, _moonY).normalize();
  _moonY.crossVectors(_moonZ, _moonX).normalize();
  _moonMat.makeBasis(_moonX, _moonY, _moonZ);
}

/**
 * Tidally lock the Moon: texture lon 0° (mesh +X) faces Earth; mesh +Y aligns
 * with lunar north (MOON_OBLIQUITY from ecliptic +Z).
 */
export function orientMoonAxis(
  axis: THREE.Group,
  moonPos: { x: number; y: number; z: number },
  earthPos: { x: number; y: number; z: number },
): void {
  fillMoonBasis(moonPos, earthPos);
  axis.quaternion.setFromRotationMatrix(_moonMat);
}
/** Moon surface material. */
function makeMoonMaterial(
  map: THREE.Texture,
  rough: THREE.Texture,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    roughnessMap: rough,
    roughness: 0.94,
    metalness: 0.0,
  });
}

/** Moon albedo + roughness maps. */
function makeMoonMaps(): {
  map: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
} {
  const canvas = makeMoonTexture(1536);
  return {
    map: canvasMap(canvas, 8),
    rough: canvasDataMap(makeMoonRoughnessMap(canvas), 4),
  };
}

/** Subtle additive lunar limb shell. */
function makeMoonLimb(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(R_MOON * 1.012, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0xd0c8b8,
      opacity: 0.09,
      ...ADDITIVE_BACK,
    }),
  );
}

/** Moon surface sphere. */
function makeMoonMesh(mat: THREE.MeshStandardMaterial): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(R_MOON, 80, 56), mat);
}

function onMoonPhotoMissing(): void {
  console.warn("[tothemoon] LRO WAC Moon albedo missing; using procedural Moon");
}

/** Swap procedural albedo for LRO WAC color; rebuild roughness from the photo. */
function applyMoonPhotoAlbedo(moon: THREE.Mesh, tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const mat = moon.material as THREE.MeshStandardMaterial;
  const prevMap = mat.map;
  const prevRough = mat.roughnessMap;
  mat.map = tex;
  const canvas = canvasFromTextureImage(tex);
  if (canvas) {
    mat.roughnessMap = canvasDataMap(makeMoonRoughnessMap(canvas), 4);
  }
  mat.needsUpdate = true;
  prevMap?.dispose();
  prevRough?.dispose();
}

/** Prefer committed LRO WAC color; keep procedural albedo if the JPEG is absent. */
function loadMoonPhotoAlbedo(moon: THREE.Mesh): void {
  const url = `${import.meta.env.BASE_URL}textures/moon_lroc_wac_4k.jpg`;
  new THREE.TextureLoader().load(
    url,
    (tex) => applyMoonPhotoAlbedo(moon, tex),
    undefined,
    () => onMoonPhotoMissing(),
  );
}

/** Textured moon sphere + limb under axis. */
function populateMoonAxis(moonAxis: THREE.Group): THREE.Mesh {
  const maps = makeMoonMaps();
  const moon = makeMoonMesh(makeMoonMaterial(maps.map, maps.rough));
  moonAxis.add(moon);
  moonAxis.add(makeMoonLimb());
  loadMoonPhotoAlbedo(moon);
  return moon;
}

/** Build Moon mesh + limb under moonGroup / moonAxis. */
export function buildMoonBundle(): {
  moonGroup: THREE.Group;
  moonAxis: THREE.Group;
  moon: THREE.Mesh;
} {
  const moonGroup = new THREE.Group();
  const moonAxis = new THREE.Group();
  moonGroup.add(moonAxis);
  const moon = populateMoonAxis(moonAxis);
  return { moonGroup, moonAxis, moon };
}

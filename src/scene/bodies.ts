import * as THREE from "three";
import {
  EARTH_OBLIQUITY,
  MOON_OBLIQUITY,
  R_EARTH,
  R_MOON,
  R_SUN,
} from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import { earthSpinAngle } from "../physics/earthFrame";
import {
  makeEarthNightLightsTexture,
  makeEarthRoughnessMap,
  makeEarthTexture,
  makeMoonRoughnessMap,
  makeMoonTexture,
  makeSunGlowTexture,
} from "./textures";
import {
  applySoftTerminator,
  createEarthAtmosphere,
  updateEarthAtmosphere,
  type EarthAtmosphere,
} from "./earthAtmosphere";
import { createLocatorSprite } from "./craft";
import { createNameLabel, markZoomLabel } from "./zoomLabels";

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
  /** Far-range green locator (constant on-screen size). */
  earthLocator: THREE.Sprite;
  /** Far-range light-blue locator. */
  moonLocator: THREE.Sprite;
};

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

const SPRITE_NO_DEPTH = {
  transparent: true,
  depthWrite: false,
  sizeAttenuation: true,
} as const;

const BASIC_NO_DEPTH = {
  transparent: true,
  depthWrite: false,
} as const;

const ADDITIVE_BACK = {
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
 */
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
function orientMoonAxis(
  axis: THREE.Group,
  moonPos: { x: number; y: number; z: number },
  earthPos: { x: number; y: number; z: number },
): void {
  fillMoonBasis(moonPos, earthPos);
  axis.quaternion.setFromRotationMatrix(_moonMat);
}

/** SRGB canvas texture with anisotropy. */
function canvasMap(
  canvas: HTMLCanvasElement,
  anisotropy: number,
): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = anisotropy;
  return map;
}

/** Non-color canvas texture with anisotropy. */
function canvasDataMap(
  canvas: HTMLCanvasElement,
  anisotropy: number,
): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  map.anisotropy = anisotropy;
  return map;
}

/** Earth albedo CanvasTexture. */
function makeEarthAlbedoMap(texSize: number): {
  canvas: HTMLCanvasElement;
  map: THREE.CanvasTexture;
} {
  const canvas = makeEarthTexture(texSize);
  return { canvas, map: canvasMap(canvas, 8) };
}

/** Earth roughness + night-lights maps from albedo canvas size. */
function makeEarthExtraMaps(
  earthCanvas: HTMLCanvasElement,
  texSize: number,
): { rough: THREE.CanvasTexture; night: THREE.CanvasTexture } {
  return {
    rough: canvasDataMap(makeEarthRoughnessMap(earthCanvas), 4),
    night: canvasMap(makeEarthNightLightsTexture(texSize), 4),
  };
}

/** Base params for Earth MeshStandardMaterial (before soft terminator). */
function earthMaterialParams(
  map: THREE.Texture,
  rough: THREE.Texture,
  night: THREE.Texture,
): THREE.MeshStandardMaterialParameters {
  return {
    map,
    roughnessMap: rough,
    roughness: 0.9,
    metalness: 0.02,
    emissiveMap: night,
    emissive: new THREE.Color(0xffb878),
    emissiveIntensity: 1.05,
  };
}

/** Earth surface MeshStandardMaterial with soft terminator. */
function makeEarthMaterial(
  map: THREE.Texture,
  rough: THREE.Texture,
  night: THREE.Texture,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial(
    earthMaterialParams(map, rough, night),
  );
  applySoftTerminator(mat);
  return mat;
}

/** Earth surface sphere mesh. */
function makeEarthMesh(mat: THREE.MeshStandardMaterial): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 96, 64), mat);
}

/** Earth surface mesh with albedo / roughness / night maps. */
function makeTexturedEarth(texSize: number): THREE.Mesh {
  const { canvas, map } = makeEarthAlbedoMap(texSize);
  const { rough, night } = makeEarthExtraMaps(canvas, texSize);
  const earth = makeEarthMesh(makeEarthMaterial(map, rough, night));
  loadEarthPhotoAlbedo(earth);
  return earth;
}

/** Draw a loaded image onto a canvas (optionally downsampled) for roughness remap. */
function canvasFromTextureImage(
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

/** Swap procedural albedo for NASA Blue Marble; rebuild roughness from the photo. */
function applyEarthPhotoAlbedo(earth: THREE.Mesh, tex: THREE.Texture): void {
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

/** Populate earthAxis with globe, atmo, axis visual. */
function populateEarthAxis(earthAxis: THREE.Group): {
  earth: THREE.Mesh;
  earthAtmo: EarthAtmosphere;
} {
  const texSize = 1536;
  const earth = makeTexturedEarth(texSize);
  earthAxis.add(earth);
  return { earth, earthAtmo: addEarthDecor(earthAxis) };
}

/** Build Earth mesh + atmo + axis under earthGroup. */
function buildEarthBundle(): {
  earthGroup: THREE.Group;
  earth: THREE.Mesh;
  earthAtmo: EarthAtmosphere;
} {
  const earthGroup = new THREE.Group();
  const earthAxis = createEarthAxisGroup();
  earthGroup.add(earthAxis);
  const parts = populateEarthAxis(earthAxis);
  return { earthGroup, ...parts };
}

/** Moon surface material. */
function makeMoonMaterial(
  map: THREE.CanvasTexture,
  rough: THREE.CanvasTexture,
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

/** Textured moon sphere + limb under axis. */
function populateMoonAxis(moonAxis: THREE.Group): THREE.Mesh {
  const maps = makeMoonMaps();
  const moon = makeMoonMesh(makeMoonMaterial(maps.map, maps.rough));
  moonAxis.add(moon);
  moonAxis.add(makeMoonLimb());
  return moon;
}

/** Build Moon mesh + limb under moonGroup / moonAxis. */
function buildMoonBundle(): {
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

const BODY_LABEL_OPTS = {
  targetPx: 18,
  aspect: 256 / 64,
} as const;

/** Name plate floating outside a body disc. */
function addBodyNameLabel(
  group: THREE.Group,
  text: string,
  color: string,
  minH: number,
  z: number,
): void {
  const label = createNameLabel(text, color, { ...BODY_LABEL_OPTS, minH });
  label.position.set(0, 0, z);
  group.add(label);
}

/** Earth far locator + name label. */
function addEarthLocatorLabel(earthGroup: THREE.Group): THREE.Sprite {
  const earthLocator = createLocatorSprite(
    "#22c55e",
    "34, 197, 94",
    "earth-locator",
  );
  earthGroup.add(earthLocator);
  addBodyNameLabel(earthGroup, "EARTH", "#7ec8ff", 80, R_EARTH * 1.18);
  return earthLocator;
}

/** Moon far locator + name label. */
function addMoonLocatorLabel(moonGroup: THREE.Group): THREE.Sprite {
  const moonLocator = createLocatorSprite(
    "#93c5fd",
    "147, 197, 253",
    "moon-locator",
  );
  moonGroup.add(moonLocator);
  addBodyNameLabel(moonGroup, "MOON", "#c8d4e8", 25, R_MOON * 1.35);
  return moonLocator;
}

/** Earth-side fields of the Bodies record. */
function earthBodyFields(
  earth: ReturnType<typeof buildEarthBundle>,
  earthLocator: THREE.Sprite,
): Pick<
  Bodies,
  "earth" | "earthGroup" | "earthAtmo" | "earthLocator"
> {
  return {
    earth: earth.earth,
    earthGroup: earth.earthGroup,
    earthAtmo: earth.earthAtmo,
    earthLocator,
  };
}

/** Moon + sun fields of the Bodies record. */
function moonSunBodyFields(
  moon: ReturnType<typeof buildMoonBundle>,
  sun: { sun: THREE.Mesh; sunGroup: THREE.Group },
  moonLocator: THREE.Sprite,
): Pick<Bodies, "moon" | "moonAxis" | "moonGroup" | "sun" | "sunGroup" | "moonLocator"> {
  return {
    moon: moon.moon,
    moonAxis: moon.moonAxis,
    moonGroup: moon.moonGroup,
    sun: sun.sun,
    sunGroup: sun.sunGroup,
    moonLocator,
  };
}

/** Pack assembled meshes into a Bodies record. */
function packBodies(
  earth: ReturnType<typeof buildEarthBundle>,
  moon: ReturnType<typeof buildMoonBundle>,
  sun: { sun: THREE.Mesh; sunGroup: THREE.Group },
  earthLocator: THREE.Sprite,
  moonLocator: THREE.Sprite,
): Bodies {
  return {
    ...earthBodyFields(earth, earthLocator),
    ...moonSunBodyFields(moon, sun, moonLocator),
  };
}

export function createBodies(): Bodies {
  const earth = buildEarthBundle();
  const moon = buildMoonBundle();
  const sun = createSun();
  const earthLocator = addEarthLocatorLabel(earth.earthGroup);
  const moonLocator = addMoonLocatorLabel(moon.moonGroup);
  const bodies = packBodies(earth, moon, sun, earthLocator, moonLocator);
  updateBodies(0, bodies);
  return bodies;
}

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

function createSun(): { sun: THREE.Mesh; sunGroup: THREE.Group } {
  const sunGroup = new THREE.Group();
  const sun = makeSunCore();
  sunGroup.add(sun);
  addSunShells(sunGroup);
  addSunGlows(sunGroup);
  return { sun, sunGroup };
}

/** Unit Earth→Sun direction from body positions. */
function earthToSunUnit(b: {
  sun: { x: number; y: number; z: number };
  earth: { x: number; y: number; z: number };
}): { x: number; y: number; z: number } {
  const sx = b.sun.x - b.earth.x;
  const sy = b.sun.y - b.earth.y;
  const sz = b.sun.z - b.earth.z;
  const slen = Math.hypot(sx, sy, sz) || 1;
  return { x: sx / slen, y: sy / slen, z: sz / slen };
}

/** Place body groups from ephemeris sample. */
function placeBodyGroups(
  bodies: Bodies,
  b: ReturnType<typeof bodyPositions>,
): void {
  bodies.earthGroup.position.set(b.earth.x, b.earth.y, b.earth.z);
  bodies.moonGroup.position.set(b.moon.x, b.moon.y, b.moon.z);
  bodies.sunGroup.position.set(b.sun.x, b.sun.y, b.sun.z);
}

/** Apply Earth spin. */
function spinEarthSurface(bodies: Bodies, spin: number): void {
  bodies.earth.rotation.y = spin;
}

export function updateBodies(
  t: number,
  bodies: Bodies,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): void {
  const b = bodyPositions(t, epoch);
  placeBodyGroups(bodies, b);
  spinEarthSurface(bodies, earthSpinAngle(t, epoch));
  orientMoonAxis(bodies.moonAxis, b.moon, b.earth);
  updateEarthAtmosphere(bodies.earthAtmo, earthToSunUnit(b));
}

/** Visual spin for the Sun only (Earth/Moon driven by mission time). */
export function spinBodies(bodies: Bodies, dt: number): void {
  bodies.sun.rotation.y += dt * 2.9e-6;
}

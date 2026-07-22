import * as THREE from "three";
import {
  EARTH_OBLIQUITY,
  MOON_OBLIQUITY,
  R_EARTH,
  R_MOON,
  R_SUN,
} from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import { EARTH_SPIN0, EARTH_SPIN_RATE } from "../physics/earthFrame";
import {
  makeEarthCloudTexture,
  makeEarthRoughnessMap,
  makeEarthTexture,
  makeMoonRoughnessMap,
  makeMoonTexture,
  makeSunGlowTexture,
} from "./textures";
import { markZoomLabel } from "./zoomLabels";

export type Bodies = {
  earth: THREE.Mesh;
  earthClouds: THREE.Mesh;
  moon: THREE.Mesh;
  /** Orientation node: axial tilt + tidal lock (child of moonGroup). */
  moonAxis: THREE.Group;
  sun: THREE.Mesh;
  earthGroup: THREE.Group;
  moonGroup: THREE.Group;
  sunGroup: THREE.Group;
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

/**
 * Earth orientation vs the orbital plane.
 *
 * Theater frame: Sun–Earth–Moon orbits in XY; ecliptic north = +Z.
 * SphereGeometry poles are on ±Y, so we map mesh +Y (texture north) onto
 * the real north-pole direction: tilted EARTH_OBLIQUITY from +Z toward +X
 * (June-solstice sense — north pole leans sunward at northern summer).
 */
function createEarthAxisGroup(): THREE.Group {
  const axis = new THREE.Group();
  // North pole in inertial/ecliptic frame
  const north = new THREE.Vector3(
    Math.sin(EARTH_OBLIQUITY),
    0,
    Math.cos(EARTH_OBLIQUITY),
  ).normalize();
  // Mesh local +Y → inertial north
  axis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), north);
  return axis;
}

/** Canvas sprite for axis pole labels (always faces camera). */
function makePoleLabel(text: string, color: string): THREE.Sprite {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.font = "bold 88px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Soft dark halo for readability
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, size / 2, size / 2 + 4);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const spr = new THREE.Sprite(mat);
  // Screen size driven by updateZoomLabels each frame
  markZoomLabel(spr, {
    targetPx: 28,
    aspect: 1,
    minH: 8,
    maxH: R_EARTH * 0.55,
  });
  spr.scale.set(R_EARTH * 0.2, R_EARTH * 0.2, 1);
  return spr;
}

/**
 * Thick polar axis through Earth (local +Y = north after earthAxis tilt).
 * Does not spin with the globe — sibling of the Earth mesh under earthAxis.
 */
function createEarthAxisVisual(): THREE.Group {
  const g = new THREE.Group();
  const halfLen = R_EARTH * 1.35;
  const radius = R_EARTH * 0.018;

  // Cylinder default axis is +Y — matches mesh north after parent tilt
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, halfLen * 2, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    }),
  );
  g.add(shaft);

  // Small pole caps
  const capMat = new THREE.MeshBasicMaterial({
    color: 0xffe8a0,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const capR = radius * 1.8;
  const northCap = new THREE.Mesh(
    new THREE.SphereGeometry(capR, 12, 10),
    capMat,
  );
  northCap.position.y = halfLen;
  g.add(northCap);
  const southCap = new THREE.Mesh(
    new THREE.SphereGeometry(capR, 12, 10),
    capMat.clone(),
  );
  southCap.position.y = -halfLen;
  g.add(southCap);

  const nLabel = makePoleLabel("N", "#ff8866");
  nLabel.position.y = halfLen + R_EARTH * 0.28;
  g.add(nLabel);

  const sLabel = makePoleLabel("S", "#88aaff");
  sLabel.position.y = -halfLen - R_EARTH * 0.28;
  g.add(sLabel);

  return g;
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
  // Local +X = near-side center → Earth
  _moonX
    .set(earthPos.x - moonPos.x, earthPos.y - moonPos.y, earthPos.z - moonPos.z)
    .normalize();
  // Local +Y = lunar north projected orthogonal to Earth direction
  _moonY.copy(_moonNorth).addScaledVector(_moonX, -_moonNorth.dot(_moonX));
  if (_moonY.lengthSq() < 1e-12) {
    _moonY.set(0, 0, 1);
  } else {
    _moonY.normalize();
  }
  _moonZ.crossVectors(_moonX, _moonY).normalize();
  _moonY.crossVectors(_moonZ, _moonX).normalize();
  _moonMat.makeBasis(_moonX, _moonY, _moonZ);
  axis.quaternion.setFromRotationMatrix(_moonMat);
}

export function createBodies(): Bodies {
  const earthGroup = new THREE.Group();
  const earthAxis = createEarthAxisGroup();
  earthGroup.add(earthAxis);

  const texSize = 1536;
  const earthCanvas = makeEarthTexture(texSize);
  const earthMap = new THREE.CanvasTexture(earthCanvas);
  earthMap.colorSpace = THREE.SRGBColorSpace;
  earthMap.anisotropy = 8;

  const roughMap = new THREE.CanvasTexture(makeEarthRoughnessMap(earthCanvas));
  roughMap.anisotropy = 4;

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(R_EARTH, 96, 64),
    new THREE.MeshStandardMaterial({
      map: earthMap,
      roughnessMap: roughMap,
      roughness: 0.9,
      metalness: 0.02,
    }),
  );
  earthAxis.add(earth);

  // Thin cloud deck — spins slightly faster for visual life
  const cloudMap = new THREE.CanvasTexture(makeEarthCloudTexture(texSize));
  cloudMap.colorSpace = THREE.SRGBColorSpace;
  cloudMap.anisotropy = 4;
  const earthClouds = new THREE.Mesh(
    new THREE.SphereGeometry(R_EARTH * 1.008, 64, 48),
    new THREE.MeshStandardMaterial({
      map: cloudMap,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
    }),
  );
  earthAxis.add(earthClouds);

  // Soft atmospheric limb (slightly stronger for ascent / limb views)
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R_EARTH * 1.028, 64, 48),
    new THREE.MeshBasicMaterial({
      color: 0x6eb6ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  earthAxis.add(atmo);

  // Faint outer halo
  const atmoOuter = new THREE.Mesh(
    new THREE.SphereGeometry(R_EARTH * 1.055, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x4a90d9,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  earthAxis.add(atmoOuter);

  // Thin bright limb edge for pad / LEO drama
  const atmoLimb = new THREE.Mesh(
    new THREE.SphereGeometry(R_EARTH * 1.012, 64, 48),
    new THREE.MeshBasicMaterial({
      color: 0xa8d8ff,
      transparent: true,
      opacity: 0.07,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  earthAxis.add(atmoLimb);

  // Spin axis (fixed under earthAxis — does not rotate with surface texture)
  earthAxis.add(createEarthAxisVisual());

  const moonGroup = new THREE.Group();
  const moonAxis = new THREE.Group();
  moonGroup.add(moonAxis);

  const moonCanvas = makeMoonTexture(1536);
  const moonMap = new THREE.CanvasTexture(moonCanvas);
  moonMap.colorSpace = THREE.SRGBColorSpace;
  moonMap.anisotropy = 8;

  const moonRough = new THREE.CanvasTexture(makeMoonRoughnessMap(moonCanvas));
  moonRough.anisotropy = 4;

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(R_MOON, 80, 56),
    new THREE.MeshStandardMaterial({
      map: moonMap,
      roughnessMap: moonRough,
      roughness: 0.96,
      metalness: 0.0,
    }),
  );
  moonAxis.add(moon);

  const { sun, sunGroup } = createSun();

  // Initial placement + spin / tidal lock
  updateBodies(0, {
    earthGroup,
    moonGroup,
    sunGroup,
    earth,
    earthClouds,
    moon,
    moonAxis,
    sun,
  });

  return {
    earth,
    earthClouds,
    moon,
    moonAxis,
    sun,
    earthGroup,
    moonGroup,
    sunGroup,
  };
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

  // Mission-time sidereal rotation about the tilted polar axis (local Y).
  // Same phase as physics/earthFrame (Starbase pad alignment).
  const spin = EARTH_SPIN0 + t * EARTH_SPIN_RATE;
  bodies.earth.rotation.y = spin;
  // Clouds drift a little faster than the ground
  bodies.earthClouds.rotation.y = spin * 1.03 + 0.35;

  // Axial tilt + 1:1 tidal lock (near side always toward Earth)
  orientMoonAxis(bodies.moonAxis, b.moon, b.earth);
}

/** Visual spin for the Sun only (Earth/Moon driven by mission time). */
export function spinBodies(bodies: Bodies, dt: number): void {
  bodies.sun.rotation.y += dt * 2.9e-6;
}

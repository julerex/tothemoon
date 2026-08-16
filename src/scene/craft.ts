import * as THREE from "three";
import {
  entryFlapDeflectionRad,
  shipAttitudeMode,
} from "../physics/flight13Attitude";
import type { PhaseId } from "../physics/missionTypes";
import {
  plumeGimbalOffset,
  plumeLook,
  plumeRegimeFor,
  plumeThrustLag,
  thrustFlicker,
  type PlumeLook,
} from "./plumeRegime";
import {
  FROST_PATCHES,
  frostPatchOpacity,
  frostStrength,
  ICE_FLAKES,
  iceFlakePose,
  iceShedStrength,
} from "./craftFrost";
import { createNameLabel } from "./zoomLabels";
import {
  HEX_TILE_MAP_SIZE,
  SHIP_HULL_MARK,
  paintHexTileMaps,
  paintHullMarkDecal,
  paintStainlessPhotoreal,
  tileGroutGlow,
} from "./craftHullMaps";

/**
 * Near-true-scale Super Heavy + Starship stack plus a red locator for system
 * views (hidden when the camera is closer than {@link CRAFT_LOCATOR_MIN_DIST_KM}).
 * Scene unit = 1 km. Mesh units × CRAFT_MESH_SCALE ≈ real meters / 1000.
 *
 * Local +Z = nose, −Z = engines (matches velocity look-at in main).
 *
 * Dimensions (Flight-test / Block-2–3 class, theater-rounded):
 *   diameter 9 m · ship ~52 m · Super Heavy ~71 m · stack ~123 m
 * V3 cues: three oversized grid fins, stainless barrel, windward tiles.
 *
 * V1 plumes: multi-layer soft sprites (no geometric cones) with regime tables
 * for atmosphere vs vacuum vs LOI/landing; dual lights during hot-stage.
 *
 * V4 materials: circumferential stainless anisotropy + weld rings readable at
 * fin cam; windward-only heat-shield edge wear; denser high-contrast grid fins
 * for grid-fin cam sky silhouette.
 *
 * Ship silhouette (Block 2 / V3): tangent-ogive nose (tip +Z), flush barrel
 * weld bands on the cylinder only, thin trapezoid flaps, 17 m wingspan.
 *
 * V7 entry: windward tile emissive from plasma; hinged flaps/elevons from
 * Flight 13 attitude (belly throw, transonic taper).
 *
 * V13 hull-cam: hexagonal TPS (not brick-offset rects), S40 stencil, stainless
 * oil-canning + heat tint, white experiment / missing tiles, residual grout glow.
 *
 * V14 launch: pink-magenta atmosphere plumes, Super Heavy cryo frost sheets,
 * ice-flake shed through max-Q.
 */
/** World km = mesh units × this. 1 mesh unit ≈ 40 m. */
export const CRAFT_MESH_SCALE = 0.04;

/**
 * Ship barrel weld-band fractions of ship height (cylinder only, nose → aft).
 * Kept off the ogive so they do not hover around the taper.
 */
export const SHIP_WELD_RING_FRACTIONS = [
  0.62, 0.54, 0.46, 0.38, 0.3, 0.22, 0.14,
] as const;

/** Booster barrel weld ring count (V4). */
export const BOOSTER_WELD_RING_COUNT = 9;

/** Grid-fin lattice lines per axis (V4 denser sky silhouette). */
export const GRID_FIN_LATTICE_N = 6;

/** Mesh units per real meter (before CRAFT_MESH_SCALE). */
const U = 1 / 40;

/** Vehicle diameter (m) → radius in mesh units. */
const DIA_M = 9;
const R = (DIA_M / 2) * U; // 0.1125

const SHIP_H_M = 52;
const BOOST_H_M = 71;
const SHIP_H = SHIP_H_M * U; // 1.3
const BOOST_H = BOOST_H_M * U; // 1.775

/** Tangent-ogive length (m) from tip to the 9 m barrel. */
export const SHIP_OGIVE_H_M = 17;
/** Fraction of ship height at the ogive/barrel join (engines = 0, tip = 1). */
export const SHIP_OGIVE_BASE_FRAC = (SHIP_H_M - SHIP_OGIVE_H_M) / SHIP_H_M;

const SHIP_OGIVE_H = SHIP_OGIVE_H_M * U;
const SHIP_OGIVE_BASE_Z = SHIP_H - SHIP_OGIVE_H;

/** Forward flap chord / span (m) — Block 2 class, ~18 m². */
export const FWD_FLAP_CHORD_M = 6.5;
export const FWD_FLAP_SPAN_M = 3.5;
/** Aft flap chord / span (m) — ~40 m² class; 9 + 2×4 = 17 m wingspan. */
export const AFT_FLAP_CHORD_M = 11;
export const AFT_FLAP_SPAN_M = 4;
/** Flap thickness (m) — Block 2 “thinner” forward flaps. */
export const FLAP_THICKNESS_M = 0.25;
/** Block 2 forward flaps: included angle about the leeward (−Y) axis. */
export const FWD_FLAP_INCLUDED_DEG = 140;

const FWD_FLAP_CHORD = FWD_FLAP_CHORD_M * U;
const FWD_FLAP_SPAN = FWD_FLAP_SPAN_M * U;
const AFT_FLAP_CHORD = AFT_FLAP_CHORD_M * U;
const AFT_FLAP_SPAN = AFT_FLAP_SPAN_M * U;
const FLAP_T = FLAP_THICKNESS_M * U;

/** Sea-level / vacuum Raptor exit radii (m → mesh). */
const SL_BELL_R = (1.3 / 2) * U;
const VAC_BELL_R = (2.4 / 2) * U;
const SL_BELL_H = 3.1 * U;
const VAC_BELL_H = 3.9 * U;

/** Shared materials for craft mesh construction. */
type CraftMats = {
  steel: THREE.MeshPhysicalMaterial;
  steelBright: THREE.MeshPhysicalMaterial;
  steelDark: THREE.MeshStandardMaterial;
  steelMatte: THREE.MeshStandardMaterial;
  weldMat: THREE.MeshStandardMaterial;
  tile: THREE.MeshStandardMaterial;
  tileEdge: THREE.MeshStandardMaterial;
  tileWear: THREE.MeshStandardMaterial;
  engine: THREE.MeshStandardMaterial;
  engineRim: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  finFrame: THREE.MeshStandardMaterial;
  finLattice: THREE.MeshStandardMaterial;
};

/** Physical stainless body with anisotropy + oil-canning bump. */
function makeSteelPhysical(
  color: number,
  stainless: {
    color: THREE.CanvasTexture;
    roughness: THREE.CanvasTexture;
    bump: THREE.CanvasTexture;
  },
  metalness: number,
  roughness: number,
  anisotropy: number,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    map: stainless.color,
    roughnessMap: stainless.roughness,
    bumpMap: stainless.bump,
    bumpScale: 0.72,
    metalness,
    roughness,
    anisotropy,
    anisotropyRotation: 0,
  });
}

/** Standard metal material helper. */
function makeMetalStd(
  color: number,
  metalness: number,
  roughness: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

/** Mapped tile material (optional V13 roughness / bump / grout emissive). */
function makeTileMat(
  map: THREE.CanvasTexture,
  metalness: number,
  roughness: number,
  extras?: {
    roughnessMap?: THREE.CanvasTexture;
    bumpMap?: THREE.CanvasTexture;
    emissiveMap?: THREE.CanvasTexture;
  },
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    metalness,
    roughness,
    roughnessMap: extras?.roughnessMap,
    bumpMap: extras?.bumpMap,
    bumpScale: extras?.bumpMap ? 0.38 : 0,
    emissiveMap: extras?.emissiveMap,
    emissive: extras?.emissiveMap ? 0xffffff : 0x000000,
    emissiveIntensity: 0,
  });
}

/** Tile / wear materials from heat-shield maps. */
function makeTileMats(): Pick<CraftMats, "tile" | "tileEdge" | "tileWear"> {
  const hex = makeHeatTileMaps();
  return {
    tile: makeTileMat(hex.color, 0.08, 0.86, {
      roughnessMap: hex.rough,
      bumpMap: hex.bump,
      emissiveMap: hex.emissive,
    }),
    tileEdge: makeMetalStd(0x1a1c20, 0.18, 0.82),
    tileWear: makeTileMat(makeHeatTileEdgeWearTexture(), 0.14, 0.78),
  };
}

/** Engine, accent, fin materials. */
function makeDetailMats(): Pick<
  CraftMats,
  "engine" | "engineRim" | "accent" | "finFrame" | "finLattice"
> {
  return {
    engine: makeMetalStd(0x12141a, 0.6, 0.38),
    engineRim: makeMetalStd(0x2a3038, 0.75, 0.35),
    accent: makeMetalStd(0x3a424c, 0.58, 0.42),
    finFrame: makeMetalStd(0x1c2026, 0.55, 0.48),
    finLattice: makeMetalStd(0x5a646e, 0.7, 0.38),
  };
}

/** Stainless body + dark/matte/weld metals. */
function makeSteelFamily(stainless: {
  color: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}): Pick<CraftMats, "steel" | "steelBright" | "steelDark" | "steelMatte" | "weldMat"> {
  return {
    steel: makeSteelPhysical(0xd0d4d8, stainless, 0.93, 0.22, 0.86),
    steelBright: makeSteelPhysical(0xe0e6ea, stainless, 0.95, 0.16, 0.90),
    steelDark: makeMetalStd(0x6a7078, 0.78, 0.4),
    steelMatte: makeMetalStd(0x9aa0a8, 0.68, 0.42),
    weldMat: makeMetalStd(0xb8c0c8, 0.95, 0.16),
  };
}

/** All craft materials (stainless maps shared). */
function makeCraftMaterials(): CraftMats {
  return {
    ...makeSteelFamily(makeStainlessMaps(512)),
    ...makeTileMats(),
    ...makeDetailMats(),
  };
}

/**
 * Tangent-ogive radius (m) at distance from the nose tip.
 * ρ = (R² + L²) / (2R); y = √(ρ² − (L − x)²) + R − ρ.
 */
export function shipOgiveRadiusM(xFromTipM: number): number {
  const len = SHIP_OGIVE_H_M;
  const baseR = DIA_M / 2;
  if (xFromTipM <= 0) return 0;
  if (xFromTipM >= len) return baseR;
  const rho = (baseR * baseR + len * len) / (2 * baseR);
  const d = len - xFromTipM;
  return Math.sqrt(Math.max(0, rho * rho - d * d)) + baseR - rho;
}

/** Lathe profile (radius, height along +Y) from barrel join (y=0) to tip. */
function shipOgivePoints(rScale = 1): THREE.Vector2[] {
  const n = 18;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const xFromTipM = (1 - t) * SHIP_OGIVE_H_M;
    const rM = Math.max(shipOgiveRadiusM(xFromTipM), 0.22);
    pts.push(new THREE.Vector2(rM * U * rScale, t * SHIP_OGIVE_H));
  }
  return pts;
}

/** Lathe ogive aligned to craft +Z (tip at +Z). */
function zOgive(rScale: number, mat: THREE.Material, phiStart = 0, phiLength = Math.PI * 2): THREE.Mesh {
  const geom = new THREE.LatheGeometry(shipOgivePoints(rScale), 28, phiStart, phiLength);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = SHIP_OGIVE_BASE_Z;
  return mesh;
}

/** Cylinder aligned to craft +Z (default Three cylinder is +Y). */
function zCylinder(
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  z: number,
  rotX = Math.PI / 2,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = rotX;
  mesh.position.z = z;
  return mesh;
}

/** Ship tangent-ogive nose (tip +Z). */
function addShipNose(ship: THREE.Group, mats: CraftMats): void {
  ship.add(zOgive(1, mats.steelBright));
}

/** Continuous 9 m barrel from aft skirt to ogive join. */
function addShipBarrel(ship: THREE.Group, mats: CraftMats): void {
  const barrelH = SHIP_OGIVE_BASE_Z;
  ship.add(zCylinder(new THREE.CylinderGeometry(R, R, barrelH, 28), mats.steel, barrelH * 0.5));
  ship.add(zCylinder(new THREE.CylinderGeometry(R * 1.04, R, 0.055, 28), mats.steelDark, 0.028));
}

/** Windward TPS on the cylindrical barrel (+Y). */
function addHeatMain(ship: THREE.Group, mats: CraftMats): void {
  const h = SHIP_OGIVE_BASE_Z - 0.05;
  ship.add(zCylinder(
    new THREE.CylinderGeometry(
      R * 1.012, R * 1.012, h, 36, 10, true, Math.PI * 0.68, Math.PI * 0.64,
    ),
    mats.tile,
    0.05 + h * 0.5,
  ));
}

/** Windward TPS following the ogive (same lathe, +Y arc). */
function addHeatFwd(ship: THREE.Group, mats: CraftMats): void {
  ship.add(zOgive(1.012, mats.tile, Math.PI * 0.68, Math.PI * 0.64));
}

/** Place a box on windward barrel at angle. */
function placeWindwardBox(
  ship: THREE.Group,
  geom: THREE.BoxGeometry,
  mat: THREE.Material,
  ang: number,
  rMul: number,
  z: number,
): void {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(Math.sin(ang) * R * rMul, Math.cos(ang) * R * rMul, z);
  mesh.rotation.z = -ang;
  ship.add(mesh);
}

/** One windward edge trim + wear strip. */
function addHeatEdgeSide(ship: THREE.Group, mats: CraftMats, side: number): void {
  const h = SHIP_OGIVE_BASE_Z - 0.06;
  const z = 0.05 + h * 0.5;
  placeWindwardBox(ship, new THREE.BoxGeometry(0.01, 0.016, h), mats.tileEdge, side * Math.PI * 0.32, 1.014, z);
  placeWindwardBox(ship, new THREE.BoxGeometry(0.014, 0.01, h * 0.95), mats.tileWear, side * Math.PI * 0.28, 1.016, z);
}

/** Windward TPS edge wear on main barrel sides. */
function addHeatEdgeWear(ship: THREE.Group, mats: CraftMats): void {
  addHeatEdgeSide(ship, mats, -1);
  addHeatEdgeSide(ship, mats, 1);
}

/** Forward heat-shield edge wear (ogive arc sides). */
function addHeatFwdWear(ship: THREE.Group, mats: CraftMats): void {
  const xFromTipM = SHIP_OGIVE_H_M * 0.55;
  const z = SHIP_H - xFromTipM * U;
  const r = shipOgiveRadiusM(xFromTipM) * U * 1.02;
  for (const side of [-1, 1] as const) {
    const ang = side * Math.PI * 0.3;
    const wearFwd = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.009, SHIP_OGIVE_H * 0.55), mats.tileWear);
    wearFwd.position.set(Math.sin(ang) * r, Math.cos(ang) * r, z);
    wearFwd.rotation.z = -ang;
    ship.add(wearFwd);
  }
}

/** Flight 13 S40 stencil on the stainless leeward (fin-cam readable). */
function addHullMark(ship: THREE.Group): void {
  const spec = SHIP_HULL_MARK;
  const canvas = makeSizedCanvas(256, 96);
  paintHullMarkDecal(canvas.getContext("2d")!, 256, 96, spec.text);
  const mat = new THREE.MeshStandardMaterial({
    map: finishCanvasTexture(canvas, true),
    transparent: true,
    depthWrite: false,
    metalness: 0.12,
    roughness: 0.58,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), mat);
  mesh.name = "hull-mark-s40";
  const r = R * 1.014;
  const z = spec.zFrac * SHIP_H;
  mesh.position.set(Math.sin(spec.ang) * r, Math.cos(spec.ang) * r, z);
  mesh.lookAt(mesh.position.x * 2, mesh.position.y * 2, z);
  ship.add(mesh);
}

/** Flush weld bands on the cylindrical barrel (not the ogive). */
function addShipWeldRings(ship: THREE.Group, mats: CraftMats): void {
  for (const f of SHIP_WELD_RING_FRACTIONS) {
    const z = f * SHIP_H;
    ship.add(makeFlushWeldBand(R * 1.002, 0.0022, z, mats.weldMat));
    ship.add(makeFlushWeldBand(R * 1.001, 0.0012, z - 0.004, mats.steelDark));
  }
}

type FlapSpec = {
  chord: number;
  span: number;
  thickness: number;
  sweepFwd: number;
  sweepAft: number;
};

/** Trapezoid in XY (x = span from hinge, y = chord); extrude along Z = thickness. */
function makeFlapGeom(spec: FlapSpec): THREE.ExtrudeGeometry {
  const c = spec.chord / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, -c);
  shape.lineTo(0, c);
  shape.lineTo(spec.span, c - spec.sweepFwd);
  shape.lineTo(spec.span, -c + spec.sweepAft);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: spec.thickness,
    bevelEnabled: false,
    steps: 1,
  });
  geom.translate(0, 0, -spec.thickness / 2);
  return geom;
}

/** Child meshes: local +X = span after rotX so pivot.rotation.x remains the hinge. */
function addFlapChildren(
  pivot: THREE.Group,
  spec: FlapSpec,
  mats: CraftMats,
  withWear: boolean,
): void {
  const body = new THREE.Mesh(makeFlapGeom(spec), mats.steelDark);
  body.rotation.x = Math.PI / 2;
  pivot.add(body);
  const tileSpec: FlapSpec = {
    chord: spec.chord * 0.88,
    span: spec.span * 0.92,
    thickness: spec.thickness * 0.22,
    sweepFwd: spec.sweepFwd * 0.88,
    sweepAft: spec.sweepAft * 0.88,
  };
  const tile = new THREE.Mesh(makeFlapGeom(tileSpec), mats.tile);
  tile.rotation.x = Math.PI / 2;
  tile.position.set(spec.span * 0.04, spec.thickness * 0.38, 0);
  pivot.add(tile);
  if (withWear) {
    const wear = new THREE.Mesh(
      new THREE.BoxGeometry(spec.span * 0.55, spec.thickness * 0.18, spec.chord * 0.12),
      mats.tileWear,
    );
    wear.position.set(spec.span * 0.45, spec.thickness * 0.42, -spec.chord * 0.22);
    pivot.add(wear);
  }
  const hinge = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, spec.thickness * 1.6, spec.chord * 0.22),
    mats.accent,
  );
  hinge.position.set(-0.004, 0, spec.chord * 0.12);
  pivot.add(hinge);
}

/** Named hinge: Euler ZYX so azimuth (Z) then pitch (X) for V7 belly throw. */
function makeFlapPivot(name: string, az: number, z: number, restX: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.rotation.order = "ZYX";
  pivot.position.set(Math.cos(az) * R, Math.sin(az) * R, z);
  pivot.rotation.z = az;
  pivot.rotation.x = restX;
  pivot.userData.restX = restX;
  return pivot;
}

/** Block 2 forward flaps: leeward, 140° included, on the lower ogive. */
function fwdFlapAz(side: number): number {
  const half = ((FWD_FLAP_INCLUDED_DEG * Math.PI) / 180) / 2;
  return -Math.PI / 2 + side * half;
}

function fwdFlapZ(): number {
  return SHIP_OGIVE_BASE_Z + 2.8 * U;
}

function addFwdFlap(ship: THREE.Group, mats: CraftMats, side: number): void {
  const spec: FlapSpec = {
    chord: FWD_FLAP_CHORD,
    span: FWD_FLAP_SPAN,
    thickness: FLAP_T,
    sweepFwd: FWD_FLAP_CHORD * 0.28,
    sweepAft: FWD_FLAP_CHORD * 0.06,
  };
  const pivot = makeFlapPivot(
    side < 0 ? "fwd-flap-L" : "fwd-flap-R",
    fwdFlapAz(side),
    fwdFlapZ(),
    0.08,
  );
  addFlapChildren(pivot, spec, mats, true);
  ship.add(pivot);
}

function addForwardFlaps(ship: THREE.Group, mats: CraftMats): void {
  addFwdFlap(ship, mats, -1);
  addFwdFlap(ship, mats, 1);
}

/**
 * Fin-cam mesh-local pose (before {@link CRAFT_MESH_SCALE}).
 * Nose-ward and outboard of the starboard forward flap so the locked lens
 * looks aft along the barrel instead of into a flap face.
 */
export const FIN_CAM_LOCAL = {
  x: Math.cos(fwdFlapAz(1)) * (R + FWD_FLAP_SPAN * 0.75),
  y: Math.sin(fwdFlapAz(1)) * (R + FWD_FLAP_SPAN * 0.75) + 0.04,
  z: fwdFlapZ() + FWD_FLAP_CHORD * 0.55,
} as const;

/** Fin-cam look — aft along the TPS/steel chine toward the engines. */
export const FIN_CAM_LOOK_LOCAL = {
  x: Math.cos(fwdFlapAz(1)) * (R + 0.04),
  y: Math.sin(fwdFlapAz(1)) * R * 0.15,
  z: 0.22,
} as const;

/** Fin-cam mount + look target on ship. */
function addFinCam(ship: THREE.Group): void {
  addNamedCam(
    ship,
    "fin-cam",
    "fin-cam-look",
    [FIN_CAM_LOCAL.x, FIN_CAM_LOCAL.y, FIN_CAM_LOCAL.z],
    [FIN_CAM_LOOK_LOCAL.x, FIN_CAM_LOOK_LOCAL.y, FIN_CAM_LOOK_LOCAL.z],
  );
}

/**
 * Entry left-pane flap-cam: starboard forward flap fills the left of frame
 * with the aft hull / Earth (plasma in the webcast) to the right.
 */
function addFlapCam(ship: THREE.Group): void {
  const az = fwdFlapAz(1);
  const z = fwdFlapZ();
  addNamedCam(
    ship,
    "flap-cam",
    "flap-cam-look",
    [
      Math.cos(az) * (R + FWD_FLAP_SPAN * 0.35),
      Math.sin(az) * (R + FWD_FLAP_SPAN * 0.35) + 0.12,
      z + FWD_FLAP_CHORD * 0.2,
    ],
    [
      Math.cos(az) * (R + FWD_FLAP_SPAN * 0.8),
      Math.sin(az) * R - 0.12,
      z - FWD_FLAP_CHORD * 0.35,
    ],
  );
}

/**
 * Webcast hull-cam: starboard barrel looking aft so the hull fills the left
 * of frame and Earth fills the rest (Flight 13 S40 stills).
 */
function addHullCam(ship: THREE.Group): void {
  addNamedCam(
    ship,
    "hull-cam",
    "hull-cam-look",
    [R + 0.42, 0.08, SHIP_OGIVE_BASE_Z * 0.92],
    [R * 0.12, -0.04, 0.04],
  );
}

function addNamedCam(
  host: THREE.Group,
  camName: string,
  lookName: string,
  camPos: readonly [number, number, number],
  lookPos: readonly [number, number, number],
): void {
  const cam = new THREE.Object3D();
  cam.name = camName;
  cam.position.set(camPos[0], camPos[1], camPos[2]);
  host.add(cam);
  const look = new THREE.Object3D();
  look.name = lookName;
  look.position.set(lookPos[0], lookPos[1], lookPos[2]);
  host.add(look);
}

/** Aft elevon + tile face on a named hinge pivot. */
function addAftFlap(ship: THREE.Group, mats: CraftMats, side: number): void {
  const spec: FlapSpec = {
    chord: AFT_FLAP_CHORD,
    span: AFT_FLAP_SPAN,
    thickness: FLAP_T * 1.15,
    sweepFwd: AFT_FLAP_CHORD * 0.1,
    sweepAft: AFT_FLAP_CHORD * 0.02,
  };
  const az = side > 0 ? 0 : Math.PI;
  const pivot = makeFlapPivot(
    side < 0 ? "aft-elevon-L" : "aft-elevon-R",
    az,
    6.5 * U,
    0,
  );
  addFlapChildren(pivot, spec, mats, false);
  const steelPatch = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.07, 0.11), mats.tile);
  steelPatch.position.set(spec.span * 0.35, -0.04, spec.chord * 0.08);
  pivot.add(steelPatch);
  ship.add(pivot);
}

function addAftFlaps(ship: THREE.Group, mats: CraftMats): void {
  addAftFlap(ship, mats, -1);
  addAftFlap(ship, mats, 1);
}

/** Ship SL + Vac engine bells. */
function addShipEngines(ship: THREE.Group, mats: CraftMats): void {
  const shipBells = new THREE.Group();
  shipBells.name = "ship-engines";
  const engZ = -0.02;
  addShipSlBells(shipBells, mats, engZ);
  addShipVacBells(shipBells, mats, engZ);
  ship.add(shipBells);
}

function addShipSlBells(g: THREE.Group, mats: CraftMats, engZ: number): void {
  for (const [x, y] of [[0, 0.028], [0.024, -0.014], [-0.024, -0.014]] as [number, number][]) {
    g.add(makeBell(SL_BELL_R * 0.55, SL_BELL_R, SL_BELL_H, x, y, engZ, mats.engine, mats.engineRim));
  }
}

function addShipVacBells(g: THREE.Group, mats: CraftMats, engZ: number): void {
  for (const [x, y] of [[0.07, 0.02], [-0.07, 0.02], [0, -0.075]] as [number, number][]) {
    g.add(makeBell(VAC_BELL_R * 0.45, VAC_BELL_R, VAC_BELL_H, x, y, engZ - 0.01, mats.engine, mats.engineRim));
  }
}

/** Ship plume + exhaust light. */
function addShipPlumeAndLight(ship: THREE.Group): void {
  const engZ = -0.02;
  const shipPlume = makePlumeGroup("plume-ship", "ship");
  shipPlume.position.z = engZ;
  ship.add(shipPlume);
  const shipExhaustLight = new THREE.PointLight(0x88ccff, 0, 0.22, 2);
  shipExhaustLight.name = "ship-exhaust-light";
  shipExhaustLight.position.set(0, 0, engZ - 0.04);
  ship.add(shipExhaustLight);
}

/** Assemble full ship stage group. */
function buildShip(mats: CraftMats): THREE.Group {
  const ship = new THREE.Group();
  ship.name = "ship";
  addShipStructure(ship, mats);
  addShipControlSurfaces(ship, mats);
  addShipPropulsion(ship, mats);
  ship.position.z = BOOST_H;
  ship.userData.stackedZ = BOOST_H;
  ship.userData.stagedZ = 0;
  ship.userData.heatMats = { tile: mats.tile, tileWear: mats.tileWear };
  return ship;
}

function addShipStructure(ship: THREE.Group, mats: CraftMats): void {
  addShipNose(ship, mats);
  addShipBarrel(ship, mats);
  addHeatMain(ship, mats);
  addHeatFwd(ship, mats);
  addHeatEdgeWear(ship, mats);
  addHeatFwdWear(ship, mats);
  addHullMark(ship);
  addShipWeldRings(ship, mats);
}

function addShipControlSurfaces(ship: THREE.Group, mats: CraftMats): void {
  addForwardFlaps(ship, mats);
  addFinCam(ship);
  addFlapCam(ship);
  addHullCam(ship);
  addAftFlaps(ship, mats);
}

function addShipPropulsion(ship: THREE.Group, mats: CraftMats): void {
  addShipEngines(ship, mats);
  addShipPlumeAndLight(ship);
}

/** Booster main barrel. */
function addBoostBody(booster: THREE.Group, mats: CraftMats): void {
  booster.add(zCylinder(
    new THREE.CylinderGeometry(R, R, BOOST_H * 0.88, 28),
    mats.steel,
    BOOST_H * 0.5,
  ));
}

/** One longitudinal chine ridge. */
function addBoostChine(booster: THREE.Group, mats: CraftMats, i: number): void {
  const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
  const chine = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, BOOST_H * 0.78), mats.steelBright);
  chine.position.set(Math.cos(ang) * R * 1.02, Math.sin(ang) * R * 1.02, BOOST_H * 0.5);
  chine.rotation.z = ang;
  booster.add(chine);
}

/** Four longitudinal chines. */
function addBoostChines(booster: THREE.Group, mats: CraftMats): void {
  for (let i = 0; i < 4; i++) addBoostChine(booster, mats, i);
}

/** Dense shiny weld rings on booster. */
function addBoostWeldRings(booster: THREE.Group, mats: CraftMats): void {
  for (let i = 0; i < BOOSTER_WELD_RING_COUNT; i++) {
    const z =
      BOOST_H * 0.9 -
      (i / Math.max(1, BOOSTER_WELD_RING_COUNT - 1)) * BOOST_H * 0.8;
    booster.add(makeBarrelRing(R * 1.009, 0.006, z, mats.weldMat));
    booster.add(makeBarrelRing(R * 1.006, 0.0028, z - 0.009, mats.steelDark));
  }
}

/** Hot-staging interstage ring. */
function addInterstage(booster: THREE.Group, mats: CraftMats): void {
  booster.add(zCylinder(
    new THREE.CylinderGeometry(R * 1.02, R * 1.02, 0.08, 28),
    mats.steelDark,
    BOOST_H - 0.02,
  ));
}

/** Interstage vent boxes. */
function addInterstageVents(booster: THREE.Group, mats: CraftMats): void {
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.022, 0.035), mats.accent);
    vent.position.set(Math.cos(ang) * R * 1.04, Math.sin(ang) * R * 1.04, BOOST_H - 0.02);
    vent.rotation.z = ang;
    booster.add(vent);
  }
}

type GridFinDims = { finH: number; finW: number; finT: number; finZ: number };

function gridFinDims(): GridFinDims {
  return { finH: 7.5 * U, finW: 3.75 * U, finT: 0.38 * U, finZ: BOOST_H - 0.35 };
}

/** Place three grid fins; return cam host angle/radius. */
function addGridFins(booster: THREE.Group, mats: CraftMats): {
  ang: number; r: number; finZ: number; finW: number;
} {
  const d = gridFinDims();
  const first = placeGridFin(booster, mats, 0, d);
  placeGridFin(booster, mats, 1, d);
  placeGridFin(booster, mats, 2, d);
  return { ang: first.ang, r: first.r, finZ: d.finZ, finW: d.finW };
}

function gridFinMats(mats: CraftMats) {
  return {
    frame: mats.finFrame,
    lattice: mats.finLattice,
    plate: mats.steelMatte,
    pivot: mats.steelDark,
  };
}

function placeGridFin(
  booster: THREE.Group,
  mats: CraftMats,
  i: number,
  d: GridFinDims,
): { ang: number; r: number } {
  const ang = Math.PI / 2 + (i * 2 * Math.PI) / 3;
  const fin = makeGridFin(d.finH, d.finW, d.finT, gridFinMats(mats));
  return poseGridFin(booster, fin, ang, d);
}

function poseGridFin(
  booster: THREE.Group,
  fin: THREE.Group,
  ang: number,
  d: GridFinDims,
): { ang: number; r: number } {
  const attachR = R + d.finH * 0.42;
  fin.position.set(Math.cos(ang) * attachR, Math.sin(ang) * attachR, d.finZ);
  fin.rotation.z = ang;
  fin.rotation.y = 0.05;
  booster.add(fin);
  return { ang, r: attachR + d.finH * 0.12 };
}

/** Grid-fin cam + look target. */
function addGridFinCam(
  booster: THREE.Group,
  ang: number,
  r: number,
  finZ: number,
  finW: number,
): void {
  addNamedCam(
    booster,
    "grid-fin-cam",
    "grid-fin-cam-look",
    [Math.cos(ang) * r, Math.sin(ang) * r, finZ + finW * 0.12],
    [Math.cos(ang) * R * 0.25, Math.sin(ang) * R * 0.25, 0.04],
  );
}

/** Booster hull-down cam (max-Q / Super Heavy landing stills). */
function addBoosterHullCam(booster: THREE.Group): void {
  addNamedCam(
    booster,
    "booster-hull-cam",
    "booster-hull-cam-look",
    [R + 0.36, 0.05, BOOST_H * 0.70],
    [R * 0.18, -0.05, BOOST_H * 0.08],
  );
}

/** Looking at the Raptor cluster (hot-stage left pane). */
function addEnginesCam(booster: THREE.Group): void {
  addNamedCam(
    booster,
    "engines-cam",
    "engines-cam-look",
    [0.09, 0.04, -0.22],
    [0, 0, -0.02],
  );
}

/** Looking past the bells at Earth (post-sep left pane). */
function addEnginesDownCam(booster: THREE.Group): void {
  addNamedCam(
    booster,
    "engines-down-cam",
    "engines-down-cam-look",
    [0.11, 0.03, 0.14],
    [0, 0, -0.38],
  );
}

function addBoostSkirtAndRaceway(booster: THREE.Group, mats: CraftMats): void {
  booster.add(zCylinder(new THREE.CylinderGeometry(R, R * 1.12, 0.14, 28), mats.steelDark, 0.08));
  const raceway = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.028, BOOST_H * 0.72), mats.steelDark);
  raceway.position.set(R * 1.05, 0, BOOST_H * 0.48);
  booster.add(raceway);
}

/** One ring of booster Raptors. */
function addBoostBellRing(
  g: THREE.Group,
  mats: CraftMats,
  n: number,
  r: number,
  br: number,
  h: number,
  bellZ: number,
): void {
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (n === 3 ? 0 : 0.08);
    g.add(makeBell(br * 0.55, br, h, Math.cos(ang) * r, Math.sin(ang) * r, bellZ, mats.engine, mats.engineRim));
  }
}

function addBoostBellField(booster: THREE.Group, mats: CraftMats, bellZ: number): void {
  const boostBells = new THREE.Group();
  boostBells.name = "booster-engines";
  const br = 0.65 * U * 1.2;
  addBoostBellRing(boostBells, mats, 3, 0.9 * U, br * 0.95, 0.11, bellZ);
  addBoostBellRing(boostBells, mats, 10, 2.05 * U, br, 0.105, bellZ);
  addBoostBellRing(boostBells, mats, 20, 3.25 * U, br * 1.02, 0.1, bellZ);
  booster.add(boostBells);
}

function addBoostEngines(booster: THREE.Group, mats: CraftMats): void {
  const bellZ = -0.02;
  addBoostBellField(booster, mats, bellZ);
  const boostPlume = makePlumeGroup("plume-booster", "booster");
  boostPlume.position.z = bellZ;
  booster.add(boostPlume);
}

function addBoostFrost(booster: THREE.Group): void {
  const g = new THREE.Group();
  g.name = "frost-patches";
  const baseMat = makeFrostMaterial();
  for (const spec of FROST_PATCHES) {
    const mat = baseMat.clone();
    const h = spec.hFrac * BOOST_H;
    const mesh = zCylinder(
      new THREE.CylinderGeometry(R * spec.rMul, R * spec.rMul, h, 24, 1, true),
      mat,
      spec.zFrac * BOOST_H,
    );
    mesh.userData.phase = spec.phase;
    mesh.userData.mat = mat;
    g.add(mesh);
  }
  booster.add(g);
}

function addBoostUpper(booster: THREE.Group, mats: CraftMats): void {
  addBoostBody(booster, mats);
  addBoostChines(booster, mats);
  addBoostWeldRings(booster, mats);
  addBoostFrost(booster);
  addInterstage(booster, mats);
  addInterstageVents(booster, mats);
}

function makeFrostMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xf2f6fa,
    map: makeFrostTexture(),
    roughness: 0.92,
    metalness: 0.08,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function paintFrostBlotch(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  i: number,
): void {
  const x = ((i * 37) % w);
  const y = ((i * 53) % h);
  const rw = 8 + (i % 14);
  const rh = 12 + ((i * 3) % 22);
  const a = 0.12 + ((i * 7) % 10) / 28;
  ctx.fillStyle = i % 5 === 0 ? `rgba(210, 220, 230, ${a})` : `rgba(244, 248, 252, ${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rw, rh, (i % 8) * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function makeFrostTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = makeSizedCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(236, 242, 246, 0.18)";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) paintFrostBlotch(ctx, w, h, i);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  return map;
}

function addBoostLower(booster: THREE.Group, mats: CraftMats): void {
  const cam = addGridFins(booster, mats);
  addGridFinCam(booster, cam.ang, cam.r, cam.finZ, cam.finW);
  addBoosterHullCam(booster);
  addEnginesCam(booster);
  addEnginesDownCam(booster);
  addBoostSkirtAndRaceway(booster, mats);
  addBoostEngines(booster, mats);
}

function buildBooster(mats: CraftMats): THREE.Group {
  const booster = new THREE.Group();
  booster.name = "booster";
  addBoostUpper(booster, mats);
  addBoostLower(booster, mats);
  return booster;
}

function addExhaustLight(mesh: THREE.Group): void {
  const exhaustLight = new THREE.PointLight(0xff9a58, 0, 0.35, 2);
  exhaustLight.name = "exhaust-light";
  exhaustLight.position.set(0, 0, -0.08);
  mesh.add(exhaustLight);
}

function addShipNameLabel(group: THREE.Group): void {
  const shipLabel = createNameLabel("STARSHIP", "#ff8a7a", {
    targetPx: 16,
    aspect: 256 / 64,
    minH: 0.015,
  });
  shipLabel.position.set(0, 0, (BOOST_H + SHIP_H) * CRAFT_MESH_SCALE * 0.92);
  group.add(shipLabel);
}

function buildCraftMesh(mats: CraftMats): THREE.Group {
  const mesh = new THREE.Group();
  mesh.add(buildShip(mats));
  mesh.add(buildBooster(mats));
  addExhaustLight(mesh);
  mesh.add(makeCondensationCloud(BOOST_H + SHIP_H, R));
  mesh.add(makeIceFlakeGroup());
  mesh.scale.setScalar(CRAFT_MESH_SCALE);
  return mesh;
}

/** Root group with mesh, locator, and name plate. */
function assembleCraftRoot(mesh: THREE.Group): {
  group: THREE.Group;
  mesh: THREE.Group;
  locator: THREE.Sprite;
} {
  const group = new THREE.Group();
  group.add(mesh);
  const locator = createLocatorSprite();
  group.add(locator);
  addShipNameLabel(group);
  return { group, mesh, locator };
}

export function createCraft(): {
  group: THREE.Group;
  mesh: THREE.Group;
  locator: THREE.Sprite;
} {
  return assembleCraftRoot(buildCraftMesh(makeCraftMaterials()));
}

function makeBarrelRing(
  radius: number,
  tube: number,
  z: number,
  mat: THREE.Material,
): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 36), mat);
  ring.position.z = z;
  return ring;
}

/** Thin open cylinder flush to the barrel (ship welds — not a hovering torus). */
function makeFlushWeldBand(
  radius: number,
  height: number,
  z: number,
  mat: THREE.Material,
): THREE.Mesh {
  return zCylinder(
    new THREE.CylinderGeometry(radius, radius, height, 36, 1, true),
    mat,
    z,
  );
}

/** Super Heavy grid fin with dark outer frame + denser lattice (V4). */
function makeGridFin(
  finH: number,
  finW: number,
  finT: number,
  mats: {
    frame: THREE.Material;
    lattice: THREE.Material;
    plate: THREE.Material;
    pivot: THREE.Material;
  },
): THREE.Group {
  const fin = new THREE.Group();
  fin.name = "grid-fin";
  addGridFinPlate(fin, finH, finW, finT, mats.plate);
  addGridFinFrame(fin, finH, finW, finT, mats.frame);
  addGridFinLattice(fin, finH, finW, finT, mats.lattice);
  addGridFinPivot(fin, finH, mats.pivot);
  return fin;
}

function addGridFinPlate(
  fin: THREE.Group,
  finH: number,
  finW: number,
  finT: number,
  mat: THREE.Material,
): void {
  fin.add(new THREE.Mesh(
    new THREE.BoxGeometry(finH * 0.96, finT * 0.55, finW * 0.96),
    mat,
  ));
}

function addFrameBarsZ(
  fin: THREE.Group,
  finH: number,
  finW: number,
  frameT: number,
  frameBar: number,
  mat: THREE.Material,
): void {
  for (const z of [-finW * 0.5, finW * 0.5]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(finH * 1.02, frameT, frameBar), mat);
    bar.position.z = z;
    fin.add(bar);
  }
}

function addFrameBarsX(
  fin: THREE.Group,
  finH: number,
  finW: number,
  frameT: number,
  frameBar: number,
  mat: THREE.Material,
): void {
  for (const x of [-finH * 0.5, finH * 0.5]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(frameBar, frameT, finW * 1.02), mat);
    bar.position.x = x;
    fin.add(bar);
  }
}

function addGridFinFrame(
  fin: THREE.Group,
  finH: number,
  finW: number,
  finT: number,
  mat: THREE.Material,
): void {
  const frameT = finT * 1.55;
  const frameBar = finT * 1.35;
  addFrameBarsZ(fin, finH, finW, frameT, frameBar, mat);
  addFrameBarsX(fin, finH, finW, frameT, frameBar, mat);
}

function addGridFinLattice(
  fin: THREE.Group,
  finH: number,
  finW: number,
  finT: number,
  mat: THREE.Material,
): void {
  const nLat = GRID_FIN_LATTICE_N;
  for (let i = 0; i < nLat; i++) {
    const t = (i + 0.5) / nLat - 0.5;
    addLatticeCross(fin, finH, finW, finT, mat, t);
  }
}

function addLatticeCross(
  fin: THREE.Group,
  finH: number,
  finW: number,
  finT: number,
  mat: THREE.Material,
  t: number,
): void {
  const zBar = new THREE.Mesh(new THREE.BoxGeometry(finH * 0.9, finT * 0.95, finT * 0.72), mat);
  zBar.position.z = t * finW * 0.88;
  fin.add(zBar);
  const xBar = new THREE.Mesh(new THREE.BoxGeometry(finT * 0.72, finT * 0.95, finW * 0.9), mat);
  xBar.position.x = t * finH * 0.88;
  fin.add(xBar);
}

function addGridFinPivot(fin: THREE.Group, finH: number, mat: THREE.Material): void {
  const pivot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.016, 0.048, 10),
    mat,
  );
  pivot.rotation.z = Math.PI / 2;
  pivot.position.x = -finH * 0.45;
  fin.add(pivot);
}

/** Fill base steel color + roughness canvases. */
function fillStainlessBase(
  cctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  cctx.fillStyle = "#c4c8cc";
  cctx.fillRect(0, 0, w, h);
  rctx.fillStyle = "#6a6a6a";
  rctx.fillRect(0, 0, w, h);
}

/** Circumferential brush streaks. */
function paintStainlessBrush(
  cctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  for (let y = 0; y < h; y++) {
    const n = ((y * 17 + 31) % 13) - 6;
    const lum = 188 + n * 2;
    cctx.fillStyle = `rgb(${lum},${lum + 2},${lum + 4})`;
    cctx.fillRect(0, y, w, 1);
    const rough = 95 + ((y * 13) % 40);
    rctx.fillStyle = `rgb(${rough},${rough},${rough})`;
    rctx.fillRect(0, y, w, 1);
  }
}

function paintStainlessGrain(cctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < w * h * 0.04; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    cctx.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`;
    cctx.fillRect(x, y, 1, 1);
  }
}

function paintOneWeldBand(
  cctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fy: number,
): void {
  const y = fy * h;
  const band = Math.max(2, h * 0.012);
  paintWeldColorBand(cctx, w, y, band);
  paintWeldRoughBand(rctx, w, y, band);
}

function paintWeldColorBand(
  cctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  band: number,
): void {
  const g = cctx.createLinearGradient(0, y - band, 0, y + band);
  g.addColorStop(0, "rgba(180,185,190,0)");
  g.addColorStop(0.35, "rgba(210,216,222,0.55)");
  g.addColorStop(0.5, "rgba(230,236,240,0.75)");
  g.addColorStop(0.65, "rgba(210,216,222,0.55)");
  g.addColorStop(1, "rgba(180,185,190,0)");
  cctx.fillStyle = g;
  cctx.fillRect(0, y - band, w, band * 2);
}

function paintWeldRoughBand(
  rctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  band: number,
): void {
  rctx.fillStyle = "#a8a8a8";
  rctx.fillRect(0, y - band * 1.4, w, band * 0.5);
  rctx.fillStyle = "#404040";
  rctx.fillRect(0, y - band * 0.35, w, band * 0.7);
  rctx.fillStyle = "#a8a8a8";
  rctx.fillRect(0, y + band * 0.9, w, band * 0.5);
}

function paintStainlessWelds(
  cctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  for (const fy of [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92]) {
    paintOneWeldBand(cctx, rctx, w, h, fy);
  }
}

function paintStainlessChines(cctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (const fx of [0.12, 0.37, 0.62, 0.87]) {
    const x = fx * w;
    cctx.fillStyle = "rgba(255,255,255,0.08)";
    cctx.fillRect(x - 1, 0, 2, h);
    cctx.fillStyle = "rgba(0,0,0,0.06)";
    cctx.fillRect(x + 2, 0, 1, h);
  }
}

function finishCanvasTexture(
  canvas: HTMLCanvasElement,
  srgb: boolean,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = srgb ? 8 : 4;
  return tex;
}

/**
 * Procedural stainless maps for cylinder UV (U = circumference, V = height).
 * Circumferential brush streaks, weld bands, oil-canning bump, and heat tint
 * for fin-cam close-ups (V13).
 */
function makeSizedCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function stainlessTextures(
  colorCanvas: HTMLCanvasElement,
  roughCanvas: HTMLCanvasElement,
): { color: THREE.CanvasTexture; roughness: THREE.CanvasTexture } {
  return {
    color: finishCanvasTexture(colorCanvas, true),
    roughness: finishCanvasTexture(roughCanvas, false),
  };
}

function makeStainlessMaps(size = 512): {
  color: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const colorCanvas = makeSizedCanvas(size, size);
  const roughCanvas = makeSizedCanvas(size, size);
  const bumpCanvas = makeSizedCanvas(size, size);
  paintStainlessMaps(colorCanvas, roughCanvas, bumpCanvas, size, size);
  return {
    ...stainlessTextures(colorCanvas, roughCanvas),
    bump: finishCanvasTexture(bumpCanvas, false),
  };
}

function paintStainlessMaps(
  colorCanvas: HTMLCanvasElement,
  roughCanvas: HTMLCanvasElement,
  bumpCanvas: HTMLCanvasElement,
  w: number,
  h: number,
): void {
  const cctx = colorCanvas.getContext("2d")!;
  const rctx = roughCanvas.getContext("2d")!;
  const bctx = bumpCanvas.getContext("2d")!;
  fillStainlessBase(cctx, rctx, w, h);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, w, h);
  paintStainlessBrush(cctx, rctx, w, h);
  paintStainlessGrain(cctx, w, h);
  paintStainlessWelds(cctx, rctx, w, h);
  paintStainlessChines(cctx, w, h);
  paintStainlessPhotoreal(cctx, rctx, bctx, w, h);
}

function makeBellBody(rTop: number, rBot: number, h: number, bodyMat: THREE.Material): THREE.Mesh {
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 10, 1, true), bodyMat);
  bell.rotation.x = Math.PI / 2;
  return bell;
}

function makeBellRim(rBot: number, h: number, rimMat: THREE.Material): THREE.Mesh {
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rBot * 0.92, rBot * 0.08, 4, 12), rimMat);
  rim.position.z = -h * 0.5;
  return rim;
}

function makeBell(
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  bodyMat: THREE.Material,
  rimMat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  g.add(makeBellBody(rTop, rBot, h, bodyMat));
  g.add(makeBellRim(rBot, h, rimMat));
  g.position.set(x, y, z);
  return g;
}

type PlumePalette = "booster" | "ship";

type PlumeLayerSpec = {
  id: string;
  baseScale: number;
  yStretch: number;
  baseOpacity: number;
  z: number;
  layer: number;
};

const BOOSTER_PLUME_LAYERS: PlumeLayerSpec[] = [
  { id: "outer", baseScale: 1.35, yStretch: 1.55, baseOpacity: 0.28, z: -0.14, layer: 2 },
  { id: "mid", baseScale: 0.85, yStretch: 1.25, baseOpacity: 0.48, z: -0.09, layer: 1 },
  { id: "core", baseScale: 0.42, yStretch: 1.0, baseOpacity: 0.72, z: -0.05, layer: 0 },
];

const SHIP_PLUME_LAYERS: PlumeLayerSpec[] = [
  { id: "outer", baseScale: 0.95, yStretch: 1.65, baseOpacity: 0.26, z: -0.12, layer: 2 },
  { id: "mid", baseScale: 0.58, yStretch: 1.3, baseOpacity: 0.45, z: -0.08, layer: 1 },
  { id: "core", baseScale: 0.3, yStretch: 1.05, baseOpacity: 0.7, z: -0.045, layer: 0 },
];

/** Soft multi-layer exhaust sprites (billboarded). Tint via material.color at runtime. */
function makePlumeGroup(name: string, palette: PlumePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.visible = false;
  const layers = palette === "booster" ? BOOSTER_PLUME_LAYERS : SHIP_PLUME_LAYERS;
  for (const L of layers) g.add(makePlumeLayerFromSpec(name, palette, L));
  return g;
}

function configurePlumeLayer(sprite: THREE.Sprite, L: PlumeLayerSpec): void {
  sprite.userData.baseScale = L.baseScale;
  sprite.userData.yStretch = L.yStretch;
  sprite.userData.baseOpacity = L.baseOpacity;
  sprite.userData.baseZ = L.z;
  sprite.userData.layer = L.layer;
  sprite.position.z = L.z;
  sprite.scale.set(L.baseScale, L.baseScale * L.yStretch, 1);
  sprite.visible = false;
}

function makePlumeLayerFromSpec(
  name: string,
  palette: PlumePalette,
  L: PlumeLayerSpec,
): THREE.Sprite {
  const sprite = makePlumeLayerSprite(palette);
  sprite.name =
    palette === "booster" && L.id === "mid" ? "exhaust-glow" : `${name}-${L.id}`;
  configurePlumeLayer(sprite, L);
  return sprite;
}

function paintPlumeGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: PlumePalette,
): void {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.28, 1, w * 0.5, h * 0.28, h * 0.72);
  if (palette === "booster") paintBoosterPlumeStops(g);
  else paintShipPlumeStops(g);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function paintBoosterPlumeStops(g: CanvasGradient): void {
  g.addColorStop(0, "rgba(255, 220, 240, 0.92)");
  g.addColorStop(0.16, "rgba(255, 90, 190, 0.58)");
  g.addColorStop(0.42, "rgba(220, 20, 150, 0.22)");
  g.addColorStop(1, "rgba(160, 0, 110, 0)");
}

function paintShipPlumeStops(g: CanvasGradient): void {
  g.addColorStop(0, "rgba(255, 252, 255, 0.92)");
  g.addColorStop(0.2, "rgba(230, 220, 245, 0.48)");
  g.addColorStop(0.5, "rgba(180, 170, 230, 0.14)");
  g.addColorStop(1, "rgba(140, 130, 220, 0)");
}

function makePlumeLayerSprite(palette: PlumePalette): THREE.Sprite {
  const w = 64;
  const h = 96;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paintPlumeGradient(canvas.getContext("2d")!, w, h, palette);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(plumeSpriteMaterial(map));
}

function plumeSpriteMaterial(map: THREE.CanvasTexture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    depthTest: true,
  });
}

/**
 * Drive multi-layer plume sprites from thrust fraction + regime look.
 * @param u thrust fraction in [0, 1] (already lagged / hot-stage synthetic)
 */
function hidePlumeChildren(plume: THREE.Object3D): void {
  for (const child of plume.children) child.visible = false;
}

function showPlumeLayers(
  plume: THREE.Object3D,
  u: number,
  look: PlumeLook,
  flicker: number,
  missionT: number,
): void {
  const thrustScale = 0.45 + 0.7 * Math.sqrt(Math.max(u, 0.05));
  for (const child of plume.children) {
    if (child instanceof THREE.Sprite) {
      applyOnePlumeLayer(child, u, look, flicker, missionT, thrustScale);
    }
  }
}

export function applyPlumeLayers(
  plume: THREE.Object3D,
  u: number,
  look: PlumeLook,
  flicker: number,
  missionT: number,
): void {
  const on = u > 0.02;
  plume.visible = on;
  if (!on) hidePlumeChildren(plume);
  else showPlumeLayers(plume, u, look, flicker, missionT);
}

function applyOnePlumeLayer(
  child: THREE.Sprite,
  u: number,
  look: PlumeLook,
  flicker: number,
  missionT: number,
  thrustScale: number,
): void {
  const baseScale = (child.userData.baseScale as number) ?? 0.5;
  const yStretch = (child.userData.yStretch as number) ?? 1;
  const baseOp = (child.userData.baseOpacity as number) ?? 0.4;
  const baseZ = (child.userData.baseZ as number) ?? -0.08;
  const layer = (child.userData.layer as number) ?? 0;
  posePlumeSprite(child, baseScale, yStretch, baseOp, baseZ, layer, u, look, flicker, missionT, thrustScale);
}

function posePlumeSprite(
  child: THREE.Sprite,
  baseScale: number,
  yStretch: number,
  baseOp: number,
  baseZ: number,
  layer: number,
  u: number,
  look: PlumeLook,
  flicker: number,
  missionT: number,
  thrustScale: number,
): void {
  const s = baseScale * look.radial * thrustScale * flicker;
  const sy = s * yStretch * look.length * (0.92 + 0.08 * flicker);
  child.scale.set(s, sy, 1);
  tintPlumeSprite(child, baseOp, layer, u, look, flicker);
  const gimbal = plumeGimbalOffset(missionT, layer);
  child.position.set(gimbal.x, gimbal.y, baseZ * look.length);
  child.visible = true;
}

function tintPlumeSprite(
  child: THREE.Sprite,
  baseOp: number,
  layer: number,
  u: number,
  look: PlumeLook,
  flicker: number,
): void {
  const mat = child.material as THREE.SpriteMaterial;
  mat.opacity = baseOp * look.opacity * (0.72 + 0.38 * u) * (0.88 + 0.12 * flicker);
  const mix = layer / 2;
  mat.color.setRGB(
    look.core[0]! * (1 - mix) + look.rim[0]! * mix,
    look.core[1]! * (1 - mix) + look.rim[1]! * mix,
    look.core[2]! * (1 - mix) + look.rim[2]! * mix,
  );
}

/**
 * Hexagonal TPS maps for the windward heat shield (V13).
 * Color + roughness + bump + grout emissive; chine columns run warmer.
 */
function makeHeatTileMaps(): {
  color: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
} {
  const { w, h } = HEX_TILE_MAP_SIZE;
  const color = makeSizedCanvas(w, h);
  const rough = makeSizedCanvas(w, h);
  const bump = makeSizedCanvas(w, h);
  const emissive = makeSizedCanvas(w, h);
  paintHexTileMaps({ color, rough, bump, emissive });
  return {
    color: finishHeatMap(color, true),
    rough: finishHeatMap(rough, false),
    bump: finishHeatMap(bump, false),
    emissive: finishHeatMap(emissive, true),
  };
}

function finishHeatMap(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  if (srgb) map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return map;
}

function paintEdgeWearBase(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, "#1a1410");
  base.addColorStop(0.35, "#3a3228");
  base.addColorStop(0.55, "#5a5040");
  base.addColorStop(0.75, "#2a2620");
  base.addColorStop(1, "#12141a");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
}

function paintEdgeWearStreaks(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    const a = 0.08 + Math.random() * 0.2;
    ctx.fillStyle =
      Math.random() < 0.4 ? `rgba(180,160,120,${a})` : `rgba(20,18,16,${a + 0.1})`;
    ctx.fillRect(x, 0, 1 + Math.random() * 2, h);
  }
}

function paintEdgeWearChips(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < 12; i++) {
    const y = (i / 12) * h + Math.random() * 8;
    ctx.fillStyle = i % 3 === 0 ? "#b8bcc4" : "#2c2824";
    ctx.fillRect(w * 0.25, y, w * 0.5, 3 + Math.random() * 4);
  }
}

/**
 * Narrow edge-wear strip texture (ablated / soot streak) for windward trims.
 */
function makeHeatTileEdgeWearTexture(): THREE.CanvasTexture {
  const canvas = makeSizedCanvas(64, 256);
  const ctx = canvas.getContext("2d")!;
  paintEdgeWearBase(ctx, 64, 256);
  paintEdgeWearStreaks(ctx, 64, 256);
  paintEdgeWearChips(ctx, 64, 256);
  return finishHeatMap(canvas);
}

function paintCondenseGradient(ctx: CanvasRenderingContext2D, size: number): void {
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(230, 235, 240, 0.9)");
  grad.addColorStop(0.35, "rgba(200, 210, 220, 0.4)");
  grad.addColorStop(1, "rgba(180, 190, 200, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

function makeCondenseMap(): THREE.CanvasTexture {
  const size = 64;
  const canvas = makeSizedCanvas(size, size);
  paintCondenseGradient(canvas.getContext("2d")!, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

const CONDENSE_PUFFS: { zFrac: number; s: number; phase: number }[] = [
  { zFrac: 0.92, s: 0.55, phase: 0.2 },
  { zFrac: 0.72, s: 0.7, phase: 1.1 },
  { zFrac: 0.52, s: 0.85, phase: 2.0 },
  { zFrac: 0.35, s: 0.95, phase: 0.7 },
  { zFrac: 0.2, s: 1.05, phase: 1.6 },
  { zFrac: 0.08, s: 0.9, phase: 2.4 },
];

function addCondensePuffs(g: THREE.Group, map: THREE.CanvasTexture, stackH: number): void {
  for (const p of CONDENSE_PUFFS) {
    g.add(makeCondensePuff(map, p.zFrac * stackH, p.s, p.phase));
  }
}

function condensePuffMaterial(map: THREE.CanvasTexture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
}

function makeCondensePuff(
  map: THREE.CanvasTexture,
  z: number,
  s: number,
  phase: number,
): THREE.Sprite {
  const sprite = new THREE.Sprite(condensePuffMaterial(map));
  sprite.position.set(0, 0, z);
  sprite.scale.setScalar(s);
  sprite.userData.baseScale = s;
  sprite.userData.phase = phase;
  return sprite;
}

function makeSheathMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xc8d0d8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makeSheathMesh(stackH: number, radius: number, sheathMat: THREE.MeshBasicMaterial): THREE.Mesh {
  const sheath = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 2.2, radius * 2.8, stackH * 0.85, 20, 1, true),
    sheathMat,
  );
  sheath.rotation.x = Math.PI / 2;
  sheath.position.z = stackH * 0.45;
  sheath.name = "condense-sheath";
  sheath.userData.mat = sheathMat;
  return sheath;
}

function addCondenseSheath(g: THREE.Group, stackH: number, radius: number): void {
  g.add(makeSheathMesh(stackH, radius, makeSheathMaterial()));
}

function configureIceFlake(sprite: THREE.Sprite, spec: (typeof ICE_FLAKES)[number]): void {
  sprite.position.set(
    Math.cos(spec.ang) * spec.r0,
    Math.sin(spec.ang) * spec.r0,
    spec.z0,
  );
  sprite.scale.setScalar(spec.scale);
  sprite.userData.ang = spec.ang;
  sprite.userData.r0 = spec.r0;
  sprite.userData.z0 = spec.z0;
  sprite.userData.scale = spec.scale;
  sprite.userData.phase = spec.phase;
}

function makeIceFlakeGroup(): THREE.Group {
  const g = new THREE.Group();
  g.name = "ice-flakes";
  g.visible = false;
  const map = makeCondenseMap();
  for (const spec of ICE_FLAKES) {
    const sprite = new THREE.Sprite(condensePuffMaterial(map));
    configureIceFlake(sprite, spec);
    g.add(sprite);
  }
  return g;
}

/**
 * Soft vapor / condensation sheath around the stack (Maximum dynamic pressure theater cue).
 * Sprites face the camera; opacity driven by altitude in updateCraftVisuals.
 */
function makeCondensationCloud(stackH: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "condense-cloud";
  g.visible = false;
  addCondensePuffs(g, makeCondenseMap(), stackH);
  addCondenseSheath(g, stackH, radius);
  return g;
}

function paintLocatorDisc(
  ctx: CanvasRenderingContext2D,
  size: number,
  coreCss: string,
  glowRgb: string,
): void {
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, `rgba(${glowRgb}, 1)`);
  g.addColorStop(0.25, `rgba(${glowRgb}, 0.9)`);
  g.addColorStop(0.55, `rgba(${glowRgb}, 0.25)`);
  g.addColorStop(1, `rgba(${glowRgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  paintLocatorCore(ctx, coreCss);
}

function paintLocatorCore(ctx: CanvasRenderingContext2D, coreCss: string): void {
  ctx.beginPath();
  ctx.arc(32, 32, 5, 0, Math.PI * 2);
  ctx.fillStyle = coreCss;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Soft glowing locator dot (constant on-screen size via updateLocatorVisibility).
 * @param coreCss solid disc color
 * @param glowRgb "r, g, b" for the outer halo
 */
export function createLocatorSprite(
  coreCss = "#ff2233",
  glowRgb = "255, 40, 55",
  name = "locator",
): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paintLocatorDisc(canvas.getContext("2d")!, size, coreCss, glowRgb);
  return finishLocatorSprite(canvas, name);
}

function locatorMaterial(map: THREE.CanvasTexture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
}

function finishLocatorSprite(canvas: HTMLCanvasElement, name: string): THREE.Sprite {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(locatorMaterial(map));
  sprite.renderOrder = 5;
  sprite.scale.set(1, 1, 1);
  sprite.name = name;
  sprite.visible = false;
  return sprite;
}

export type CraftVisualState = {
  staged: boolean;
  burning: boolean;
  /** Thrust force (N); scales plume size */
  thrustN: number;
  /** Mission time (s) — deterministic plume flicker when scrubbing */
  missionT?: number;
  /** Stage-out epoch (s); enables hot-staging dual-plume window */
  stageT?: number | null;
  /** Altitude above Earth (km) — maximum dynamic pressure condensation envelope */
  altEarth?: number;
  phase?: string;
  /**
   * Active ship landing engines (1–3) for Flight 13 3→2→1 step-down.
   * Undefined / 0 → full ship plume when burning.
   */
  shipEngineCount?: number;
  /**
   * Entry plasma strength [0, 1] — drives windward tile emissive / char.
   * Omit on missions without atmospheric entry.
   */
  plasmaStrength?: number;
};

/** Reference thrust (N) for plume size normalization. */
const BOOSTER_THRUST_REF = 1.4e8;
const SHIP_THRUST_REF = 8e6;
const HOT_STAGE_PRE_S = 4.0;
const HOT_STAGE_POST_S = 1.2;

/**
 * Theater maximum dynamic pressure condensation strength in [0,1].
 */
function condensationStrength(
  phase: string | undefined,
  missionT: number,
  burning: boolean,
): number {
  if (!burning) return 0;
  if (phase !== "launch" && phase !== "ascent") return 0;
  if (missionT < 8 || missionT > 140) return 0;
  return condensationBell(missionT);
}

function condensationBell(missionT: number): number {
  const d = (missionT - 55) / 22;
  const bell = Math.exp(-0.5 * d * d);
  const padGate = THREE.MathUtils.smoothstep(missionT, 12, 28);
  return THREE.MathUtils.clamp(bell * padGate * 1.2, 0, 1);
}

/** Hot-stage pre/post fractions from stage epoch. */
function hotStageFractions(
  missionT: number,
  stageT: number | null,
  staged: boolean,
): { hotPre: number; hotPost: number } {
  if (stageT == null || !Number.isFinite(stageT)) return { hotPre: 0, hotPost: 0 };
  return {
    hotPre: hotPreFraction(missionT, stageT, staged),
    hotPost: hotPostFraction(missionT, stageT, staged),
  };
}

function hotPreFraction(missionT: number, stageT: number, staged: boolean): number {
  if (staged || missionT < stageT - HOT_STAGE_PRE_S || missionT >= stageT) return 0;
  const hotPre = THREE.MathUtils.clamp(
    (missionT - (stageT - HOT_STAGE_PRE_S)) / HOT_STAGE_PRE_S,
    0,
    1,
  );
  return hotPre * hotPre;
}

function hotPostFraction(missionT: number, stageT: number, staged: boolean): number {
  if (!staged || missionT >= stageT + HOT_STAGE_POST_S) return 0;
  return 1 - THREE.MathUtils.clamp((missionT - stageT) / HOT_STAGE_POST_S, 0, 1);
}

function boostThrustTarget(
  state: CraftVisualState,
  showBoost: boolean,
  hotPre: number,
  hotPost: number,
): number {
  if (showBoost) {
    const mecoFade = hotPre > 0.7 ? 1 - ((hotPre - 0.7) / 0.3) * 0.4 : 1;
    return Math.min(1, state.thrustN / BOOSTER_THRUST_REF) * mecoFade;
  }
  if (hotPost > 0.05) return 0.25 * hotPost;
  return 0;
}

function shipThrustTarget(
  state: CraftVisualState,
  showShip: boolean,
  hotPre: number,
): number {
  if (!showShip) return 0;
  if (state.staged) {
    const engN =
      state.shipEngineCount != null && state.shipEngineCount > 0
        ? state.shipEngineCount
        : 3;
    return Math.min(1, state.thrustN / SHIP_THRUST_REF) * Math.max(0.25, engN / 3);
  }
  return 0.35 + 0.55 * hotPre;
}

function lagPlumeThrust(
  group: THREE.Group,
  missionT: number,
  uBoostTarget: number,
  uShipTarget: number,
): { uBoost: number; uShip: number } {
  const prevT = (group.userData.plumeLagT as number | undefined) ?? missionT;
  const prevBoost = (group.userData.plumeLagBoost as number | undefined) ?? uBoostTarget;
  const prevShip = (group.userData.plumeLagShip as number | undefined) ?? uShipTarget;
  const uBoost = plumeThrustLag(prevBoost, uBoostTarget, prevT, missionT);
  const uShip = plumeThrustLag(prevShip, uShipTarget, prevT, missionT);
  group.userData.plumeLagT = missionT;
  group.userData.plumeLagBoost = uBoost;
  group.userData.plumeLagShip = uShip;
  return { uBoost, uShip };
}

function applyStagePlume(
  plume: THREE.Object3D | undefined,
  u: number,
  look: PlumeLook,
  flicker: number,
  missionT: number,
): void {
  if (!plume) return;
  if (u > 0.02) applyPlumeLayers(plume, u, look, flicker, missionT);
  else {
    plume.visible = false;
    for (const c of plume.children) c.visible = false;
  }
}

function applyExhaustLight(
  light: THREE.PointLight | undefined,
  u: number,
  look: PlumeLook,
  flicker: number,
  baseI: number,
  gainI: number,
  baseD: number,
  gainD: number,
  z: number,
): void {
  if (!light) return;
  if (u <= 0.02) {
    light.intensity = 0;
    return;
  }
  light.intensity = (baseI + gainI * u) * look.lightI * flicker;
  light.color.setRGB(look.light[0]!, look.light[1]!, look.light[2]!);
  light.distance = (baseD + gainD * u) * look.lightDist;
  light.position.set(0, 0, z);
}

function dimShipBells(group: THREE.Group, state: CraftVisualState): void {
  const shipBells = group.getObjectByName("ship-engines");
  if (!shipBells || !state.staged) return;
  const n =
    state.shipEngineCount != null && state.shipEngineCount > 0
      ? state.shipEngineCount
      : 3;
  for (let i = 0; i < Math.min(3, shipBells.children.length); i++) {
    setBellOpacity(shipBells.children[i]!, !state.burning || i < n);
  }
}

function setBellOpacity(child: THREE.Object3D, active: boolean): void {
  child.visible = true;
  child.traverse((obj) => {
    if (obj instanceof THREE.Mesh) dimMeshMaterials(obj, active ? 1 : 0.22);
  });
}

function dimMeshMaterials(obj: THREE.Mesh, opacity: number): void {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const m of mats) {
    if (m && "opacity" in m) {
      const mat = m as THREE.Material & { opacity: number };
      mat.transparent = true;
      mat.opacity = opacity;
    }
  }
}

function updateCondensation(
  condense: THREE.Object3D | undefined,
  phase: string | undefined,
  missionT: number,
  burning: boolean,
): void {
  if (!condense) return;
  const str = condensationStrength(phase, missionT, burning);
  condense.visible = str > 0.03;
  if (str > 0.03) applyCondensationVisual(condense, str, missionT);
}

function applyCondensationVisual(
  condense: THREE.Object3D,
  str: number,
  missionT: number,
): void {
  const wobble =
    0.92 + 0.08 * Math.sin(missionT * 7.3) + 0.04 * Math.sin(missionT * 13.1 + 0.5);
  condense.traverse((obj) => updateCondenseChild(obj, str, missionT, wobble));
}

function updateCondenseChild(
  obj: THREE.Object3D,
  str: number,
  missionT: number,
  wobble: number,
): void {
  if (obj instanceof THREE.Sprite) updateCondenseSprite(obj, str, missionT, wobble);
  else if (obj.name === "condense-sheath") updateCondenseSheath(obj, str, wobble);
}

function updateCondenseSprite(
  obj: THREE.Sprite,
  str: number,
  missionT: number,
  wobble: number,
): void {
  const mat = obj.material as THREE.SpriteMaterial;
  const phase = (obj.userData.phase as number) ?? 0;
  const local = str * (0.75 + 0.25 * Math.sin(missionT * 5.1 + phase)) * wobble;
  mat.opacity = 0.35 * local;
  const base = (obj.userData.baseScale as number) ?? 1;
  const grow = base * (0.85 + 0.55 * str) * (0.95 + 0.08 * Math.sin(missionT * 4 + phase));
  obj.scale.setScalar(grow);
}

function updateCondenseSheath(obj: THREE.Object3D, str: number, wobble: number): void {
  const mat =
    (obj.userData.mat as THREE.MeshBasicMaterial | undefined) ??
    ((obj as THREE.Mesh).material as THREE.MeshBasicMaterial);
  mat.opacity = 0.12 * str * wobble;
  obj.scale.set(1 + 0.15 * str, 1 + 0.15 * str, 1);
}

function frostFxInput(state: CraftVisualState, missionT: number) {
  return {
    missionT,
    phase: state.phase,
    burning: state.burning,
    altEarth: state.altEarth ?? 0,
  };
}

function updateFrostAndIce(
  group: THREE.Group,
  state: CraftVisualState,
  missionT: number,
): void {
  const fx = frostFxInput(state, missionT);
  updateFrostPatches(group.getObjectByName("frost-patches"), frostStrength(fx), missionT);
  updateIceFlakes(group.getObjectByName("ice-flakes"), iceShedStrength(fx), missionT);
}

function updateFrostPatches(
  patches: THREE.Object3D | undefined,
  frostStr: number,
  missionT: number,
): void {
  if (!patches) return;
  patches.visible = frostStr > 0.04;
  if (frostStr <= 0.04) return;
  patches.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const phase = (obj.userData.phase as number) ?? 0;
    const mat =
      (obj.userData.mat as THREE.MeshStandardMaterial | undefined) ??
      (obj.material as THREE.MeshStandardMaterial);
    mat.opacity = frostPatchOpacity(frostStr, phase, missionT);
  });
}

function iceFlakeSpecFromUserData(obj: THREE.Sprite): (typeof ICE_FLAKES)[number] {
  return {
    ang: (obj.userData.ang as number) ?? 0,
    r0: (obj.userData.r0 as number) ?? 0.13,
    z0: (obj.userData.z0 as number) ?? 0.5,
    scale: (obj.userData.scale as number) ?? 0.03,
    phase: (obj.userData.phase as number) ?? 0,
  };
}

function updateIceFlakes(
  flakes: THREE.Object3D | undefined,
  iceStr: number,
  missionT: number,
): void {
  if (!flakes) return;
  flakes.visible = iceStr > 0.03;
  if (iceStr <= 0.03) return;
  flakes.traverse((obj) => {
    if (!(obj instanceof THREE.Sprite)) return;
    const pose = iceFlakePose(iceFlakeSpecFromUserData(obj), iceStr, missionT);
    const mat = obj.material as THREE.SpriteMaterial;
    mat.opacity = pose.opacity;
    obj.position.set(pose.position.x, pose.position.y, pose.position.z);
    obj.scale.set(pose.scale.x, pose.scale.y, 1);
  });
}

function setStackLayout(group: THREE.Group, staged: boolean): void {
  const booster = group.getObjectByName("booster");
  if (booster) booster.visible = !staged;
  const ship = group.getObjectByName("ship");
  if (ship) {
    const stackedZ = (ship.userData.stackedZ as number | undefined) ?? BOOST_H;
    const stagedZ = (ship.userData.stagedZ as number | undefined) ?? 0;
    ship.position.z = staged ? stagedZ : stackedZ;
  }
}

type HeatMats = {
  tile: THREE.MeshStandardMaterial;
  tileWear: THREE.MeshStandardMaterial;
};

/**
 * Windward tile glow / char from entry plasma. Theater-grade — not a heat map.
 * Intensity is scrub-safe via {@link CraftVisualState.plasmaStrength}.
 */
function updateEntryHeat(group: THREE.Group, plasma: number, phase?: string): void {
  const ship = group.getObjectByName("ship");
  const mats = ship?.userData.heatMats as HeatMats | undefined;
  if (!mats) return;
  const p = Number.isFinite(plasma) ? Math.max(0, Math.min(1, plasma)) : 0;
  const u = tileGroutGlow(p, phase);
  mats.tile.emissive.setRGB(0.72 * u + 0.28 * p, 0.22 * u + 0.08 * p, 0.07 * u);
  mats.tile.emissiveIntensity = 0.4 + 1.55 * p;
  mats.tileWear.emissive.setRGB(0.7 * u, 0.16 * u, 0.03 * u);
  mats.tileWear.emissiveIntensity = 0.25 + 1.05 * p;
}

const FWD_FLAP_NAMES = ["fwd-flap-L", "fwd-flap-R"] as const;
const AFT_ELEVON_NAMES = ["aft-elevon-L", "aft-elevon-R"] as const;

function setPivotPitch(group: THREE.Group, name: string, pitch: number): void {
  const pivot = group.getObjectByName(name);
  if (pivot) pivot.rotation.x = pitch;
}

/**
 * Belly-flop flap / elevon angles from mission phase (Flight 13 window only).
 */
function updateControlSurfaces(group: THREE.Group, state: CraftVisualState): void {
  const t = state.missionT ?? 0;
  const phase = (state.phase ?? "launch") as PhaseId;
  const alt = state.altEarth ?? 200;
  const mode = shipAttitudeMode(t, phase, alt, state.burning);
  const def = entryFlapDeflectionRad(t, phase, alt, mode);
  for (const name of FWD_FLAP_NAMES) setPivotPitch(group, name, def.fwd);
  for (const name of AFT_ELEVON_NAMES) setPivotPitch(group, name, def.aft);
}

/**
 * Hide stacked booster after stage-out (detached mesh is handled by StagingFx);
 * drive multi-layer plumes + dual exhaust lights by regime (V1).
 * Hot-staging: ship plume ramps on shortly before stage while booster still burns.
 */
function craftShowFlags(state: CraftVisualState, hotPre: number): {
  showBoost: boolean;
  showShip: boolean;
} {
  return {
    showBoost: state.burning && !state.staged,
    showShip: (state.burning && state.staged) || (state.burning && hotPre > 0.02),
  };
}

export function updateCraftVisuals(
  group: THREE.Group,
  state: CraftVisualState,
): void {
  setStackLayout(group, state.staged);
  const missionT = state.missionT ?? 0;
  const { hotPre, hotPost } = hotStageFractions(missionT, state.stageT ?? null, state.staged);
  const { showBoost, showShip } = craftShowFlags(state, hotPre);
  driveCraftPlumes(group, state, missionT, hotPre, hotPost, showBoost, showShip);
  dimShipBells(group, state);
  updateCondensation(group.getObjectByName("condense-cloud"), state.phase, missionT, state.burning);
  updateFrostAndIce(group, state, missionT);
  updateEntryHeat(group, state.plasmaStrength ?? 0, state.phase);
  updateControlSurfaces(group, state);
}

function driveCraftPlumes(
  group: THREE.Group,
  state: CraftVisualState,
  missionT: number,
  hotPre: number,
  hotPost: number,
  showBoost: boolean,
  showShip: boolean,
): void {
  const flicker = thrustFlicker(missionT);
  const uBoostTarget = boostThrustTarget(state, showBoost, hotPre, hotPost);
  const uShipTarget = shipThrustTarget(state, showShip, hotPre);
  const { uBoost, uShip } = lagPlumeThrust(group, missionT, uBoostTarget, uShipTarget);
  applyCraftPlumePair(group, state, missionT, hotPre, uBoost, uShip, flicker);
}

function boosterPlumeLook(state: CraftVisualState): PlumeLook {
  return plumeLook(
    plumeRegimeFor(state.phase, "booster", { staged: state.staged, altEarthKm: state.altEarth }),
    "booster",
  );
}

function shipPlumeLook(state: CraftVisualState, hotPre: number): PlumeLook {
  return plumeLook(
    plumeRegimeFor(state.phase, "ship", {
      hotPre,
      staged: state.staged,
      altEarthKm: state.altEarth,
    }),
    "ship",
  );
}

function applyCraftPlumePair(
  group: THREE.Group,
  state: CraftVisualState,
  missionT: number,
  hotPre: number,
  uBoost: number,
  uShip: number,
  flicker: number,
): void {
  const boostLook = boosterPlumeLook(state);
  const shipLook = shipPlumeLook(state, hotPre);
  applyStagePlume(group.getObjectByName("plume-booster"), uBoost, boostLook, flicker, missionT);
  applyStagePlume(group.getObjectByName("plume-ship"), uShip, shipLook, flicker, missionT);
  applyCraftLights(group, uBoost, uShip, boostLook, shipLook, flicker);
}

function applyCraftLights(
  group: THREE.Group,
  uBoost: number,
  uShip: number,
  boostLook: PlumeLook,
  shipLook: PlumeLook,
  flicker: number,
): void {
  applyExhaustLight(
    group.getObjectByName("exhaust-light") as THREE.PointLight | undefined,
    uBoost, boostLook, flicker, 1.6, 2.2, 0.16, 0.2, -0.05,
  );
  applyExhaustLight(
    group.getObjectByName("ship-exhaust-light") as THREE.PointLight | undefined,
    uShip, shipLook, flicker, 0.55, 1.35, 0.1, 0.14, -0.04,
  );
}

/** @deprecated Prefer updateCraftVisuals */
export function setPlumeVisible(group: THREE.Group, visible: boolean): void {
  updateCraftVisuals(group, {
    staged: true,
    burning: visible,
    thrustN: visible ? SHIP_THRUST_REF : 0,
  });
}

/**
 * Approximate craft length (km) for locator pixel-size heuristic.
 * Full stack ~123 m; ship alone ~52 m.
 */
export function craftLengthKm(staged: boolean): number {
  return staged ? SHIP_H_M / 1000 : (SHIP_H_M + BOOST_H_M) / 1000;
}

/** Named camera mounts on the stack (fin / hull / booster / engines). */
export const CRAFT_CAM_MOUNT_NAMES = [
  "fin-cam",
  "fin-cam-look",
  "flap-cam",
  "flap-cam-look",
  "hull-cam",
  "hull-cam-look",
  "grid-fin-cam",
  "grid-fin-cam-look",
  "booster-hull-cam",
  "booster-hull-cam-look",
  "engines-cam",
  "engines-cam-look",
  "engines-down-cam",
  "engines-down-cam-look",
] as const;

/** Super Heavy alone (~71 m) for free-flyer locator sizing after stage-out. */
export function boosterLengthKm(): number {
  return BOOST_H_M / 1000;
}

/** Hide the Starship red locator when the camera is closer than this (km). */
export const CRAFT_LOCATOR_MIN_DIST_KM = 10;

/** Hide a locator once the real geometry subtends this many pixels. */
export const LOCATOR_HIDE_ABOVE_PX = 5;

/**
 * Whether a locator should draw this frame.
 *
 * @param distKm camera-to-target distance (scene units = km)
 * @param bodyPx on-screen pixels subtended by the body's characteristic size
 * @param minDistKm optional near-range hide (Starship red dot uses 10 km)
 */
export function locatorShouldShow(
  distKm: number,
  bodyPx: number,
  minDistKm?: number,
): boolean {
  if (minDistKm != null && distKm < minDistKm) return false;
  return bodyPx < LOCATOR_HIDE_ABOVE_PX;
}

/**
 * Locator dot: constant on-screen marker whenever the body/craft is too small
 * to read. Hide once the real geometry subtends enough pixels, and (for the
 * Starship red dot) whenever the camera is closer than
 * {@link CRAFT_LOCATOR_MIN_DIST_KM}.
 *
 * `sizeKm` — characteristic size in scene units (craft length, body diameter).
 * `minDistKm` — optional camera-distance floor; the craft locator passes 10 km.
 */
export function updateLocatorVisibility(
  locator: THREE.Sprite,
  camera: THREE.Camera,
  worldPos: THREE.Vector3,
  opts: { sizeKm: number; minDistKm?: number },
): void {
  const dist = Math.max(1e-6, camera.position.distanceTo(worldPos));
  const len = Math.max(opts.sizeKm, 0.01);
  const bodyPx = bodyPixels(camera, dist, len);
  if (!locatorShouldShow(dist, bodyPx, opts.minDistKm)) {
    locator.visible = false;
    return;
  }
  locator.visible = true;
  scaleLocator(locator, camera, dist, len);
}

function bodyPixels(camera: THREE.Camera, dist: number, len: number): number {
  const persp = camera as THREE.PerspectiveCamera;
  const fov = (persp.fov ?? 50) * (Math.PI / 180);
  const worldHeight = 2 * Math.tan(fov / 2) * dist;
  const viewH = window.innerHeight || 800;
  return (len / worldHeight) * viewH;
}

function scaleLocator(
  locator: THREE.Sprite,
  camera: THREE.Camera,
  dist: number,
  len: number,
): void {
  const persp = camera as THREE.PerspectiveCamera;
  const fov = (persp.fov ?? 50) * (Math.PI / 180);
  const worldHeight = 2 * Math.tan(fov / 2) * dist;
  const viewH = window.innerHeight || 800;
  const fromPixels = (10 / viewH) * worldHeight;
  const minS = Math.min(len * 1.5, fromPixels * 0.5, dist * 0.001);
  const s = THREE.MathUtils.clamp(fromPixels, Math.max(minS, 1e-6), dist * 0.05);
  locator.scale.set(s, s, 1);
}

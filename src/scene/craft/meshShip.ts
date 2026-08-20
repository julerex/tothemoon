import * as THREE from "three";
import {
  AFT_FLAP_CHORD,
  AFT_FLAP_SPAN,
  BOOST_H,
  FLAP_T,
  FWD_FLAP_CHORD,
  FWD_FLAP_SPAN,
  R,
  SHIP_H,
  SHIP_OGIVE_BASE_Z,
  SHIP_OGIVE_H,
  SHIP_OGIVE_H_M,
  SHIP_WELD_RING_FRACTIONS,
  SL_BELL_H,
  SL_BELL_R,
  U,
  VAC_BELL_H,
  VAC_BELL_R,
} from "./dimensions";
import { FIN_CAM_LOCAL, FIN_CAM_LOOK_LOCAL, fwdFlapAz, fwdFlapZ, shipOgiveRadiusM } from "./dimensions";
import type { CraftMats } from "./materials";
import { finishCanvasTexture, makeSizedCanvas } from "./materials";
import { SHIP_HULL_MARK, paintHullMarkDecal } from "../craftHullMaps";
import { makePlumeGroup } from "./plumes";
import {
  addFlapChildren,
  addNamedCam,
  makeFlapPivot,
  makeFlushWeldBand,
  type FlapSpec,
  zCylinder,
  zOgive,
} from "./meshShared";
import { makeBell } from "./raptorBell";

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

function addShipWeldRings(ship: THREE.Group, mats: CraftMats): void {
  for (const f of SHIP_WELD_RING_FRACTIONS) {
    const z = f * SHIP_H;
    ship.add(makeFlushWeldBand(R * 1.002, 0.0022, z, mats.weldMat));
    ship.add(makeFlushWeldBand(R * 1.001, 0.0012, z - 0.004, mats.steelDark));
  }
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
  addFlapChildren(pivot, spec, mats, true, 0.16);
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
  addFlapChildren(pivot, spec, mats, false, 0.52);
  const steelPatch = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.07, 0.11), mats.tile);
  steelPatch.position.set(spec.span * 0.35, -0.04, spec.chord * 0.08);
  pivot.add(steelPatch);
  ship.add(pivot);
}

function addAftFlaps(ship: THREE.Group, mats: CraftMats): void {
  addAftFlap(ship, mats, -1);
  addAftFlap(ship, mats, 1);
}

function addShipEngines(ship: THREE.Group): void {
  const shipBells = new THREE.Group();
  shipBells.name = "ship-engines";
  const engZ = -0.02;
  addShipSlBells(shipBells, engZ);
  addShipVacBells(shipBells, engZ);
  ship.add(shipBells);
}

function addShipSlBells(g: THREE.Group, engZ: number): void {
  for (const [x, y] of [[0, 0.028], [0.024, -0.014], [-0.024, -0.014]] as [number, number][]) {
    g.add(makeBell(SL_BELL_R * 0.55, SL_BELL_R, SL_BELL_H, x, y, engZ));
  }
}

function addShipVacBells(g: THREE.Group, engZ: number): void {
  for (const [x, y] of [[0.07, 0.02], [-0.07, 0.02], [0, -0.075]] as [number, number][]) {
    g.add(makeBell(VAC_BELL_R * 0.45, VAC_BELL_R, VAC_BELL_H, x, y, engZ - 0.01));
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

function addShipPropulsion(ship: THREE.Group): void {
  addShipEngines(ship);
  addShipPlumeAndLight(ship);
}


/** Assemble full ship stage group. */
export function buildShip(mats: CraftMats): THREE.Group {
  const ship = new THREE.Group();
  ship.name = "ship";
  addShipStructure(ship, mats);
  addShipControlSurfaces(ship, mats);
  addShipPropulsion(ship);
  ship.position.z = BOOST_H;
  ship.userData.stackedZ = BOOST_H;
  ship.userData.stagedZ = 0;
  ship.userData.heatMats = {
    tile: mats.tile,
    tileWear: mats.tileWear,
    tileRough0: mats.tile.roughness,
    wearRough0: mats.tileWear.roughness,
  };
  return ship;
}

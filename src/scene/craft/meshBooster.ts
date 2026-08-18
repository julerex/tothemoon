import * as THREE from "three";
import {
  BOOSTER_WELD_RING_COUNT,
  BOOST_H,
  R,
  U,
} from "./dimensions";
import type { CraftMats } from "./materials";
import { FROST_PATCHES } from "../craftFrost";
import { createNameLabel } from "../zoomLabels";
import { addEngineBay } from "../engineBay";
import { makePlumeGroup } from "./plumes";
import { makeSizedCanvas } from "./materials";
import {
  addNamedCam,
  makeBarrelRing,
  makeBell,
  makeGridFin,
  zCylinder,
} from "./meshShared";

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
  // Parent on booster so StagingFx detached clone keeps the bay (V18).
  addEngineBay(booster);
}

const CRAFT_LABEL_OPTS = { targetPx: 16, aspect: 256 / 64, minH: 0.015 } as const;

/** Rides the booster mesh so the detached free-flyer clone keeps the plate. */
function addBoosterNameLabel(booster: THREE.Group): void {
  const label = createNameLabel("SUPER HEAVY", "#e8b86d", CRAFT_LABEL_OPTS);
  label.name = "label-super-heavy";
  label.position.set(0, 0, BOOST_H * 0.92);
  booster.add(label);
}

export function buildBooster(mats: CraftMats): THREE.Group {
  const booster = new THREE.Group();
  booster.name = "booster";
  addBoostUpper(booster, mats);
  addBoostLower(booster, mats);
  addBoosterNameLabel(booster);
  return booster;
}

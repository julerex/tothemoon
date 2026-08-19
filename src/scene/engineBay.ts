/**
 * Visual V18 / V22 — Super Heavy engine-bay interior (theater-grade).
 *
 * Flight 13 gridfin / engines-cam stills show plumbing, crinkled MLI, a
 * stainless oil-canned puck, gimbal rams, skirt ribs, and stencil IDs on
 * Raptor housings — not bare exterior bells. Parent under the booster so
 * StagingFx’s detached free-flyer clone keeps the bay.
 *
 * Scene unit = 1 km. Mesh units match craft.ts (1 unit ≈ 40 m before scale).
 *
 * @see docs/VISUAL_REALISM.md — V18 / V22
 * @see assets/flight13-webcast/ — T+2:21, T+4:32–5:50 stills
 */

import * as THREE from "three";
import { paintHullMarkDecal } from "./craftHullMaps";
import {
  BOOST_RING_INNER,
  BOOST_RING_MID,
  BOOST_RING_OUTER,
  R,
} from "./craft/dimensions";

/** Named root for tests + scene queries. */
export const ENGINE_BAY_GROUP = "engine-bay";

/**
 * Outer-ring stencil IDs readable from engines-cam (T+5:50 still includes
 * 142 / 150 / 158). Deterministic table — not a full 33-engine CAD set.
 */
export const ENGINE_BELL_IDS = [
  "142", "150", "158", "161", "173", "184", "191", "203",
] as const;

/** Crinkled MLI foil patches in the cavity. */
export const ENGINE_BAY_MLI_COUNT = 6;
/** Longitudinal ribs on the inner skirt. */
export const ENGINE_BAY_RIB_COUNT = 12;
/** Plumbing runs between inner / mid rings. */
export const ENGINE_BAY_PLUMBING_COUNT = 8;
/** Gimbal rams visible from engines-cam (subset of the 33). */
export const ENGINE_BAY_ACTUATOR_COUNT = 10;

/** Outer / mid / inner bell-ring radii (match addBoostBellField). */
const RING_OUTER = BOOST_RING_OUTER;
const RING_MID = BOOST_RING_MID;
const RING_INNER = BOOST_RING_INNER;

/** Bell exit plane (match addBoostEngines). */
const BELL_Z = -0.02;
/** Thrust structure just nose-ward of the bells. */
const PUCK_Z = 0.055;
/** Skirt mid-height (match addBoostSkirtAndRaceway). */
const SKIRT_Z = 0.08;

export type EngineBayMliPose = Readonly<{
  ang: number;
  r: number;
  z: number;
  w: number;
  h: number;
}>;

export type EngineBayBellIdPose = Readonly<{
  id: string;
  /** Index on the outer 20-bell ring. */
  ringIndex: number;
  ang: number;
  r: number;
  z: number;
}>;

/**
 * Outer-ring indices that get stencil IDs (engines-cam quadrant + neighbors).
 * Spread around the ring so engines-down also catches a few.
 */
export const ENGINE_BELL_ID_RING_INDICES = [
  0, 2, 4, 7, 10, 13, 16, 18,
] as const;

/**
 * Deterministic MLI patch poses in the engine cavity.
 */
export function engineBayMliPoses(): readonly EngineBayMliPose[] {
  const out: EngineBayMliPose[] = [];
  for (let i = 0; i < ENGINE_BAY_MLI_COUNT; i++) {
    const ang = (i / ENGINE_BAY_MLI_COUNT) * Math.PI * 2 + 0.35;
    const r = RING_MID * (0.72 + (i % 3) * 0.12);
    out.push({
      ang,
      r,
      z: PUCK_Z - 0.01 - (i % 2) * 0.012,
      w: 0.028 + (i % 3) * 0.004,
      h: 0.022 + (i % 2) * 0.006,
    });
  }
  return out;
}

/**
 * Stencil ID placement on the outer bell ring (20 bells, same ang convention
 * as addBoostBellRing with n=20).
 */
export function engineBayBellIdPoses(): readonly EngineBayBellIdPose[] {
  const n = 20;
  return ENGINE_BELL_ID_RING_INDICES.map((ringIndex, i) => {
    const ang = (ringIndex / n) * Math.PI * 2 + 0.08;
    return {
      id: ENGINE_BELL_IDS[i]!,
      ringIndex,
      ang,
      r: RING_OUTER,
      z: BELL_Z + 0.035,
    };
  });
}

/** Unique stencil strings (contract for tests). */
export function engineBayStencilIds(): readonly string[] {
  return ENGINE_BELL_IDS.slice();
}

/**
 * Paint crinkled gold/amber MLI foil (theater canvas, not a photo).
 */
export function paintMliFoil(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#c9a45a");
  g.addColorStop(0.35, "#e8d090");
  g.addColorStop(0.55, "#a87838");
  g.addColorStop(0.8, "#d4b868");
  g.addColorStop(1, "#8a6028");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const x = ((i * 47) % w);
    const y = ((i * 31) % h);
    const a = 0.08 + (i % 5) * 0.04;
    ctx.fillStyle = i % 3 === 0
      ? `rgba(255, 230, 160, ${a})`
      : `rgba(60, 40, 20, ${a})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + (i % 6), 1.5 + (i % 4), (i % 7) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let y = 4; y < h; y += 7) {
    ctx.strokeStyle = `rgba(40, 28, 12, ${0.12 + (y % 3) * 0.04})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y * 0.4) * 2);
    ctx.lineTo(w, y + Math.cos(y * 0.3) * 2);
    ctx.stroke();
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function finishMap(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeMliMaterial(): THREE.MeshStandardMaterial {
  const canvas = makeCanvas(128, 128);
  paintMliFoil(canvas.getContext("2d")!, 128, 128);
  return new THREE.MeshStandardMaterial({
    map: finishMap(canvas, true),
    color: 0xffffff,
    metalness: 0.85,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });
}

function makeIdMaterial(text: string): THREE.MeshBasicMaterial {
  const canvas = makeCanvas(96, 48);
  paintHullMarkDecal(canvas.getContext("2d")!, 96, 48, text);
  return new THREE.MeshBasicMaterial({
    map: finishMap(canvas, true),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makeSteelDark(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x2a3038,
    metalness: 0.72,
    roughness: 0.42,
  });
}

function makeSteelMatte(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x3a424c,
    metalness: 0.55,
    roughness: 0.55,
  });
}

/** Oil-canned stainless puck / inner skirt (T+5:50 still is bright, not dark). */
function makeStainlessPuck(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xc8ccd0,
    metalness: 0.92,
    roughness: 0.22,
    anisotropy: 0.62,
  });
}

function makeSootMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x1a1410,
    metalness: 0.22,
    roughness: 0.86,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function addThrustPuck(bay: THREE.Group, mat: THREE.Material): void {
  const puck = new THREE.Mesh(
    new THREE.CylinderGeometry(RING_MID * 1.15, RING_OUTER * 0.92, 0.018, 24),
    mat,
  );
  puck.name = "engine-bay-puck";
  puck.rotation.x = Math.PI / 2;
  puck.position.z = PUCK_Z;
  bay.add(puck);
  // Inner open sleeve so engines-cam sees a cavity rim, not a flat wall.
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.92, R * 0.98, 0.09, 28, 1, true),
    mat,
  );
  sleeve.name = "engine-bay-sleeve";
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = PUCK_Z + 0.02;
  bay.add(sleeve);
}

function addSootBand(bay: THREE.Group, mat: THREE.Material): void {
  const soot = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.93, R * 0.99, 0.035, 24, 1, true),
    mat,
  );
  soot.name = "engine-bay-soot";
  soot.rotation.x = Math.PI / 2;
  soot.position.z = BELL_Z + 0.03;
  bay.add(soot);
}

function addActuators(bay: THREE.Group, mat: THREE.Material): void {
  for (let i = 0; i < ENGINE_BAY_ACTUATOR_COUNT; i++) {
    const ang = (i / ENGINE_BAY_ACTUATOR_COUNT) * Math.PI * 2 + 0.12;
    const ram = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0026, 0.0032, 0.052, 6),
      mat,
    );
    ram.name = `engine-bay-ram-${i}`;
    const midR = RING_MID * 0.88;
    ram.position.set(Math.cos(ang) * midR, Math.sin(ang) * midR, BELL_Z + 0.048);
    ram.rotation.z = ang + 0.4;
    ram.rotation.x = 0.58;
    bay.add(ram);
  }
}

function addPlumbing(bay: THREE.Group, mat: THREE.Material): void {
  for (let i = 0; i < ENGINE_BAY_PLUMBING_COUNT; i++) {
    const ang = (i / ENGINE_BAY_PLUMBING_COUNT) * Math.PI * 2 + 0.2;
    const r0 = RING_INNER * 1.4;
    const r1 = RING_MID * 0.95;
    const len = r1 - r0;
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0042, len, 6),
      mat,
    );
    pipe.name = `engine-bay-pipe-${i}`;
    const midR = (r0 + r1) * 0.5;
    pipe.position.set(Math.cos(ang) * midR, Math.sin(ang) * midR, BELL_Z + 0.04);
    pipe.rotation.z = ang + Math.PI / 2;
    pipe.rotation.y = Math.PI / 2;
    bay.add(pipe);
  }
}

function addMliPatches(bay: THREE.Group, mat: THREE.Material): void {
  for (const [i, pose] of engineBayMliPoses().entries()) {
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(pose.w, pose.h),
      mat,
    );
    patch.name = `engine-bay-mli-${i}`;
    patch.position.set(
      Math.cos(pose.ang) * pose.r,
      Math.sin(pose.ang) * pose.r,
      pose.z,
    );
    patch.lookAt(0, 0, pose.z);
    bay.add(patch);
  }
}

function addSkirtRibs(bay: THREE.Group, mat: THREE.Material): void {
  const ribR = R * 0.96;
  const ribH = 0.11;
  for (let i = 0; i < ENGINE_BAY_RIB_COUNT; i++) {
    const ang = (i / ENGINE_BAY_RIB_COUNT) * Math.PI * 2;
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.004, 0.01, ribH),
      mat,
    );
    rib.name = `engine-bay-rib-${i}`;
    rib.position.set(Math.cos(ang) * ribR, Math.sin(ang) * ribR, SKIRT_Z);
    rib.rotation.z = ang;
    bay.add(rib);
  }
}

function addBellIds(bay: THREE.Group): void {
  for (const pose of engineBayBellIdPoses()) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.022, 0.011),
      makeIdMaterial(pose.id),
    );
    plate.name = `engine-bay-id-${pose.id}`;
    // Outboard face of the bell housing, readable from engines-cam / look-up.
    const faceR = pose.r + 0.018;
    plate.position.set(
      Math.cos(pose.ang) * faceR,
      Math.sin(pose.ang) * faceR,
      pose.z,
    );
    plate.lookAt(
      Math.cos(pose.ang) * (faceR + 0.05),
      Math.sin(pose.ang) * (faceR + 0.05),
      pose.z,
    );
    bay.add(plate);
  }
}

/**
 * Attach lightweight engine-bay interior under the Super Heavy booster.
 * Call after bells so the cavity sits at the same aft plane.
 */
export function addEngineBay(booster: THREE.Group): THREE.Group {
  const bay = new THREE.Group();
  bay.name = ENGINE_BAY_GROUP;
  const steel = makeSteelDark();
  const matte = makeSteelMatte();
  addThrustPuck(bay, makeStainlessPuck());
  addSootBand(bay, makeSootMat());
  addPlumbing(bay, matte);
  addActuators(bay, steel);
  addMliPatches(bay, makeMliMaterial());
  addSkirtRibs(bay, steel);
  addBellIds(bay);
  booster.add(bay);
  return bay;
}

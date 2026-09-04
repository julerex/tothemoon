/**
 * Starbase → Moon theater bootstrap.
 * Scene unit = 1 km.
 */

import type * as THREE from "three";
import type { Line2 } from "three/addons/lines/Line2.js";
import type { MissionClock } from "../../mission/clock";
import type { LandingBeatState } from "../../mission/landingBeatHold";
import type { CameraDirector, CameraMode } from "../../camera/modes";
import type { PhaseId } from "../../physics/missionTypes";
import type { Trajectory } from "../../physics/trajectoryCache";
import type { createBodies } from "../../scene/bodies";
import type { createCinemaComposer } from "../../scene/cinema";
import type { createGroundSky } from "../../scene/groundSky";
import type { LandingFx } from "../../scene/landingFx";
import type { StagingFx } from "../../scene/stagingFx";
import type { createVectorArrows } from "../../scene/vectorArrows";
import type { bindHud } from "../../ui/hud";
import { wireCanvasPointer } from "../theaterHandlers";
import type { MoonOrientScratch } from "./orientCraft";
import {
  assembleWorld,
  loadCache,
  logBoot,
  prepareChrome,
  requireCanvas,
} from "./bootstrapMount";
import { finishMoon, runtimePack } from "./bootstrapWire";

export type MoonAutoCam = {
  enabled: boolean;
  phase: PhaseId | null;
  staged: boolean;
  /** One-shot wider chase in the last ~30 s of descent. */
  finaleNudged: boolean;
};

export type MoonCinemaState = { burning: boolean; phase: string };

export type MoonFlags = { orbitsVisible: boolean };

export type MoonCtx = {
  canvas: HTMLCanvasElement;
  cache: Trajectory;
  epoch: Trajectory["epoch"];
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  director: CameraDirector;
  scene: THREE.Scene;
  sunLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  earthshine: THREE.DirectionalLight;
  orbitGroup: THREE.Group;
  bodies: ReturnType<typeof createBodies>;
  groundSky: ReturnType<typeof createGroundSky>;
  starbasePad: THREE.Group;
  craftTrail: Line2;
  moonRelOrbit: Line2;
  orbitExtras: THREE.Object3D[];
  craft: THREE.Group;
  cinema: ReturnType<typeof createCinemaComposer>;
  cinemaState: MoonCinemaState;
  vectorArrows: ReturnType<typeof createVectorArrows>;
  stagingFx: StagingFx;
  stageT: number | null;
  landingFx: LandingFx;
  clock: MissionClock;
  physicsDurationS: number;
  transportS: number;
  craftPos: THREE.Vector3;
  craftVel: THREE.Vector3;
  earthPos: THREE.Vector3;
  earthVel: THREE.Vector3;
  padWorld: THREE.Vector3;
  craftHeading: THREE.Vector3;
  earthVelV: THREE.Vector3;
  moonPosV: THREE.Vector3;
  moonVelV: THREE.Vector3;
  skyEarth: THREE.Vector3;
  skySun: THREE.Vector3;
  orient: MoonOrientScratch;
  autoCam: MoonAutoCam;
  landingBeat: LandingBeatState;
  flags: MoonFlags;
  notifyAutoCamera: (mode: CameraMode) => void;
  hud: ReturnType<typeof bindHud>;
  wall: THREE.Clock;
  flushHud?: () => void;
};

/** Build full lunar theater context. */
export function bootstrapToTheMoon(): MoonCtx {
  prepareChrome();
  const canvas = requireCanvas();
  const cache = loadCache();
  logBoot(cache);
  const world = assembleWorld(canvas, cache);
  const rt = runtimePack(world, cache);
  wireCanvasPointer(canvas, world.camera, world.vectorArrows);
  return finishMoon(canvas, cache, world, rt.clockPack, rt.autoCam, rt.flags, rt.hudPack);
}

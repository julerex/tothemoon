/**
 * Flight 13 theater bootstrap: trajectory, scene graph, FX, HUD bindings.
 * Scene unit = 1 km.
 */

import type * as THREE from "three";
import type { Line2 } from "three/addons/lines/Line2.js";
import type { MissionClock } from "../../mission/clock";
import type { LandingBeatState } from "../../mission/landingBeatHold";
import type { CameraDirector, CameraMode } from "../../camera/modes";
import type { PhaseId } from "../../physics/missionTypes";
import type { EphemerisEpoch } from "../../physics/ephemerisEpoch";
import type { Trajectory } from "../../physics/trajectoryCache";
import type { createBodies } from "../../scene/bodies";
import type { createCinemaComposer } from "../../scene/cinema";
import type { createGroundSky } from "../../scene/groundSky";
import type { createVectorArrows } from "../../scene/vectorArrows";
import type { EntryFx } from "../../scene/entryFx";
import type { GulfLandFx } from "../../scene/gulfLandFx";
import type { PayloadFx } from "../../scene/payloadFx";
import type { SplashFx } from "../../scene/splashFx";
import type { StagingFx } from "../../scene/stagingFx";
import type { bindHud } from "../../ui/hud";
import type { OrientScratch } from "./orientCraft";
import {
  assembleWorld,
  loadEpochBundle,
  prepareChrome,
  requireCanvas,
} from "./bootstrapMount";
import { finishBootstrap, runtimePack } from "./bootstrapWire";

export type F13AutoCam = {
  enabled: boolean;
  phase: PhaseId | null;
  staged: boolean;
  shotKey: string | null;
};

export type F13CinemaState = {
  burning: boolean;
  phase: string;
  plasma: number;
  altEarth: number;
};

export type F13Flags = {
  orbitsVisible: boolean;
};

export type F13Ctx = {
  canvas: HTMLCanvasElement;
  cache: Trajectory;
  epoch: EphemerisEpoch;
  forceCompareLine: string;
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
  moonRelOrbit: Line2;
  orbitExtras: THREE.Object3D[];
  craft: THREE.Group;
  cinema: ReturnType<typeof createCinemaComposer>;
  cinemaState: F13CinemaState;
  vectorArrows: ReturnType<typeof createVectorArrows>;
  stagingFx: StagingFx;
  stageT: number | null;
  splashFx: SplashFx;
  gulfLandFx: GulfLandFx;
  entryFx: EntryFx;
  payloadFx: PayloadFx;
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
  splashMesh: { x: number; y: number; z: number };
  splashWorld: { x: number; y: number; z: number };
  orient: OrientScratch;
  autoCam: F13AutoCam;
  landingBeat: LandingBeatState;
  flags: F13Flags;
  setAutoCamUi: (enabled: boolean) => void;
  notifyAutoCamera: (mode: CameraMode) => void;
  disableAutoCam: () => void;
  hud: ReturnType<typeof bindHud>;
  wall: THREE.Clock;
};

/** Build full Flight 13 theater context (HUD wired, ready for first apply). */
export function bootstrapFlight13(): F13Ctx {
  prepareChrome();
  const canvas = requireCanvas();
  const bundle = loadEpochBundle();
  const world = assembleWorld(canvas, bundle.cache, bundle.epoch);
  return finishBootstrap(canvas, bundle, world, runtimePack(world, bundle.cache));
}

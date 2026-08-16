/**
 * Starbase → Moon theater bootstrap.
 * Scene unit = 1 km.
 */

import * as THREE from "three";
import type { Line2 } from "three/addons/lines/Line2.js";
import { createMissionClock, type MissionClock } from "../../mission/clock";
import {
  createLandingBeatState,
  type LandingBeatState,
} from "../../mission/landingBeatHold";
import { buildTimeline } from "../../mission/timeline";
import {
  timelineWithPrelaunch,
  transportDurationS,
} from "../../mission/prelaunch";
import {
  computeLunarTrajectory,
  loadPrecomputedTrajectory,
  trailPoints,
  trajectoryCoastCorridor,
  type Trajectory,
} from "../../physics/trajectoryCache";
import {
  daysPastFullAtLanding,
  formatMissionDateUtc,
} from "../../physics/epoch";
import { hasHorizonsEpoch, horizonsSource } from "../../physics/horizonsEpoch";
import { EARTH_SPIN_RATE, earthNorthPole } from "../../physics/earthFrame";
import {
  createMoonPathThroughSim,
  createMoonRelativeOrbit,
  createScene,
} from "../../scene/createScene";
import { CRAFT_MESH_SCALE, createCraft } from "../../scene/craft";
import { createCoastBeatsOverlay, createCoastCorridorOverlay } from "../../scene/coastCorridor";
import { createTrailFromPoints } from "../../scene/trail";
import { createStagingFx, findStageEvent, type StagingFx } from "../../scene/stagingFx";
import { createLandingFx, type LandingFx } from "../../scene/landingFx";
import {
  createStarbasePad,
} from "../../scene/earthTheater";
import { createGroundSky } from "../../scene/groundSky";
import {
  createCinemaComposer,
  enableSunShadows,
  markPadShadowMeshes,
  markShadowMeshes,
} from "../../scene/cinema";
import { createVectorArrows } from "../../scene/vectorArrows";
import { createBodies } from "../../scene/bodies";
import { CameraDirector, type CameraMode } from "../../camera/modes";
import type { PhaseId } from "../../physics/missionTypes";
import { bindHud } from "../../ui/hud";
import { setTheaterVisible } from "../../app/shell";
import {
  makeTheaterHudHandlers,
  wireCanvasPointer,
  type TheaterHudWire,
} from "../theaterHandlers";
import type { MoonOrientScratch } from "./orientCraft";

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
};

function requireCanvas(): HTMLCanvasElement {
  const el = document.querySelector<HTMLCanvasElement>("#c");
  if (!el) throw new Error("Canvas #c not found");
  return el;
}

function prepareChrome(): void {
  setTheaterVisible(true);
  document.title = "tothemoon — Starbase → Moon";
}

function loadCache(): Trajectory {
  const recompute =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("recompute");
  if (recompute) {
    const phaseBoot = document.querySelector("#phase");
    if (phaseBoot) phaseBoot.textContent = "Recomputing trajectory…";
  }
  return recompute ? computeLunarTrajectory() : loadPrecomputedTrajectory();
}

function logBoot(cache: Trajectory): void {
  const epoch = cache.epoch;
  const sun0 = epoch.sunPhase0;
  console.info(
    `[tothemoon] Launch ${formatMissionDateUtc(0, cache.horizonsLandingT, epoch.clockUtcMsAtT0)} · ` +
      `Horizons τ=0 at 2027-07-20 12:00 UTC · ${daysPastFullAtLanding().toFixed(2)} d past full · ` +
      (epoch.useHorizons && hasHorizonsEpoch()
        ? `ephemeris=${horizonsSource()} · landT=${(cache.horizonsLandingT / 3600).toFixed(1)}h`
        : `sunPhase0=${sun0.toFixed(4)} (analytic)`),
  );
}

function styleRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}

function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true,
  });
  styleRenderer(renderer);
  return renderer;
}

function mountBodiesSky(
  scene: THREE.Scene,
  sunLight: THREE.DirectionalLight,
  renderer: THREE.WebGLRenderer,
) {
  enableSunShadows(renderer, sunLight);
  const bodies = createBodies();
  scene.add(bodies.earthGroup, bodies.moonGroup, bodies.sunGroup);
  const groundSky = createGroundSky();
  scene.add(groundSky.mesh);
  return { bodies, groundSky };
}

function makeDirector(canvas: HTMLCanvasElement, epoch: Trajectory["epoch"]) {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 2_000_000);
  const director = new CameraDirector(camera, canvas);
  director.setEpoch(epoch);
  return { camera, director };
}

function mountCore(canvas: HTMLCanvasElement, epoch: Trajectory["epoch"]) {
  const renderer = createRenderer(canvas);
  const { camera, director } = makeDirector(canvas, epoch);
  const sceneParts = createScene();
  const { bodies, groundSky } = mountBodiesSky(
    sceneParts.scene,
    sceneParts.sunLight,
    renderer,
  );
  return { renderer, camera, director, sceneParts, bodies, groundSky };
}

function mountPadTrail(
  bodies: ReturnType<typeof createBodies>,
  cache: Trajectory,
  orbitGroup: THREE.Group,
) {
  const starbasePad = createStarbasePad();
  bodies.earth.add(starbasePad);
  markPadShadowMeshes(starbasePad);
  const craftTrail = createTrailFromPoints(trailPoints(cache, 1500)) as Line2;
  orbitGroup.add(craftTrail);
  return { starbasePad, craftTrail };
}

function mountCorridor(orbitGroup: THREE.Group, cache: Trajectory): void {
  const coastCorridor = trajectoryCoastCorridor(cache);
  if (coastCorridor) {
    orbitGroup.add(createCoastCorridorOverlay(coastCorridor));
    console.info(
      `[tothemoon] Coast corridor: Kepler max|Δr|=${cache.keplerRefMaxDevKm.toFixed(0)} km ` +
        `(t=${(coastCorridor.t0 / 3600).toFixed(1)}–${(coastCorridor.t1 / 3600).toFixed(1)} h)`,
    );
  }
  orbitGroup.add(createCoastBeatsOverlay());
}

function mountOrbits(
  orbitGroup: THREE.Group,
  bodies: ReturnType<typeof createBodies>,
  cache: Trajectory,
  epoch: Trajectory["epoch"],
) {
  orbitGroup.add(createMoonPathThroughSim(cache.durationS, 640, epoch));
  const moonRelOrbit = createMoonRelativeOrbit(0, epoch);
  bodies.earthGroup.add(moonRelOrbit);
  const orbitExtras: THREE.Object3D[] = [moonRelOrbit];
  return { moonRelOrbit, orbitExtras };
}

function mountCraft(scene: THREE.Scene, director: CameraDirector) {
  const { group: craft } = createCraft();
  scene.add(craft);
  director.setCraft(craft);
  markShadowMeshes(craft, { cast: true, receive: true });
  return { craft };
}

function mountStagingFx(
  scene: THREE.Scene,
  craft: THREE.Group,
  director: CameraDirector,
  cache: Trajectory,
) {
  const boosterProto = craft.getObjectByName("booster");
  const stagingFx = createStagingFx(boosterProto ?? new THREE.Group(), CRAFT_MESH_SCALE);
  const stageEvent = findStageEvent(cache.samples);
  stagingFx.setStageEvent(stageEvent);
  scene.add(stagingFx.group);
  director.setDetachedBooster(stagingFx.detachedBooster);
  markShadowMeshes(stagingFx.group, { cast: true, receive: true });
  return { stagingFx, stageT: stageEvent?.t ?? null };
}

function mountLandingFx(scene: THREE.Scene, cache: Trajectory, epoch: Trajectory["epoch"]) {
  const landingFx = createLandingFx();
  landingFx.setEpoch(epoch);
  const last = cache.samples[cache.samples.length - 1]!;
  landingFx.setLanding(last.pos, last.t);
  scene.add(landingFx.group);
  return landingFx;
}

function mountFx(
  scene: THREE.Scene,
  craft: THREE.Group,
  director: CameraDirector,
  cache: Trajectory,
  epoch: Trajectory["epoch"],
) {
  const staging = mountStagingFx(scene, craft, director, cache);
  return { ...staging, landingFx: mountLandingFx(scene, cache, epoch) };
}

function orientCore(craft: THREE.Object3D, craftPos: THREE.Vector3, omega: THREE.Vector3) {
  return {
    craftPos,
    craft,
    craftTan: new THREE.Vector3(),
    localUp: new THREE.Vector3(),
    omega,
    ...orientVelScratch(),
  };
}

function orientVelScratch() {
  return {
    spinVel: new THREE.Vector3(),
    airVel: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
  };
}

function orientMats(): Pick<
  MoonOrientScratch,
  "rollUp" | "look" | "quat" | "airVelAttitudeMin"
> {
  return {
    rollUp: new THREE.Vector3(0, 1, 0),
    look: new THREE.Matrix4(),
    quat: new THREE.Quaternion(),
    airVelAttitudeMin: 0.04,
  };
}

function makeOrient(craft: THREE.Object3D, craftPos: THREE.Vector3): MoonOrientScratch {
  const omega = new THREE.Vector3();
  earthNorthPole(omega);
  omega.multiplyScalar(EARTH_SPIN_RATE);
  return { ...orientCore(craft, craftPos, omega), ...orientMats() };
}

function makeClock(cache: Trajectory) {
  const physicsDurationS = cache.durationS;
  const transportS = transportDurationS(physicsDurationS);
  const timeline = timelineWithPrelaunch(
    buildTimeline(cache.samples, physicsDurationS),
    physicsDurationS,
  );
  const clock = createMissionClock();
  clock.setSpeed(1);
  return { clock, physicsDurationS, transportS, timeline };
}

function assemblePadOrbits(
  core: ReturnType<typeof mountCore>,
  cache: Trajectory,
) {
  const epoch = cache.epoch;
  const pad = mountPadTrail(core.bodies, cache, core.sceneParts.orbitGroup);
  core.director.setPad(pad.starbasePad);
  mountCorridor(core.sceneParts.orbitGroup, cache);
  const orbits = mountOrbits(
    core.sceneParts.orbitGroup, core.bodies, cache, epoch,
  );
  return { pad, orbits };
}

function assembleCraftCinema(
  core: ReturnType<typeof mountCore>,
  cache: Trajectory,
  orbits: ReturnType<typeof assemblePadOrbits>["orbits"],
) {
  const { craft } = mountCraft(core.sceneParts.scene, core.director);
  const cinema = createCinemaComposer(core.renderer, core.sceneParts.scene, core.camera);
  const vectorArrows = createVectorArrows();
  if (vectorArrows.group.visible) {
    core.sceneParts.scene.add(vectorArrows.group);
    orbits.orbitExtras.push(vectorArrows.group);
  }
  const fx = mountFx(core.sceneParts.scene, craft, core.director, cache, cache.epoch);
  return { craft, cinema, vectorArrows, fx };
}

function assembleWorld(canvas: HTMLCanvasElement, cache: Trajectory) {
  const core = mountCore(canvas, cache.epoch);
  const { pad, orbits } = assemblePadOrbits(core, cache);
  const craftPack = assembleCraftCinema(core, cache, orbits);
  return { ...core, pad, orbits, ...craftPack };
}

function makeDisableAutoCam(autoCam: MoonAutoCam, getSetUi: () => (e: boolean) => void) {
  return (): void => {
    if (!autoCam.enabled) return;
    autoCam.enabled = false;
    autoCam.finaleNudged = false;
    getSetUi()(false);
  };
}

function makeSetOrbitsVisible(
  flags: MoonFlags,
  orbitGroup: THREE.Group,
  orbitExtras: THREE.Object3D[],
) {
  return (visible: boolean): void => {
    flags.orbitsVisible = visible;
    orbitGroup.visible = visible;
    for (const obj of orbitExtras) obj.visible = visible;
  };
}

function makeMoonHudWire(
  clock: MissionClock,
  director: CameraDirector,
  autoCam: MoonAutoCam,
  cache: Trajectory,
  disableAutoCam: () => void,
  toggleOrbits: () => boolean,
): TheaterHudWire {
  return { clock, director, autoCam, cache, disableAutoCam, toggleOrbits };
}

function bindHudPack(
  world: ReturnType<typeof assembleWorld>,
  clockPack: ReturnType<typeof makeClock>,
  cache: Trajectory,
  autoCam: MoonAutoCam,
  flags: MoonFlags,
) {
  let setAutoCamUi: (e: boolean) => void = () => {};
  const disableAutoCam = makeDisableAutoCam(autoCam, () => setAutoCamUi);
  const setOrbits = makeSetOrbitsVisible(flags, world.sceneParts.orbitGroup, world.orbits.orbitExtras);
  const wire = makeMoonHudWire(clockPack.clock, world.director, autoCam, cache, disableAutoCam, () => {
    const next = !flags.orbitsVisible;
    setOrbits(next);
    return next;
  });
  const hud = bindHud(clockPack.clock, clockPack.timeline, makeTheaterHudHandlers(wire), cache.samples);
  setAutoCamUi = hud.setAutoCamEnabled;
  world.director.setOnUserControl(() => disableAutoCam());
  return { hud, notifyAutoCamera: hud.notifyAutoCamera };
}

function fillVecsA(craftPos: THREE.Vector3) {
  return {
    craftPos,
    craftVel: new THREE.Vector3(),
    earthPos: new THREE.Vector3(),
    earthVel: new THREE.Vector3(),
    padWorld: new THREE.Vector3(),
    craftHeading: new THREE.Vector3(0, 0, 1),
  };
}

function fillVecsB(craft: THREE.Group, craftPos: THREE.Vector3) {
  return {
    earthVelV: new THREE.Vector3(),
    moonPosV: new THREE.Vector3(),
    moonVelV: new THREE.Vector3(),
    skyEarth: new THREE.Vector3(),
    skySun: new THREE.Vector3(),
    orient: makeOrient(craft, craftPos),
  };
}

function fillVecs(craft: THREE.Group, craftPos: THREE.Vector3) {
  return { ...fillVecsA(craftPos), ...fillVecsB(craft, craftPos) };
}

function worldFieldsA(world: ReturnType<typeof assembleWorld>) {
  return {
    renderer: world.renderer,
    camera: world.camera,
    director: world.director,
    scene: world.sceneParts.scene,
    sunLight: world.sceneParts.sunLight,
  };
}

function worldFieldsB(world: ReturnType<typeof assembleWorld>) {
  return {
    fillLight: world.sceneParts.fillLight,
    earthshine: world.sceneParts.earthshine,
    orbitGroup: world.sceneParts.orbitGroup,
    bodies: world.bodies,
    groundSky: world.groundSky,
  };
}

function craftFieldsA(world: ReturnType<typeof assembleWorld>) {
  return {
    starbasePad: world.pad.starbasePad,
    craftTrail: world.pad.craftTrail,
    moonRelOrbit: world.orbits.moonRelOrbit,
    orbitExtras: world.orbits.orbitExtras,
    craft: world.craft,
  };
}

function craftFieldsB(world: ReturnType<typeof assembleWorld>) {
  return {
    cinema: world.cinema,
    cinemaState: { burning: false, phase: "launch" } satisfies MoonCinemaState,
    vectorArrows: world.vectorArrows,
    stagingFx: world.fx.stagingFx,
    stageT: world.fx.stageT,
    landingFx: world.fx.landingFx,
  };
}

function runtimeFields(
  clockPack: ReturnType<typeof makeClock>,
  autoCam: MoonAutoCam,
  flags: MoonFlags,
  hudPack: ReturnType<typeof bindHudPack>,
) {
  return {
    clock: clockPack.clock, physicsDurationS: clockPack.physicsDurationS,
    transportS: clockPack.transportS, autoCam, landingBeat: createLandingBeatState(),
    flags, notifyAutoCamera: hudPack.notifyAutoCamera, hud: hudPack.hud, wall: new THREE.Clock(),
  };
}

function finishMoon(
  canvas: HTMLCanvasElement,
  cache: Trajectory,
  world: ReturnType<typeof assembleWorld>,
  clockPack: ReturnType<typeof makeClock>,
  autoCam: MoonAutoCam,
  flags: MoonFlags,
  hudPack: ReturnType<typeof bindHudPack>,
): MoonCtx {
  return {
    canvas, cache, epoch: cache.epoch, ...worldFieldsA(world), ...worldFieldsB(world),
    ...craftFieldsA(world), ...craftFieldsB(world), ...fillVecs(world.craft, new THREE.Vector3()),
    ...runtimeFields(clockPack, autoCam, flags, hudPack),
  };
}

function runtimePack(world: ReturnType<typeof assembleWorld>, cache: Trajectory) {
  const clockPack = makeClock(cache);
  const autoCam: MoonAutoCam = { enabled: true, phase: null, staged: false, finaleNudged: false };
  const flags: MoonFlags = { orbitsVisible: true };
  const hudPack = bindHudPack(world, clockPack, cache, autoCam, flags);
  return { clockPack, autoCam, flags, hudPack };
}

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

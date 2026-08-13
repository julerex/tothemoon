/**
 * Flight 13 theater bootstrap: trajectory, scene graph, FX, HUD bindings.
 * Scene unit = 1 km.
 */

import * as THREE from "three";
import { MissionClock } from "../../mission/clock";
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
  loadFlight13Trajectory,
  computeFlight13Trajectory,
  sampleAtProgress,
  type Trajectory,
} from "../../physics/trajectoryCache";
import { applyFlight13Epoch } from "../../physics/flight13Epoch";
import {
  compareFlight13ToEarthOnly,
  formatForceCompareLine,
} from "../../physics/flight13ForceCompare";
import { hasHorizonsEpoch, horizonsSource } from "../../physics/horizonsEpoch";
import { EARTH_SPIN_RATE, earthNorthPole } from "../../physics/earthFrame";
import {
  createMoonPathThroughSim,
  createMoonRelativeOrbit,
  createScene,
} from "../../scene/createScene";
import { CRAFT_MESH_SCALE, createCraft } from "../../scene/craft";
import { meshLocalTrailFromSamples } from "../../physics/earthTrail";
import { createTrailFromPoints } from "../../scene/trail";
import { StagingFx, findStageEvent } from "../../scene/stagingFx";
import { EntryFx } from "../../scene/entryFx";
import { SplashFx } from "../../scene/splashFx";
import { GulfLandFx } from "../../scene/gulfLandFx";
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
import type { CinematicBookmark } from "../../mission/bookmarks";
import type { PhaseId } from "../../physics/missionTypes";
import { bindHud, type HudHandlers } from "../../ui/hud";
import { nudgePlaybackSpeed } from "../../ui/hudFormat";
import { setTheaterVisible } from "../../app/shell";
import { toggleZoomLabels } from "../../scene/zoomLabels";
import type { Line2 } from "three/addons/lines/Line2.js";
import type { OrientScratch } from "./orientCraft";

export type F13AutoCam = {
  enabled: boolean;
  phase: PhaseId | null;
  staged: boolean;
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
  epoch: ReturnType<typeof applyFlight13Epoch>["epoch"];
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
  locator: THREE.Sprite;
  cinema: ReturnType<typeof createCinemaComposer>;
  cinemaState: F13CinemaState;
  vectorArrows: ReturnType<typeof createVectorArrows>;
  stagingFx: StagingFx;
  stageT: number | null;
  splashFx: SplashFx;
  gulfLandFx: GulfLandFx;
  entryFx: EntryFx;
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

function requireCanvas(): HTMLCanvasElement {
  const el = document.querySelector<HTMLCanvasElement>("#c");
  if (!el) throw new Error("Canvas #c not found");
  return el;
}

function hideMenusAndBriefing(): void {
  const menus = document.getElementById("menus");
  if (menus) menus.hidden = true;
  const briefing = document.getElementById("flight13-briefing");
  if (briefing) briefing.hidden = true;
}

function setFlight13HudTitles(): void {
  const h1 = document.querySelector(".hud-header h1");
  if (h1) h1.textContent = "Starship Flight 13";
  const sub = document.querySelector(".hud-header .subtitle");
  if (sub) sub.textContent = "July 2026 · Starbase · flight test · true scale";
  const mcSub = document.querySelector(".mc-sub");
  if (mcSub) {
    mcSub.textContent = "Starbase → Indian Ocean splashdown · Flight 13";
  }
}

function prepareChrome(): void {
  setTheaterVisible(true);
  document.title = "tothemoon — Starship Flight 13";
  hideMenusAndBriefing();
  setFlight13HudTitles();
}

function loadCache(): Trajectory {
  const recompute =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("recompute");
  if (recompute) {
    const phaseBoot = document.querySelector("#phase");
    if (phaseBoot) phaseBoot.textContent = "Recomputing Flight 13…";
  }
  return recompute ? computeFlight13Trajectory() : loadFlight13Trajectory();
}

function logBoot(cache: Trajectory, sun0: number, padSunElev: number): void {
  console.info(
    `[flight13] Launch theater · duration ${(cache.durationS / 60).toFixed(1)} min · ` +
      `stageT=${cache.stageT?.toFixed(0) ?? "—"}s · peak |v|=${cache.peakSpeedKmS.toFixed(2)} km/s · ` +
      `daytime pad sin(el)=${padSunElev.toFixed(3)} · sunPhase0=${sun0.toFixed(4)}` +
      (hasHorizonsEpoch() ? ` · ephemeris=${horizonsSource()}` : " · analytic Earth/Sun"),
  );
}

function logForce(fc: ReturnType<typeof compareFlight13ToEarthOnly>): void {
  console.info(
    `[flight13] Force check · coast max |Δr|=${fc.coastMaxPosDevKm.toFixed(2)} km · ` +
      `full max |Δr|=${fc.maxPosDevKm.toFixed(1)} km · ` +
      `max |Δv|=${fc.maxVelDevKmS.toFixed(3)} km/s`,
  );
}

function buildForceLine(cache: Trajectory): string {
  const fc = compareFlight13ToEarthOnly(cache.samples, {
    durationS: cache.durationS,
    stageT: cache.stageT,
  });
  logForce(fc);
  return formatForceCompareLine(fc);
}

function configureRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
}

function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true,
  });
  configureRenderer(renderer);
  return renderer;
}

function makeCameraDirector(canvas: HTMLCanvasElement, epoch: F13Ctx["epoch"]) {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 2_000_000);
  const director = new CameraDirector(camera, canvas);
  director.setEpoch(epoch);
  return { camera, director };
}

function mountBodies(
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

function mountPadAndTrail(
  bodies: ReturnType<typeof createBodies>,
  cache: Trajectory,
  epoch: F13Ctx["epoch"],
) {
  const starbasePad = createStarbasePad();
  bodies.earth.add(starbasePad);
  markPadShadowMeshes(starbasePad);
  const trailPts = meshLocalTrailFromSamples(cache.samples, 1500, epoch);
  const craftTrail = createTrailFromPoints(trailPts);
  bodies.earth.add(craftTrail);
  return { starbasePad, craftTrail };
}

function mountMoonOrbits(
  orbitGroup: THREE.Group,
  bodies: ReturnType<typeof createBodies>,
  cache: Trajectory,
  epoch: F13Ctx["epoch"],
  craftTrail: THREE.Object3D,
) {
  orbitGroup.add(createMoonPathThroughSim(cache.durationS, 640, epoch));
  const moonRelOrbit = createMoonRelativeOrbit(0, epoch);
  bodies.earthGroup.add(moonRelOrbit);
  const orbitExtras: THREE.Object3D[] = [moonRelOrbit, craftTrail];
  return { moonRelOrbit, orbitExtras };
}

function mountCraft(scene: THREE.Scene, director: CameraDirector) {
  const { group: craft, locator } = createCraft();
  scene.add(craft);
  director.setCraft(craft);
  markShadowMeshes(craft, { cast: true, receive: true });
  return { craft, locator };
}

function mountStaging(
  scene: THREE.Scene,
  craft: THREE.Group,
  director: CameraDirector,
  cache: Trajectory,
) {
  const boosterProto = craft.getObjectByName("booster");
  const stagingFx = new StagingFx(boosterProto ?? new THREE.Group(), CRAFT_MESH_SCALE);
  const stageEvent = findStageEvent(cache.samples);
  stagingFx.setStageEvent(stageEvent, "gulf");
  scene.add(stagingFx.group);
  director.setDetachedBooster(stagingFx.detachedBooster);
  markShadowMeshes(stagingFx.group, { cast: true, receive: true });
  return { stagingFx, stageT: stageEvent?.t ?? null };
}

function mountSplashEntry(
  staging: ReturnType<typeof mountStaging>,
  cache: Trajectory,
  bodies: ReturnType<typeof createBodies>,
  craft: THREE.Group,
) {
  const splashFx = new SplashFx();
  splashFx.setSplashTime(cache.samples[cache.samples.length - 1]!.t);
  bodies.earth.add(splashFx.group);
  const gulfLandFx = new GulfLandFx();
  const stageT = staging.stageT;
  if (stageT != null) gulfLandFx.setLandTime(stageT);
  bodies.earth.add(gulfLandFx.group);
  const entryFx = new EntryFx();
  craft.add(entryFx.group);
  return { ...staging, splashFx, gulfLandFx, entryFx };
}

function mountFx(
  scene: THREE.Scene,
  craft: THREE.Group,
  director: CameraDirector,
  cache: Trajectory,
  bodies: ReturnType<typeof createBodies>,
) {
  const staging = mountStaging(scene, craft, director, cache);
  return mountSplashEntry(staging, cache, bodies, craft);
}

function orientScratchA(
  craft: THREE.Object3D,
  craftPos: THREE.Vector3,
  omega: THREE.Vector3,
): Pick<
  OrientScratch,
  | "craftPos"
  | "craft"
  | "craftTan"
  | "localUp"
  | "omega"
  | "spinVel"
  | "airVel"
  | "lookTarget"
> {
  return {
    craftPos, craft, craftTan: new THREE.Vector3(), localUp: new THREE.Vector3(),
    omega, spinVel: new THREE.Vector3(), airVel: new THREE.Vector3(), lookTarget: new THREE.Vector3(),
  };
}

function orientScratchB(): Omit<
  OrientScratch,
  keyof ReturnType<typeof orientScratchA>
> {
  return {
    rollUp: new THREE.Vector3(0, 1, 0),
    look: new THREE.Matrix4(),
    quat: new THREE.Quaternion(),
    nose: new THREE.Vector3(),
    belly: new THREE.Vector3(),
    side: new THREE.Vector3(),
    airVelAttitudeMin: 0.04,
  };
}

function makeOrient(craft: THREE.Object3D, craftPos: THREE.Vector3): OrientScratch {
  const omega = new THREE.Vector3();
  earthNorthPole(omega);
  omega.multiplyScalar(EARTH_SPIN_RATE);
  return { ...orientScratchA(craft, craftPos, omega), ...orientScratchB() };
}

function makeClockAndTimeline(cache: Trajectory) {
  const physicsDurationS = cache.durationS;
  const transportS = transportDurationS(physicsDurationS);
  const timeline = timelineWithPrelaunch(
    buildTimeline(cache.samples, physicsDurationS),
    physicsDurationS,
  );
  return { clock: playClock(), physicsDurationS, transportS, timeline };
}

function playClock(): MissionClock {
  const clock = new MissionClock();
  clock.setSpeed(1);
  clock.play();
  return clock;
}

type HudWire = {
  clock: MissionClock;
  director: CameraDirector;
  autoCam: F13AutoCam;
  cache: Trajectory;
  disableAutoCam: () => void;
  toggleOrbits: () => void;
};

function onBookmark(w: HudWire, bm: CinematicBookmark): void {
  w.clock.seek(bm.u);
  const frame = sampleAtProgress(w.cache, bm.u);
  w.autoCam.phase = frame.phase;
  w.autoCam.staged = frame.staged;
  w.director.easeToMode(bm.mode, { frame: bm.frame, frameScale: bm.frameScale });
}

function onSpeedNudge(w: HudWire, dir: Parameters<HudHandlers["onSpeedNudge"]>[0]): number {
  const next = nudgePlaybackSpeed(w.clock.speed, dir);
  w.clock.setSpeed(next);
  return next;
}

function transportHandlers(w: HudWire): Pick<
  HudHandlers,
  "onPlayToggle" | "onSpeedMode" | "onSpeedNudge" | "onScrub"
> {
  return {
    onPlayToggle: () => w.clock.toggle(),
    onSpeedMode: (rate) => w.clock.setSpeed(rate),
    onSpeedNudge: (dir) => onSpeedNudge(w, dir),
    onScrub: (t) => w.clock.seek(t),
  };
}

function onCamera(w: HudWire, mode: CameraMode): void {
  w.disableAutoCam();
  w.director.setMode(mode);
}

function onCameraFrame(w: HudWire, mode: CameraMode): void {
  w.disableAutoCam();
  w.director.frameMode(mode);
}

function onPanKey(w: HudWire, key: "w" | "a" | "s" | "d", down: boolean) {
  const mode = w.director.setPanKey(key, down);
  if (down) w.disableAutoCam();
  return mode;
}

function cameraHandlers(w: HudWire): Pick<
  HudHandlers,
  "onCamera" | "onCameraFrame" | "onOrbitKey" | "onPanKey" | "onZoomKey"
> {
  return {
    onCamera: (mode) => onCamera(w, mode),
    onCameraFrame: (mode) => onCameraFrame(w, mode),
    onOrbitKey: (key, down) => w.director.setOrbitKey(key, down),
    onPanKey: (key, down) => onPanKey(w, key, down),
    onZoomKey: (key, down) => w.director.setZoomKey(key, down),
  };
}

function onAutoCamToggle(w: HudWire): boolean {
  w.autoCam.enabled = !w.autoCam.enabled;
  if (w.autoCam.enabled) w.autoCam.phase = null;
  return w.autoCam.enabled;
}

function toggleHandlers(w: HudWire): Pick<
  HudHandlers,
  "onToggleLabels" | "onToggleOrbits" | "onAutoCamToggle" | "onBookmark"
> {
  return {
    onToggleLabels: () => toggleZoomLabels(),
    onToggleOrbits: () => w.toggleOrbits(),
    onAutoCamToggle: () => onAutoCamToggle(w),
    onBookmark: (bm) => onBookmark(w, bm),
  };
}

function makeHudHandlers(w: HudWire): HudHandlers {
  return {
    ...transportHandlers(w),
    ...cameraHandlers(w),
    ...toggleHandlers(w),
  };
}

function wirePointer(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  vectorArrows: ReturnType<typeof createVectorArrows>,
): void {
  canvas.addEventListener("pointermove", (e) => {
    vectorArrows.setPointer(e, camera, canvas);
  });
  canvas.addEventListener("pointerleave", () => {
    vectorArrows.setPointer(null, camera, canvas);
  });
}

function loadEpochBundle() {
  const cache = loadCache();
  const applied = applyFlight13Epoch(cache.moonPhase0, cache.horizonsLandingT);
  logBoot(cache, applied.sunPhase0, applied.padSunElev);
  return {
    cache,
    epoch: applied.epoch,
    forceCompareLine: buildForceLine(cache),
  };
}

function assembleCore(canvas: HTMLCanvasElement, epoch: F13Ctx["epoch"]) {
  const renderer = createRenderer(canvas);
  const { camera, director } = makeCameraDirector(canvas, epoch);
  const sceneParts = createScene();
  const { bodies, groundSky } = mountBodies(
    sceneParts.scene,
    sceneParts.sunLight,
    renderer,
  );
  return { renderer, camera, director, sceneParts, bodies, groundSky };
}

function assembleOverlays(
  core: ReturnType<typeof assembleCore>,
  cache: Trajectory,
  epoch: F13Ctx["epoch"],
) {
  const pad = mountPadAndTrail(core.bodies, cache, epoch);
  core.director.setPad(pad.starbasePad);
  const orbits = mountMoonOrbits(
    core.sceneParts.orbitGroup, core.bodies, cache, epoch, pad.craftTrail,
  );
  const { craft, locator } = mountCraft(core.sceneParts.scene, core.director);
  return { pad, orbits, craft, locator };
}

function assembleCinema(
  core: ReturnType<typeof assembleCore>,
  overlays: ReturnType<typeof assembleOverlays>,
  cache: Trajectory,
) {
  const cinema = createCinemaComposer(core.renderer, core.sceneParts.scene, core.camera);
  const vectorArrows = createVectorArrows();
  if (vectorArrows.group.visible) {
    core.sceneParts.scene.add(vectorArrows.group);
    overlays.orbits.orbitExtras.push(vectorArrows.group);
  }
  const fx = mountFx(core.sceneParts.scene, overlays.craft, core.director, cache, core.bodies);
  return { cinema, vectorArrows, fx };
}

function assembleWorld(
  canvas: HTMLCanvasElement,
  cache: Trajectory,
  epoch: F13Ctx["epoch"],
) {
  const core = assembleCore(canvas, epoch);
  const overlays = assembleOverlays(core, cache, epoch);
  const cinemaPack = assembleCinema(core, overlays, cache);
  return { ...core, ...overlays, ...cinemaPack };
}

type RuntimeHudWire = {
  clock: MissionClock;
  timeline: ReturnType<typeof timelineWithPrelaunch>;
  director: CameraDirector;
  autoCam: F13AutoCam;
  cache: Trajectory;
  orbitGroup: THREE.Group;
  orbitExtras: THREE.Object3D[];
  flags: F13Flags;
};

function makeDisableAutoCam(autoCam: F13AutoCam, getSetUi: () => (e: boolean) => void) {
  return (): void => {
    if (!autoCam.enabled) return;
    autoCam.enabled = false;
    getSetUi()(false);
  };
}

function makeSetOrbitsVisible(w: RuntimeHudWire) {
  return (visible: boolean): void => {
    w.flags.orbitsVisible = visible;
    w.orbitGroup.visible = visible;
    for (const obj of w.orbitExtras) obj.visible = visible;
  };
}

function makeHudWire(
  w: RuntimeHudWire,
  disableAutoCam: () => void,
  setOrbitsVisible: (v: boolean) => void,
): HudWire {
  return {
    clock: w.clock, director: w.director, autoCam: w.autoCam, cache: w.cache,
    disableAutoCam, toggleOrbits: () => setOrbitsVisible(!w.flags.orbitsVisible),
  };
}

function bindRuntimeHud(w: RuntimeHudWire): {
  hud: ReturnType<typeof bindHud>;
  setAutoCamUi: (e: boolean) => void;
  notifyAutoCamera: (m: CameraMode) => void;
  disableAutoCam: () => void;
} {
  let setAutoCamUi: (e: boolean) => void = () => {};
  const disableAutoCam = makeDisableAutoCam(w.autoCam, () => setAutoCamUi);
  const wire = makeHudWire(w, disableAutoCam, makeSetOrbitsVisible(w));
  const hud = bindHud(w.clock, w.timeline, makeHudHandlers(wire), w.cache.samples, "gulf");
  setAutoCamUi = hud.setAutoCamEnabled;
  w.director.setOnUserControl(() => disableAutoCam());
  return { hud, setAutoCamUi, notifyAutoCamera: hud.notifyAutoCamera, disableAutoCam };
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

function fillVecsB(craft: THREE.Object3D, craftPos: THREE.Vector3) {
  return {
    earthVelV: new THREE.Vector3(),
    moonPosV: new THREE.Vector3(),
    moonVelV: new THREE.Vector3(),
    skyEarth: new THREE.Vector3(),
    skySun: new THREE.Vector3(),
    ...fillSplashScratch(),
    orient: makeOrient(craft, craftPos),
  };
}

function fillSplashScratch() {
  return {
    splashMesh: { x: 0, y: 0, z: 0 },
    splashWorld: { x: 0, y: 0, z: 0 },
  };
}

function fillVectors(craft: THREE.Object3D, craftPos: THREE.Vector3) {
  return { ...fillVecsA(craftPos), ...fillVecsB(craft, craftPos) };
}

function worldSliceA(world: ReturnType<typeof assembleWorld>) {
  return {
    renderer: world.renderer,
    camera: world.camera,
    director: world.director,
    scene: world.sceneParts.scene,
    sunLight: world.sceneParts.sunLight,
  };
}

function worldSliceB(world: ReturnType<typeof assembleWorld>) {
  return {
    fillLight: world.sceneParts.fillLight,
    earthshine: world.sceneParts.earthshine,
    orbitGroup: world.sceneParts.orbitGroup,
    bodies: world.bodies,
    groundSky: world.groundSky,
  };
}

function craftSliceA(world: ReturnType<typeof assembleWorld>) {
  return {
    starbasePad: world.pad.starbasePad,
    moonRelOrbit: world.orbits.moonRelOrbit,
    orbitExtras: world.orbits.orbitExtras,
    craft: world.craft,
    locator: world.locator,
    cinema: world.cinema,
  };
}

function initialCinemaState(): F13CinemaState {
  return { burning: false, phase: "launch", plasma: 0, altEarth: 0 };
}

function craftSliceB(world: ReturnType<typeof assembleWorld>) {
  return {
    cinemaState: initialCinemaState(),
    vectorArrows: world.vectorArrows,
    stagingFx: world.fx.stagingFx,
    stageT: world.fx.stageT,
    splashFx: world.fx.splashFx,
    gulfLandFx: world.fx.gulfLandFx,
    entryFx: world.fx.entryFx,
  };
}

function hudSlice(p: {
  clockPack: ReturnType<typeof makeClockAndTimeline>;
  autoCam: F13AutoCam;
  flags: F13Flags;
  hudPack: ReturnType<typeof bindRuntimeHud>;
}) {
  return {
    clock: p.clockPack.clock, physicsDurationS: p.clockPack.physicsDurationS,
    transportS: p.clockPack.transportS, autoCam: p.autoCam,
    landingBeat: createLandingBeatState(), flags: p.flags,
    setAutoCamUi: p.hudPack.setAutoCamUi, notifyAutoCamera: p.hudPack.notifyAutoCamera,
    disableAutoCam: p.hudPack.disableAutoCam, hud: p.hudPack.hud, wall: new THREE.Clock(),
  };
}

function metaSlice(p: {
  canvas: HTMLCanvasElement;
  cache: Trajectory;
  epoch: F13Ctx["epoch"];
  forceCompareLine: string;
}) {
  return {
    canvas: p.canvas,
    cache: p.cache,
    epoch: p.epoch,
    forceCompareLine: p.forceCompareLine,
  };
}

function mergeWorld(w: ReturnType<typeof assembleWorld>) {
  return {
    ...worldSliceA(w),
    ...worldSliceB(w),
    ...craftSliceA(w),
    ...craftSliceB(w),
  };
}

type FinishParts = {
  canvas: HTMLCanvasElement;
  cache: Trajectory;
  epoch: F13Ctx["epoch"];
  forceCompareLine: string;
  world: ReturnType<typeof assembleWorld>;
  clockPack: ReturnType<typeof makeClockAndTimeline>;
  autoCam: F13AutoCam;
  flags: F13Flags;
  hudPack: ReturnType<typeof bindRuntimeHud>;
  vecs: ReturnType<typeof fillVectors>;
};

function finishCtx(p: FinishParts): F13Ctx {
  return { ...metaSlice(p), ...mergeWorld(p.world), ...p.vecs, ...hudSlice(p) };
}

function wireBootstrapHud(
  world: ReturnType<typeof assembleWorld>,
  clockPack: ReturnType<typeof makeClockAndTimeline>,
  cache: Trajectory,
  autoCam: F13AutoCam,
  flags: F13Flags,
) {
  return bindRuntimeHud({
    clock: clockPack.clock, timeline: clockPack.timeline, director: world.director,
    autoCam, cache, orbitGroup: world.sceneParts.orbitGroup,
    orbitExtras: world.orbits.orbitExtras, flags,
  });
}

function runtimePack(world: ReturnType<typeof assembleWorld>, cache: Trajectory) {
  const clockPack = makeClockAndTimeline(cache);
  const autoCam: F13AutoCam = { enabled: true, phase: null, staged: false };
  const flags: F13Flags = { orbitsVisible: true };
  const hudPack = wireBootstrapHud(world, clockPack, cache, autoCam, flags);
  return { clockPack, autoCam, flags, hudPack };
}

function finishBootstrap(
  canvas: HTMLCanvasElement,
  bundle: ReturnType<typeof loadEpochBundle>,
  world: ReturnType<typeof assembleWorld>,
  rt: ReturnType<typeof runtimePack>,
): F13Ctx {
  wirePointer(canvas, world.camera, world.vectorArrows);
  return finishCtx({
    canvas,
    ...bundle,
    world,
    ...rt,
    vecs: fillVectors(world.craft, new THREE.Vector3()),
  });
}

/** Build full Flight 13 theater context (HUD wired, ready for first apply). */
export function bootstrapFlight13(): F13Ctx {
  prepareChrome();
  const canvas = requireCanvas();
  const bundle = loadEpochBundle();
  const world = assembleWorld(canvas, bundle.cache, bundle.epoch);
  return finishBootstrap(canvas, bundle, world, runtimePack(world, bundle.cache));
}

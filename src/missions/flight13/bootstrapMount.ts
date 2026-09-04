/** F13 scene mount. */
import * as THREE from "three";
import {createMissionClock,type MissionClock} from "../../mission/clock";
import {buildTimeline} from "../../mission/timeline";
import {timelineWithPrelaunch,transportDurationS} from "../../mission/prelaunch";
import {loadFlight13Trajectory,computeFlight13Trajectory,type Trajectory} from "../../physics/trajectoryCache";
import {applyFlight13Epoch} from "../../physics/flight13Epoch";
import {compareFlight13ToEarthOnly,formatForceCompareLine} from "../../physics/flight13ForceCompare";
import {firstSplashdownT} from "../../physics/flight13Mission";
import {hasHorizonsEpoch,horizonsSource} from "../../physics/horizonsEpoch";
import {EARTH_SPIN_RATE,earthNorthPole} from "../../physics/earthFrame";
import {createMoonPathThroughSim,createMoonRelativeOrbit,createScene} from "../../scene/createScene";
import {CRAFT_MESH_SCALE,createCraft} from "../../scene/craft";
import {meshLocalTrailFromSamples} from "../../physics/earthTrail";
import {createTrailFromPoints} from "../../scene/trail";
import {createStagingFx,findStageEvent} from "../../scene/stagingFx";
import {createEntryFx} from "../../scene/entryFx";
import {createPayloadFx} from "../../scene/payloadFx";
import {createSplashFx} from "../../scene/splashFx";
import {createGulfLandFx} from "../../scene/gulfLandFx";
import {createStarbasePad} from "../../scene/earthTheater";
import {createGroundSky} from "../../scene/groundSky";
import {createCinemaComposer,enableSunShadows,markPadShadowMeshes,markShadowMeshes,theaterPixelRatio} from "../../scene/cinema";
import {createVectorArrows} from "../../scene/vectorArrows";
import {createBodies} from "../../scene/bodies";
import {CameraDirector} from "../../camera/modes";
import {setTheaterVisible} from "../../app/shell";
import type {OrientScratch} from "./orientCraft";
import type {F13Ctx} from "./bootstrap";

export function requireCanvas(): HTMLCanvasElement {
  const el = document.querySelector<HTMLCanvasElement>("#c");
  if (!el) throw new Error("Canvas #c not found");
  return el;
}

export function hideMenusAndBriefing(): void {
  const menus = document.getElementById("menus");
  if (menus) menus.hidden = true;
  const briefing = document.getElementById("flight13-briefing");
  if (briefing) briefing.hidden = true;
}

export function setFlight13HudTitles(): void {
  const h1 = document.querySelector(".hud-header h1");
  if (h1) h1.textContent = "Starship Flight 13";
  const sub = document.querySelector(".hud-header .subtitle");
  if (sub) sub.textContent = "July 2026 · Starbase · flight test · true scale";
  const mcSub = document.querySelector(".mc-sub");
  if (mcSub) {
    mcSub.textContent = "Starbase → Indian Ocean splashdown · Flight 13";
  }
}

export function prepareChrome(): void {
  setTheaterVisible(true);
  document.title = "tothemoon — Starship Flight 13";
  hideMenusAndBriefing();
  setFlight13HudTitles();
}

export function loadCache(): Trajectory {
  const recompute =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("recompute");
  if (recompute) {
    const phaseBoot = document.querySelector("#phase");
    if (phaseBoot) phaseBoot.textContent = "Recomputing Flight 13…";
  }
  return recompute ? computeFlight13Trajectory() : loadFlight13Trajectory();
}

export function logBoot(cache: Trajectory, sun0: number, padSunElev: number): void {
  console.info(
    `[flight13] Launch theater · duration ${(cache.durationS / 60).toFixed(1)} min · ` +
      `stageT=${cache.stageT?.toFixed(0) ?? "—"}s · peak |v|=${cache.peakSpeedKmS.toFixed(2)} km/s · ` +
      `daytime pad sin(el)=${padSunElev.toFixed(3)} · sunPhase0=${sun0.toFixed(4)}` +
      (hasHorizonsEpoch() ? ` · ephemeris=${horizonsSource()}` : " · analytic Earth/Sun"),
  );
}

export function logForce(fc: ReturnType<typeof compareFlight13ToEarthOnly>): void {
  console.info(
    `[flight13] Force check · coast max |Δr|=${fc.coastMaxPosDevKm.toFixed(2)} km · ` +
      `full max |Δr|=${fc.maxPosDevKm.toFixed(1)} km · ` +
      `max |Δv|=${fc.maxVelDevKmS.toFixed(3)} km/s`,
  );
}

export function buildForceLine(cache: Trajectory): string {
  const fc = compareFlight13ToEarthOnly(cache.samples, {
    durationS: cache.durationS,
    stageT: cache.stageT,
  });
  logForce(fc);
  return formatForceCompareLine(fc);
}

export function configureRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.setPixelRatio(theaterPixelRatio(window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
}

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true,
  });
  configureRenderer(renderer);
  return renderer;
}

export function makeCameraDirector(canvas: HTMLCanvasElement, epoch: F13Ctx["epoch"]) {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 2_000_000);
  const director = new CameraDirector(camera, canvas);
  director.setEpoch(epoch);
  return { camera, director };
}

export function mountBodies(
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

export function mountPadAndTrail(
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

export function mountMoonOrbits(
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

export function mountCraft(scene: THREE.Scene, director: CameraDirector) {
  const { group: craft } = createCraft();
  scene.add(craft);
  director.setCraft(craft);
  markShadowMeshes(craft, { cast: true, receive: true });
  return { craft };
}

export function mountStaging(
  scene: THREE.Scene,
  craft: THREE.Group,
  director: CameraDirector,
  cache: Trajectory,
) {
  const boosterProto = craft.getObjectByName("booster");
  const stagingFx = createStagingFx(boosterProto ?? new THREE.Group(), CRAFT_MESH_SCALE);
  const stageEvent = findStageEvent(cache.samples);
  stagingFx.setStageEvent(stageEvent, "gulf", cache.epoch);
  scene.add(stagingFx.group);
  director.setDetachedBooster(stagingFx.detachedBooster);
  markShadowMeshes(stagingFx.group, { cast: true, receive: true });
  return { stagingFx, stageT: stageEvent?.t ?? null };
}

export function mountSplashEntry(
  staging: ReturnType<typeof mountStaging>,
  cache: Trajectory,
  bodies: ReturnType<typeof createBodies>,
  craft: THREE.Group,
) {
  const splashFx = createSplashFx();
  splashFx.setSplashTime(firstSplashdownT(cache.samples));
  bodies.earth.add(splashFx.group);
  const gulfLandFx = createGulfLandFx();
  const stageT = staging.stageT;
  if (stageT != null) gulfLandFx.setLandTime(stageT);
  bodies.earth.add(gulfLandFx.group);
  const entryFx = createEntryFx(craft);
  craft.add(entryFx.group);
  const payloadFx = createPayloadFx(craft);
  return { ...staging, splashFx, gulfLandFx, entryFx, payloadFx };
}

export function mountFx(
  scene: THREE.Scene,
  craft: THREE.Group,
  director: CameraDirector,
  cache: Trajectory,
  bodies: ReturnType<typeof createBodies>,
) {
  const staging = mountStaging(scene, craft, director, cache);
  return mountSplashEntry(staging, cache, bodies, craft);
}

export function orientScratchA(
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

export function orientScratchB(): Omit<
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

export function makeOrient(craft: THREE.Object3D, craftPos: THREE.Vector3): OrientScratch {
  const omega = new THREE.Vector3();
  earthNorthPole(omega);
  omega.multiplyScalar(EARTH_SPIN_RATE);
  return { ...orientScratchA(craft, craftPos, omega), ...orientScratchB() };
}

export function makeClockAndTimeline(cache: Trajectory) {
  const physicsDurationS = cache.durationS;
  const transportS = transportDurationS(physicsDurationS);
  const timeline = timelineWithPrelaunch(
    buildTimeline(cache.samples, physicsDurationS),
    physicsDurationS,
  );
  return { clock: playClock(), physicsDurationS, transportS, timeline };
}

export function playClock(): MissionClock {
  const clock = createMissionClock();
  clock.setSpeed(1);
  clock.play();
  return clock;
}

export function loadEpochBundle() {
  const cache = loadCache();
  const applied = applyFlight13Epoch(cache.moonPhase0, cache.horizonsLandingT);
  logBoot(cache, applied.sunPhase0, applied.padSunElev);
  return {
    cache,
    epoch: applied.epoch,
    forceCompareLine: buildForceLine(cache),
  };
}

export function assembleCore(canvas: HTMLCanvasElement, epoch: F13Ctx["epoch"]) {
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

export function assembleOverlays(
  core: ReturnType<typeof assembleCore>,
  cache: Trajectory,
  epoch: F13Ctx["epoch"],
) {
  const pad = mountPadAndTrail(core.bodies, cache, epoch);
  core.director.setPad(pad.starbasePad);
  const orbits = mountMoonOrbits(
    core.sceneParts.orbitGroup, core.bodies, cache, epoch, pad.craftTrail,
  );
  const { craft } = mountCraft(core.sceneParts.scene, core.director);
  return { pad, orbits, craft };
}

export function assembleCinema(
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

export function assembleWorld(
  canvas: HTMLCanvasElement,
  cache: Trajectory,
  epoch: F13Ctx["epoch"],
) {
  const core = assembleCore(canvas, epoch);
  const overlays = assembleOverlays(core, cache, epoch);
  const cinemaPack = assembleCinema(core, overlays, cache);
  return { ...core, ...overlays, ...cinemaPack };
}

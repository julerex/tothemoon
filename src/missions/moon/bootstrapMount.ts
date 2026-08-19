/** Moon scene mount. */
import * as THREE from "three";
import {createMissionClock} from "../../mission/clock";
import {buildTimeline} from "../../mission/timeline";
import {timelineWithPrelaunch,transportDurationS} from "../../mission/prelaunch";
import {computeLunarTrajectory,loadPrecomputedTrajectory,trailPoints,trajectoryCoastCorridor,type Trajectory} from "../../physics/trajectoryCache";
import {daysPastFullAtLanding,formatMissionDateUtc} from "../../physics/epoch";
import {hasHorizonsEpoch,horizonsSource} from "../../physics/horizonsEpoch";
import {EARTH_SPIN_RATE,earthNorthPole} from "../../physics/earthFrame";
import {createMoonPathThroughSim,createMoonRelativeOrbit,createScene} from "../../scene/createScene";
import {CRAFT_MESH_SCALE,createCraft} from "../../scene/craft";
import {createCoastBeatsOverlay,createCoastCorridorOverlay} from "../../scene/coastCorridor";
import type {Line2} from "three/addons/lines/Line2.js";
import {createTrailFromPoints} from "../../scene/trail";
import {createStagingFx,findStageEvent} from "../../scene/stagingFx";
import {createLandingFx} from "../../scene/landingFx";
import {createStarbasePad} from "../../scene/earthTheater";
import {createGroundSky} from "../../scene/groundSky";
import {createCinemaComposer,enableSunShadows,markPadShadowMeshes,markShadowMeshes} from "../../scene/cinema";
import {createVectorArrows} from "../../scene/vectorArrows";
import {createBodies} from "../../scene/bodies";
import {CameraDirector} from "../../camera/modes";
import {setTheaterVisible} from "../../app/shell";
import type {MoonOrientScratch} from "./orientCraft";

export function requireCanvas(): HTMLCanvasElement {
  const el = document.querySelector<HTMLCanvasElement>("#c");
  if (!el) throw new Error("Canvas #c not found");
  return el;
}

export function prepareChrome(): void {
  setTheaterVisible(true);
  document.title = "tothemoon — Starbase → Moon";
}

export function loadCache(): Trajectory {
  const recompute =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("recompute");
  if (recompute) {
    const phaseBoot = document.querySelector("#phase");
    if (phaseBoot) phaseBoot.textContent = "Recomputing trajectory…";
  }
  return recompute ? computeLunarTrajectory() : loadPrecomputedTrajectory();
}

export function logBoot(cache: Trajectory): void {
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

export function styleRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true,
  });
  styleRenderer(renderer);
  return renderer;
}

export function mountBodiesSky(
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

export function makeDirector(canvas: HTMLCanvasElement, epoch: Trajectory["epoch"]) {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 2_000_000);
  const director = new CameraDirector(camera, canvas);
  director.setEpoch(epoch);
  return { camera, director };
}

export function mountCore(canvas: HTMLCanvasElement, epoch: Trajectory["epoch"]) {
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

export function mountPadTrail(
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

export function mountCorridor(orbitGroup: THREE.Group, cache: Trajectory): void {
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

export function mountOrbits(
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

export function mountCraft(scene: THREE.Scene, director: CameraDirector) {
  const { group: craft } = createCraft();
  scene.add(craft);
  director.setCraft(craft);
  markShadowMeshes(craft, { cast: true, receive: true });
  return { craft };
}

export function mountStagingFx(
  scene: THREE.Scene,
  craft: THREE.Group,
  director: CameraDirector,
  cache: Trajectory,
) {
  const boosterProto = craft.getObjectByName("booster");
  const stagingFx = createStagingFx(boosterProto ?? new THREE.Group(), CRAFT_MESH_SCALE);
  const stageEvent = findStageEvent(cache.samples);
  stagingFx.setStageEvent(stageEvent, "chopsticks", cache.epoch);
  scene.add(stagingFx.group);
  director.setDetachedBooster(stagingFx.detachedBooster);
  markShadowMeshes(stagingFx.group, { cast: true, receive: true });
  return { stagingFx, stageT: stageEvent?.t ?? null };
}

export function mountLandingFx(scene: THREE.Scene, cache: Trajectory, epoch: Trajectory["epoch"]) {
  const landingFx = createLandingFx();
  landingFx.setEpoch(epoch);
  const last = cache.samples[cache.samples.length - 1]!;
  landingFx.setLanding(last.pos, last.t);
  scene.add(landingFx.group);
  return landingFx;
}

export function mountFx(
  scene: THREE.Scene,
  craft: THREE.Group,
  director: CameraDirector,
  cache: Trajectory,
  epoch: Trajectory["epoch"],
) {
  const staging = mountStagingFx(scene, craft, director, cache);
  return { ...staging, landingFx: mountLandingFx(scene, cache, epoch) };
}

export function orientCore(craft: THREE.Object3D, craftPos: THREE.Vector3, omega: THREE.Vector3) {
  return {
    craftPos,
    craft,
    craftTan: new THREE.Vector3(),
    localUp: new THREE.Vector3(),
    omega,
    ...orientVelScratch(),
  };
}

export function orientVelScratch() {
  return {
    spinVel: new THREE.Vector3(),
    airVel: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
  };
}

export function orientMats(): Pick<
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

export function makeOrient(craft: THREE.Object3D, craftPos: THREE.Vector3): MoonOrientScratch {
  const omega = new THREE.Vector3();
  earthNorthPole(omega);
  omega.multiplyScalar(EARTH_SPIN_RATE);
  return { ...orientCore(craft, craftPos, omega), ...orientMats() };
}

export function makeClock(cache: Trajectory) {
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

export function assemblePadOrbits(
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

export function assembleCraftCinema(
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

export function assembleWorld(canvas: HTMLCanvasElement, cache: Trajectory) {
  const core = mountCore(canvas, cache.epoch);
  const { pad, orbits } = assemblePadOrbits(core, cache);
  const craftPack = assembleCraftCinema(core, cache, orbits);
  return { ...core, pad, orbits, ...craftPack };
}

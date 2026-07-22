import * as THREE from "three";
import { MissionClock } from "./mission/clock";
import { TrajectoryCache } from "./physics/trajectoryCache";
import { bodyPositions, setMoonPhase0, setSunPhase0 } from "./physics/bodies";
import { R_EARTH, R_MOON } from "./physics/constants";
import {
  daysPastFullAtLanding,
  formatMissionDateUtc,
  sunPhase0ForLanding,
} from "./physics/epoch";
import { createScene } from "./scene/createScene";
import { createBodies, spinBodies, updateBodies } from "./scene/bodies";
import {
  createCraft,
  craftLengthKm,
  updateCraftVisuals,
  updateLocatorVisibility,
} from "./scene/craft";
import { createTrailFromPoints, createPathGlowFromPoints } from "./scene/trail";
import { StagingFx, findStageEvent } from "./scene/stagingFx";
import { LandingFx } from "./scene/landingFx";
import {
  createAscentGroundTrack,
  createStarbasePad,
  pulsePadBeacon,
} from "./scene/earthTheater";
import { updateZoomLabels } from "./scene/zoomLabels";
import { CameraDirector, type CameraMode } from "./camera/modes";
import {
  autoSpeedForPhase,
  buildTimeline,
} from "./mission/timeline";
import { bindHud } from "./ui/hud";
import type { PhaseId } from "./physics/mission";
import "./style.css";

const canvasEl = document.querySelector<HTMLCanvasElement>("#c");
if (!canvasEl) throw new Error("Canvas #c not found");
const canvas = canvasEl;

// Trajectory is baked at build time (scripts/precompute-trajectory.ts).
// Pass ?recompute=1 to re-run RK4 in the browser (slow, for physics debugging).
const recompute =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("recompute");
if (recompute) {
  const phaseBoot = document.querySelector("#phase");
  if (phaseBoot) phaseBoot.textContent = "Recomputing trajectory…";
}
const cache = recompute
  ? TrajectoryCache.compute()
  : TrajectoryCache.loadPrecomputed();
setMoonPhase0(cache.moonPhase0);
// Align Sun so landing (t = duration) matches 2027-07-20 waning gibbous geometry
const sun0 = sunPhase0ForLanding(cache.moonPhase0, cache.durationS);
setSunPhase0(sun0);
console.info(
  `[tothemoon] Epoch landing 2027-07-20 12:00 UTC · ${daysPastFullAtLanding().toFixed(2)} d past full · sunPhase0=${sun0.toFixed(4)}`,
);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera(50, 1, 1, 2_000_000);
const director = new CameraDirector(camera, canvas);

const { scene, sunLight } = createScene();
const bodies = createBodies();
scene.add(bodies.earthGroup, bodies.moonGroup, bodies.sunGroup);

// Starbase pad + ground track (Earth mesh-local → co-rotates)
const starbasePad = createStarbasePad();
bodies.earth.add(starbasePad);
const groundTrack = createAscentGroundTrack(cache.samples);
if (groundTrack) bodies.earth.add(groundTrack);

const trailPts = cache.trailPoints(1500);
scene.add(createTrailFromPoints(trailPts));
scene.add(createPathGlowFromPoints(trailPts));

const { group: craft, locator } = createCraft();
scene.add(craft);

// Staging fallaway + flash (mesh scale matches createCraft)
const boosterProto = craft.getObjectByName("booster");
const stagingFx = new StagingFx(boosterProto ?? new THREE.Group(), 0.04);
stagingFx.setStageEvent(findStageEvent(cache.samples));
scene.add(stagingFx.group);

// Landing site + dust
const landingFx = new LandingFx();
const lastSample = cache.samples[cache.samples.length - 1]!;
landingFx.setLanding(lastSample.pos, lastSample.t);
scene.add(landingFx.group);

const clock = new MissionClock();
const timeline = buildTimeline(cache.samples, cache.durationS);
/** Auto: phase-driven rates. Fixed: user-picked multiplier. */
let autoSpeed = true;
let lastAutoPhase: PhaseId | null = null;

function applyAutoSpeed(phase: PhaseId): void {
  if (!autoSpeed) return;
  if (phase === lastAutoPhase) return;
  lastAutoPhase = phase;
  clock.setSpeed(autoSpeedForPhase(phase));
}

// Default until HUD binds (matches Auto · ascent-ish start)
clock.setSpeed(autoSpeedForPhase("launch"));

const craftPos = new THREE.Vector3();
const craftVel = new THREE.Vector3();
const craftTan = new THREE.Vector3();
const _look = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

const hud = bindHud(clock, timeline, {
  onPlayToggle: () => clock.toggle(),
  onSpeedMode: (mode) => {
    if (mode === "auto") {
      autoSpeed = true;
      lastAutoPhase = null; // force re-apply for current phase
      const frame = cache.sampleAtProgress(clock.t);
      applyAutoSpeed(frame.phase);
    } else {
      autoSpeed = false;
      lastAutoPhase = null;
      clock.setSpeed(mode);
    }
  },
  onScrub: (t) => clock.seek(t),
  onCamera: (mode: CameraMode) => director.setMode(mode),
  onOrbitKey: (key, down) => director.setOrbitKey(key, down),
  onPanKey: (key, down) => director.setPanKey(key, down),
  onZoomKey: (key, down) => director.setZoomKey(key, down),
});

function orientCraft(vel: THREE.Vector3): void {
  if (vel.lengthSq() < 1e-12) return;
  craftTan.copy(vel).normalize();
  const lookTarget = craftPos.clone().add(craftTan);
  _look.lookAt(craftPos, lookTarget, _up);
  _quat.setFromRotationMatrix(_look);
  craft.quaternion.copy(_quat);
}

function applyMissionState(u: number): void {
  const frame = cache.sampleAtProgress(u);
  craftPos.set(frame.pos.x, frame.pos.y, frame.pos.z);
  craftVel.set(frame.vel.x, frame.vel.y, frame.vel.z);

  const b = bodyPositions(frame.t);

  // Never draw the craft under Earth's surface (ascent/LEO numerical dips)
  const nearEarthPhase =
    frame.phase === "launch" ||
    frame.phase === "ascent" ||
    frame.phase === "leo" ||
    frame.phase === "tli";
  if (nearEarthPhase) {
    const dx = craftPos.x - b.earth.x;
    const dy = craftPos.y - b.earth.y;
    const dz = craftPos.z - b.earth.z;
    const r = Math.hypot(dx, dy, dz);
    const minR = R_EARTH + 0.05; // tiny epsilon above mean surface (km)
    if (r < minR && r > 1e-6) {
      const s = minR / r;
      craftPos.set(
        b.earth.x + dx * s,
        b.earth.y + dy * s,
        b.earth.z + dz * s,
      );
    }
  }

  craft.position.copy(craftPos);
  orientCraft(craftVel);

  updateCraftVisuals(craft, {
    staged: frame.staged,
    burning: frame.burning,
    thrustN: frame.thrustN,
  });
  stagingFx.update(frame.t, craftPos, craft.quaternion);
  landingFx.update(frame.t, craftPos, {
    phase: frame.phase,
    burning: frame.burning,
    altMoon: frame.altMoon,
  });
  updateBodies(frame.t, bodies);

  // Sun light from ephemeris (direction only — avoid AU-scale light positions)
  sunLight.position.set(
    b.sun.x - b.earth.x,
    b.sun.y - b.earth.y,
    b.sun.z - b.earth.z,
  );
  sunLight.target.position.set(0, 0, 0);
  sunLight.target.updateMatrixWorld();

  updateLocatorVisibility(locator, camera, craftPos, {
    craftLenKm: craftLengthKm(frame.staged),
  });

  // Altitude: Earth during launch/LEO/TLI/coast (far from Moon); else Moon
  const nearEarth =
    frame.phase === "launch" ||
    frame.phase === "ascent" ||
    frame.phase === "leo" ||
    frame.phase === "tli" ||
    frame.phase === "coast";
  const altitude =
    nearEarth && frame.distMoon > 100_000 ? frame.altEarth : frame.altMoon;

  applyAutoSpeed(frame.phase);

  hud.update({
    phase: frame.phaseLabel,
    phaseId: frame.phase,
    t: frame.t,
    durationS: cache.durationS,
    distanceToMoon: Math.max(0, frame.distMoon - R_MOON),
    altitude,
    speed: frame.speed,
    fuelBooster: frame.fuelBooster,
    fuelShip: frame.fuelShip,
    thrustN: frame.thrustN,
    playing: clock.playing,
    dateUtc: formatMissionDateUtc(frame.t, cache.durationS),
    playbackSpeed: clock.speed,
    autoSpeed,
    missionComplete: frame.phase === "landed",
    tliDv: cache.tliDv,
    minMoonAlt: cache.minMoonAlt,
  });

  // Auto-pause on landing at end
  if (u >= 1 && clock.playing) {
    clock.pause();
  }
}

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
}

const wall = new THREE.Clock();
applyMissionState(0);

function frame(): void {
  requestAnimationFrame(frame);
  resize();

  const dt = Math.min(wall.getDelta(), 0.05);
  clock.tick(dt, cache.durationS);
  applyMissionState(clock.t);

  pulsePadBeacon(starbasePad, wall.elapsedTime);
  spinBodies(bodies, dt);
  director.update(dt, cache.sampleAtProgress(clock.t).t, craftPos, craftVel);
  updateZoomLabels(scene, camera);

  renderer.render(scene, camera);
}

frame();

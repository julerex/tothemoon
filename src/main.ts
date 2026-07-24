import * as THREE from "three";
import { MissionClock } from "./mission/clock";
import { TrajectoryCache } from "./physics/trajectoryCache";
import { bodyPositions, setMoonPhase0, setSunPhase0 } from "./physics/bodies";
import { R_EARTH, R_MOON } from "./physics/constants";
import {
  EARTH_SPIN_RATE,
  earthNorthPole,
} from "./physics/earthFrame";
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
import { updateFatLineResolutions } from "./scene/fatLines";
import { createTrailFromPoints } from "./scene/trail";
import { StagingFx, findStageEvent } from "./scene/stagingFx";
import { LandingFx } from "./scene/landingFx";
import {
  createAscentGroundTrack,
  createStarbasePad,
  pulsePadBeacon,
  updateStarbaseLaunchFx,
} from "./scene/earthTheater";
import { createGroundSky, updateGroundSky } from "./scene/groundSky";
import { toggleZoomLabels, updateZoomLabels } from "./scene/zoomLabels";
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

const { scene, sunLight, orbitGroup } = createScene();
const bodies = createBodies();
scene.add(bodies.earthGroup, bodies.moonGroup, bodies.sunGroup);

// Atmospheric sky shell — visible only for low-altitude / pad cameras
const groundSky = createGroundSky();
scene.add(groundSky.mesh);
const _skyEarth = new THREE.Vector3();
const _skySun = new THREE.Vector3();

// Starbase pad + ground track (Earth mesh-local → co-rotates)
const starbasePad = createStarbasePad();
bodies.earth.add(starbasePad);
const groundTrack = createAscentGroundTrack(cache.samples);
if (groundTrack) bodies.earth.add(groundTrack);

const trailPts = cache.trailPoints(1500);
const craftTrail = createTrailFromPoints(trailPts);
// Mission trail is an orbit overlay (toggled with O alongside grids / Moon path)
orbitGroup.add(craftTrail);

/** Extra orbit overlays not parented under orbitGroup (Earth-fixed track, SOI). */
const orbitExtras: THREE.Object3D[] = [bodies.earthSoi, bodies.moonSoi];
if (groundTrack) orbitExtras.push(groundTrack);

let orbitsVisible = true;
function setOrbitsVisible(visible: boolean): void {
  orbitsVisible = visible;
  orbitGroup.visible = visible;
  for (const obj of orbitExtras) obj.visible = visible;
}
function toggleOrbits(): boolean {
  setOrbitsVisible(!orbitsVisible);
  return orbitsVisible;
}

const { group: craft, locator } = createCraft();
scene.add(craft);

// Staging fallaway + flash (mesh scale matches createCraft)
const boosterProto = craft.getObjectByName("booster");
const stagingFx = new StagingFx(boosterProto ?? new THREE.Group(), 0.04);
const stageEvent = findStageEvent(cache.samples);
stagingFx.setStageEvent(stageEvent);
const stageT = stageEvent?.t ?? null;
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
/** Roll reference for lookAt (must not be parallel to heading). */
const _rollUp = new THREE.Vector3(0, 1, 0);
const _earthPos = new THREE.Vector3();
const _earthVel = new THREE.Vector3();
const _localUp = new THREE.Vector3();
const _omega = new THREE.Vector3();
const _spinVel = new THREE.Vector3();
const _airVel = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
/** Earth north pole (fixed); spin ω = pole × EARTH_SPIN_RATE. */
earthNorthPole(_omega);
_omega.multiplyScalar(EARTH_SPIN_RATE);

/**
 * Minimum surface-relative speed (km/s) before we trust air-relative velocity
 * for attitude. Below this (pad / first moments of liftoff) stand on local up
 * so Earth rotation does not lay the stack on its side next to the tower.
 */
const AIR_VEL_ATTITUDE_MIN = 0.04;

/** Fixed playback rates offered in the HUD (and nudged by `,` / `.`). */
const SPEED_STEPS = [1, 10, 50, 100, 500, 1000, 2000] as const;

function nudgePlaybackSpeed(current: number, dir: -1 | 1): number {
  if (dir > 0) {
    for (const step of SPEED_STEPS) {
      if (step > current + 1e-9) return step;
    }
    return SPEED_STEPS[SPEED_STEPS.length - 1]!;
  }
  for (let i = SPEED_STEPS.length - 1; i >= 0; i--) {
    const step = SPEED_STEPS[i]!;
    if (step < current - 1e-9) return step;
  }
  return SPEED_STEPS[0]!;
}

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
  onSpeedNudge: (dir) => {
    const next = nudgePlaybackSpeed(clock.speed, dir);
    autoSpeed = false;
    lastAutoPhase = null;
    clock.setSpeed(next);
    return next;
  },
  onScrub: (t) => clock.seek(t),
  onCamera: (mode: CameraMode) => director.setMode(mode),
  onOrbitKey: (key, down) => director.setOrbitKey(key, down),
  onPanKey: (key, down) => director.setPanKey(key, down),
  onZoomKey: (key, down) => director.setZoomKey(key, down),
  onToggleLabels: () => {
    toggleZoomLabels();
  },
  onToggleOrbits: () => {
    toggleOrbits();
  },
});

/**
 * Point craft local +Z (nose) along `heading`, with engines (−Z) aft.
 * Matrix4.lookAt is camera-convention; swap eye/target like Object3D.lookAt.
 */
function applyCraftHeading(heading: THREE.Vector3): void {
  if (heading.lengthSq() < 1e-16) return;
  craftTan.copy(heading).normalize();
  _lookTarget.copy(craftPos).add(craftTan);
  // Roll hint: world Y unless nearly parallel to nose
  _rollUp.set(0, 1, 0);
  if (Math.abs(craftTan.dot(_rollUp)) > 0.95) {
    _rollUp.set(1, 0, 0);
  }
  _look.lookAt(_lookTarget, craftPos, _rollUp);
  _quat.setFromRotationMatrix(_look);
  craft.quaternion.copy(_quat);
}

/**
 * Attitude for the stack:
 * - Pad / tower: local radial up (inertial vel is Earth spin → would lay horizontal)
 * - Near-Earth flight: surface-relative velocity (climb + gravity turn)
 * - Deep space: inertial velocity
 */
function orientCraft(
  vel: THREE.Vector3,
  earthPos: THREE.Vector3,
  earthVel: THREE.Vector3,
  nearEarth: boolean,
): void {
  _localUp.set(
    craftPos.x - earthPos.x,
    craftPos.y - earthPos.y,
    craftPos.z - earthPos.z,
  );
  const r = _localUp.length();
  if (r > 1e-6) {
    _localUp.multiplyScalar(1 / r);
  } else {
    _localUp.set(0, 1, 0);
  }

  if (nearEarth) {
    // v_air = v − v_earth − ω × r  (ground-relative)
    _spinVel.crossVectors(_omega, _localUp).multiplyScalar(r);
    _airVel.copy(vel).sub(earthVel).sub(_spinVel);
    if (_airVel.lengthSq() < AIR_VEL_ATTITUDE_MIN * AIR_VEL_ATTITUDE_MIN) {
      applyCraftHeading(_localUp);
      return;
    }
    applyCraftHeading(_airVel);
    return;
  }

  if (vel.lengthSq() < 1e-12) return;
  applyCraftHeading(vel);
}

function applyMissionState(u: number): void {
  const frame = cache.sampleAtProgress(u);
  craftPos.set(frame.pos.x, frame.pos.y, frame.pos.z);
  craftVel.set(frame.vel.x, frame.vel.y, frame.vel.z);

  const b = bodyPositions(frame.t);
  _earthPos.set(b.earth.x, b.earth.y, b.earth.z);
  _earthVel.set(b.earthVel.x, b.earthVel.y, b.earthVel.z);

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
  // Use surface-relative attitude through early cislunar; pure inertial beyond
  const attitudeNearEarth =
    nearEarthPhase ||
    (Number.isFinite(frame.altEarth) && frame.altEarth < 50_000);
  orientCraft(craftVel, _earthPos, _earthVel, attitudeNearEarth);

  updateCraftVisuals(craft, {
    staged: frame.staged,
    burning: frame.burning,
    thrustN: frame.thrustN,
    missionT: frame.t,
    stageT,
    altEarth: frame.altEarth,
    phase: frame.phase,
  });
  updateStarbaseLaunchFx(starbasePad, {
    missionT: frame.t,
    phase: frame.phase,
    burning: frame.burning,
    altEarth: frame.altEarth,
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
  // Cache for ground-sky update after the camera moves this frame
  _skyEarth.copy(_earthPos);
  _skySun.copy(sunLight.position);

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
    missionComplete:
      frame.phase === "landed" ||
      frame.phase === "impact" ||
      (u >= 0.999 && frame.phase === "coast"),
    tliDv: cache.tliDv,
    minMoonAlt: cache.minMoonAlt,
    focusDistance: director.getFocusDistance(),
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
    // Line2 stroke width is resolution-dependent
    updateFatLineResolutions(scene, w, h);
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

  // Pad / low-altitude sky (fades out once the camera leaves the atmosphere)
  updateGroundSky(groundSky, camera, _skyEarth, _skySun);

  renderer.render(scene, camera);
}

frame();

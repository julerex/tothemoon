import * as THREE from "three";
import { MissionClock } from "../mission/clock";
import { TrajectoryCache } from "../physics/trajectoryCache";
import { bodyPositions } from "../physics/bodies";
import { R_EARTH, R_MOON } from "../physics/constants";
import {
  EARTH_SPIN_RATE,
  earthNorthPole,
  starbasePadState,
} from "../physics/earthFrame";
import {
  daysPastFullAtLanding,
  formatMissionDateUtc,
} from "../physics/epoch";
import { hasHorizonsEpoch, horizonsSource } from "../physics/horizonsEpoch";
import {
  createMoonPathThroughSim,
  createMoonRelativeOrbit,
  createScene,
  updateMoonRelativeOrbit,
} from "../scene/createScene";
import {
  applyEarthshine,
  applyFillLight,
  applySunLight,
} from "../scene/sunLight";
import { createBodies, spinBodies, updateBodies } from "../scene/bodies";
import {
  CRAFT_MESH_SCALE,
  createCraft,
  craftLengthKm,
  updateCraftVisuals,
  updateLocatorVisibility,
} from "../scene/craft";
import { updateFatLineResolutions } from "../scene/fatLines";
import { createCoastCorridorOverlay } from "../scene/coastCorridor";
import { createTrailFromPoints } from "../scene/trail";
import type { Line2 } from "three/addons/lines/Line2.js";
import type { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { StagingFx, findStageEvent } from "../scene/stagingFx";
import { LandingFx } from "../scene/landingFx";
import {
  createAscentGroundTrack,
  createStarbasePad,
  pulsePadBeacon,
  updateStarbaseLaunchFx,
} from "../scene/earthTheater";
import { createGroundSky, updateGroundSky } from "../scene/groundSky";
import { toggleZoomLabels, updateZoomLabels } from "../scene/zoomLabels";
import { createVectorArrows } from "../scene/vectorArrows";
import { nextAutoCamCut } from "../camera/autoCam";
import { CameraDirector, type CameraMode } from "../camera/modes";
import type { CinematicBookmark } from "../mission/bookmarks";
import {
  classifyLandingBeat,
  landingBeatCameraMode,
  landingBeatCardReady,
  type LandingBeatKind,
} from "../mission/landingBeat";
import {
  attitudeNearEarth,
  clampCraftAboveEarth,
  craftTrailStyle,
  relativeSpeedKmS,
  shouldClampAboveEarth,
  sunElevAtPad,
  telemetryAltitudeKm,
} from "../mission/frameDerive";
import { buildTimeline } from "../mission/timeline";
import {
  physicsTToSampleU,
  timelineWithPrelaunch,
  transportDurationS,
  transportUToPhysicsT,
} from "../mission/prelaunch";
import type { PhaseId } from "../physics/missionTypes";
import { bindHud } from "../ui/hud";
import { setTheaterVisible } from "../app/shell";

/**
 * Starbase → Moon mission theater (existing precomputed trajectory).
 * Call once after the user picks this mission from the menu shell.
 */
export function startToTheMoonMission(): void {
const canvasEl = document.querySelector<HTMLCanvasElement>("#c");
if (!canvasEl) throw new Error("Canvas #c not found");
const canvas = canvasEl;

setTheaterVisible(true);
document.title = "tothemoon — Starbase → Moon";

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
// Explicit ephemeris matching the bake (Horizons map + moon phase)
const epoch = cache.epoch;
const sun0 = epoch.sunPhase0;
console.info(
  `[tothemoon] Launch ${formatMissionDateUtc(0, cache.horizonsLandingT, epoch.clockUtcMsAtT0)} · ` +
    `Horizons τ=0 at 2027-07-20 12:00 UTC · ${daysPastFullAtLanding().toFixed(2)} d past full · ` +
    (epoch.useHorizons && hasHorizonsEpoch()
      ? `ephemeris=${horizonsSource()} · landT=${(cache.horizonsLandingT / 3600).toFixed(1)}h`
      : `sunPhase0=${sun0.toFixed(4)} (analytic)`),
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
director.setEpoch(epoch);

const { scene, sunLight, fillLight, earthshine, orbitGroup } = createScene();
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
const groundTrack = createAscentGroundTrack(cache.samples, epoch);
if (groundTrack) bodies.earth.add(groundTrack);

const trailPts = cache.trailPoints(1500);
const craftTrail = createTrailFromPoints(trailPts);
// Mission trail is an orbit overlay (toggled with O alongside grids / Moon path)
orbitGroup.add(craftTrail);

// Kepler 2-body reference vs n-body coast (amber dashed + sparse whiskers)
const coastCorridor = cache.getCoastCorridor();
if (coastCorridor) {
  const corridorFx = createCoastCorridorOverlay(coastCorridor);
  orbitGroup.add(corridorFx);
  console.info(
    `[tothemoon] Coast corridor: Kepler max|Δr|=${cache.keplerRefMaxDevKm.toFixed(0)} km ` +
      `(t=${(coastCorridor.t0 / 3600).toFixed(1)}–${(coastCorridor.t1 / 3600).toFixed(1)} h)`,
  );
}

// Moon: solid blue trail of actual location over the mission; dotted blue
// osculating orbit (through the Moon) parented to Earth so it co-moves.
const moonPathSim = createMoonPathThroughSim(cache.durationS, 640, epoch);
orbitGroup.add(moonPathSim);
const moonRelOrbit = createMoonRelativeOrbit(0, epoch);
bodies.earthGroup.add(moonRelOrbit);

/** Extra orbit overlays not parented under orbitGroup (Earth-fixed track, v/a, Moon ring). */
const orbitExtras: THREE.Object3D[] = [moonRelOrbit];
if (groundTrack) orbitExtras.push(groundTrack);

const { group: craft, locator } = createCraft();
scene.add(craft);
director.setCraft(craft);

// Velocity / acceleration arrows (O with orbits; labels on hover only)
const vectorArrows = createVectorArrows();
scene.add(vectorArrows.group);
orbitExtras.push(vectorArrows.group);

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
const _craftHeading = new THREE.Vector3(0, 0, 1);
const _earthVelV = new THREE.Vector3();
const _moonPosV = new THREE.Vector3();
const _moonVelV = new THREE.Vector3();

// Staging fallaway + flash (mesh scale matches createCraft)
const boosterProto = craft.getObjectByName("booster");
const stagingFx = new StagingFx(boosterProto ?? new THREE.Group(), CRAFT_MESH_SCALE);
const stageEvent = findStageEvent(cache.samples);
stagingFx.setStageEvent(stageEvent);
const stageT = stageEvent?.t ?? null;
scene.add(stagingFx.group);
// Grid-fin cam follows the free-flyer after stage-out
director.setDetachedBooster(stagingFx.detachedBooster);

// Landing site + dust
const landingFx = new LandingFx();
landingFx.setEpoch(epoch);
const lastSample = cache.samples[cache.samples.length - 1]!;
landingFx.setLanding(lastSample.pos, lastSample.t);
scene.add(landingFx.group);

const clock = new MissionClock();
const physicsDurationS = cache.durationS;
const transportS = transportDurationS(physicsDurationS);
const timeline = timelineWithPrelaunch(
  buildTimeline(cache.samples, physicsDurationS),
  physicsDurationS,
);
// Default real-time mission pace until the HUD binds the speed select
clock.setSpeed(1);

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
const _padWorld = new THREE.Vector3();
/** Earth north pole (fixed); spin ω = pole × EARTH_SPIN_RATE. */
earthNorthPole(_omega);
_omega.multiplyScalar(EARTH_SPIN_RATE);

/**
 * Minimum surface-relative speed (km/s) before we trust air-relative velocity
 * for attitude. Below this (pad / first moments of liftoff) stand on local up
 * so Earth rotation does not lay the stack on its side next to the tower.
 */
const AIR_VEL_ATTITUDE_MIN = 0.04;

/**
 * Playback rates offered in the HUD / nudged by `,` (slower / reverse) and
 * `.` (faster / forward). Includes negative reverse rates.
 */
const SPEED_STEPS = [
  -2000, -1000, -500, -100, -50, -10, -1, 1, 10, 50, 100, 500, 1000, 2000,
] as const;

function nudgePlaybackSpeed(current: number, dir: -1 | 1): number {
  // Find nearest step at or "beyond" current in the nudge direction
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

/** Guided phase cameras — on by default; off when the user takes control. */
const autoCam = {
  enabled: true,
  phase: null as PhaseId | null,
  staged: false,
};

/**
 * Terminal landing beat: on rising mission-complete while playing, settle
 * camera, pin speed to 1×, and delay the complete card for a few wall-clock s.
 * Scrub-to-end shows the card immediately.
 */
const landingBeat = {
  kind: null as LandingBeatKind | null,
  /** performance.now() when the hold started; null → card ready immediately */
  holdStartMs: null as number | null,
  /** One-shot settle applied for the current complete edge */
  settled: false,
  wasComplete: false,
};

/** Filled after bindHud (handlers close over these). */
let setAutoCamUi: (enabled: boolean) => void = () => {};
let notifyAutoCamera: (mode: CameraMode) => void = () => {};

function disableAutoCam(): void {
  if (!autoCam.enabled) return;
  autoCam.enabled = false;
  setAutoCamUi(false);
}

const hud = bindHud(clock, timeline, {
  onPlayToggle: () => clock.toggle(),
  onSpeedMode: (rate) => {
    clock.setSpeed(rate);
  },
  onSpeedNudge: (dir) => {
    const next = nudgePlaybackSpeed(clock.speed, dir);
    clock.setSpeed(next);
    return next;
  },
  onScrub: (t) => clock.seek(t),
  onCamera: (mode: CameraMode) => {
    disableAutoCam();
    director.setMode(mode);
  },
  onCameraFrame: (mode: CameraMode) => {
    disableAutoCam();
    director.frameMode(mode);
  },
  onOrbitKey: (key, down) => director.setOrbitKey(key, down),
  onPanKey: (key, down) => {
    const mode = director.setPanKey(key, down);
    if (down) disableAutoCam();
    return mode;
  },
  onZoomKey: (key, down) => director.setZoomKey(key, down),
  onToggleLabels: () => {
    toggleZoomLabels();
  },
  onToggleOrbits: () => {
    toggleOrbits();
  },
  onAutoCamToggle: () => {
    autoCam.enabled = !autoCam.enabled;
    if (autoCam.enabled) {
      // Re-apply framing for the current phase on the next mission tick.
      autoCam.phase = null;
    }
    return autoCam.enabled;
  },
  /**
   * Seek + ease camera without turning Auto-cam off. Sync phase/staged so the
   * next tick does not immediately re-cut on the same beat.
   */
  onBookmark: (bm: CinematicBookmark) => {
    clock.seek(bm.u);
    const frame = cache.sampleAtProgress(bm.u);
    autoCam.phase = frame.phase;
    autoCam.staged = frame.staged;
    director.easeToMode(bm.mode, {
      frame: bm.frame,
      frameScale: bm.frameScale,
    });
  },
}, cache.samples);
setAutoCamUi = hud.setAutoCamEnabled;
notifyAutoCamera = hud.notifyAutoCamera;

director.setOnUserControl(() => {
  disableAutoCam();
});

// Hover labels on v/a arrows (when orbit overlays are visible)
canvas.addEventListener("pointermove", (e) => {
  vectorArrows.setPointer(e, camera, canvas);
});
canvas.addEventListener("pointerleave", () => {
  vectorArrows.setPointer(null, camera, canvas);
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
  const physicsT = transportUToPhysicsT(u, physicsDurationS);
  const prelaunch = physicsT < 0;
  const frame = cache.sampleAtProgress(
    physicsTToSampleU(physicsT, physicsDurationS),
  );
  if (prelaunch) {
    const pad = starbasePadState(physicsT, epoch);
    craftPos.set(pad.pos.x, pad.pos.y, pad.pos.z);
    craftVel.set(pad.vel.x, pad.vel.y, pad.vel.z);
  } else {
    craftPos.set(frame.pos.x, frame.pos.y, frame.pos.z);
    craftVel.set(frame.vel.x, frame.vel.y, frame.vel.z);
  }

  const simT = prelaunch ? physicsT : frame.t;
  const b = bodyPositions(simT, epoch);
  _earthPos.set(b.earth.x, b.earth.y, b.earth.z);
  _earthVel.set(b.earthVel.x, b.earthVel.y, b.earthVel.z);

  // Never draw the craft under Earth's surface (ascent / low Earth orbit numerical dips)
  if (shouldClampAboveEarth(frame.phase)) {
    const lifted = clampCraftAboveEarth(
      craftPos,
      b.earth,
      R_EARTH + 0.05,
    );
    craftPos.set(lifted.x, lifted.y, lifted.z);
  }

  craft.position.copy(craftPos);
  const showBurning = prelaunch ? false : frame.burning;
  const showThrustN = prelaunch ? 0 : frame.thrustN;
  // Use surface-relative attitude through early cislunar; pure inertial beyond
  const useSurfaceAttitude = attitudeNearEarth(
    frame.phase,
    prelaunch ? 0.01 : frame.altEarth,
  );
  orientCraft(craftVel, _earthPos, _earthVel, useSurfaceAttitude);

  updateCraftVisuals(craft, {
    staged: prelaunch ? false : frame.staged,
    burning: showBurning,
    thrustN: showThrustN,
    missionT: Math.max(0, physicsT),
    stageT,
    altEarth: prelaunch ? 0.01 : frame.altEarth,
    phase: prelaunch ? "launch" : frame.phase,
  });
  // LOI visual beat: brighten trail while approach burn is live (scrub-safe)
  {
    const trailMat = (craftTrail as Line2).material as LineMaterial;
    const style = craftTrailStyle(prelaunch, frame.phase, frame.burning);
    trailMat.linewidth = style.linewidth;
    trailMat.opacity = style.opacity;
  }
  // Sun elevation at Starbase (for night floodlights / day fill)
  starbasePad.getWorldPosition(_padWorld);
  const sunElev = sunElevAtPad(b.sun, b.earth, _padWorld);
  updateStarbaseLaunchFx(starbasePad, {
    // Negative during T− hold so vent steam / pad ops stay live
    missionT: physicsT,
    phase: prelaunch ? "launch" : frame.phase,
    burning: showBurning,
    altEarth: prelaunch ? 0.01 : frame.altEarth,
    sunElev,
  });
  stagingFx.update(Math.max(0, physicsT), craftPos, craft.quaternion, camera);
  landingFx.update(Math.max(0, physicsT), craftPos, {
    phase: frame.phase,
    burning: showBurning,
    altMoon: frame.altMoon,
  });
  updateBodies(simT, bodies, epoch);
  // Osculating Earth–Moon ring — same epoch as bodies so the Moon sits on it
  if (orbitsVisible) updateMoonRelativeOrbit(moonRelOrbit, simT, epoch);

  // Unit-scale sun + soft anti-sun fill + Earthshine on the Moon
  const sunUnit = applySunLight(sunLight, b.sun, b.earth, _skySun);
  applyFillLight(fillLight, sunUnit, b.earth);
  applyEarthshine(earthshine, b.earth, b.moon);
  // Cache for ground-sky update after the camera moves this frame
  _skyEarth.copy(_earthPos);

  updateLocatorVisibility(locator, camera, craftPos, {
    sizeKm: craftLengthKm(frame.staged),
  });
  // Earth green / Moon light-blue dots when the real disc is too small
  updateLocatorVisibility(bodies.earthLocator, camera, _earthPos, {
    sizeKm: R_EARTH * 2,
  });
  _moonPosV.set(b.moon.x, b.moon.y, b.moon.z);
  updateLocatorVisibility(bodies.moonLocator, camera, _moonPosV, {
    sizeKm: R_MOON * 2,
  });

  // Guided phase cameras (Auto-cam) — only on phase / staging edges
  const autoCut = nextAutoCamCut(
    autoCam.enabled,
    frame.phase,
    frame.staged,
    { phase: autoCam.phase, staged: autoCam.staged },
  );
  autoCam.phase = autoCut.phase;
  autoCam.staged = autoCut.staged;
  if (autoCut.suggestion) {
    const s = autoCut.suggestion;
    director.easeToMode(s.mode, {
      frame: s.frame,
      frameScale: s.frameScale,
    });
    notifyAutoCamera(s.mode);
  }

  // Altitude: Earth during launch/ low Earth orbit/ translunar injection/coast (far from Moon); else Moon
  const altitude = telemetryAltitudeKm(
    frame.phase,
    frame.distMoon,
    frame.altEarth,
    frame.altMoon,
  );

  // Relative speeds for metrics (M) — barycentric inertial sample minus body vel
  const speedEarth = relativeSpeedKmS(craftVel, b.earthVel);
  const speedMoon = relativeSpeedKmS(craftVel, b.moonVel);

  // Craft nose (+Z) in world for thrust-direction accel arrow
  _craftHeading.set(0, 0, 1).applyQuaternion(craft.quaternion);
  _earthVelV.set(b.earthVel.x, b.earthVel.y, b.earthVel.z);
  _moonPosV.set(b.moon.x, b.moon.y, b.moon.z);
  _moonVelV.set(b.moonVel.x, b.moonVel.y, b.moonVel.z);
  vectorArrows.update(
    {
      pos: craftPos,
      vel: craftVel,
      heading: _craftHeading,
      t: frame.t,
      thrustN: frame.thrustN,
      burning: frame.burning,
      staged: frame.staged,
      fuelBooster: frame.fuelBooster,
      fuelShip: frame.fuelShip,
    },
    {
      earth: _earthPos,
      earthVel: _earthVelV,
      moon: _moonPosV,
      moonVel: _moonVelV,
    },
    camera,
  );

  // Terminal beat: classify complete, hold 1× + settle camera, delay card
  const completeRaw =
    frame.phase === "landed" ||
    frame.phase === "impact" ||
    (u >= 0.999 && frame.phase === "coast");
  const beatKind = classifyLandingBeat(frame.phase, completeRaw);
  const nowMs = performance.now();

  if (!completeRaw) {
    landingBeat.kind = null;
    landingBeat.holdStartMs = null;
    landingBeat.settled = false;
    landingBeat.wasComplete = false;
  } else {
    if (!landingBeat.wasComplete) {
      // Rising edge of mission complete
      landingBeat.kind = beatKind;
      landingBeat.settled = false;
      if (clock.playing) {
        landingBeat.holdStartMs = nowMs;
      } else {
        // Scrub / paused at end — show card immediately
        landingBeat.holdStartMs = null;
      }
    }
    landingBeat.wasComplete = true;
    landingBeat.kind = beatKind;

    // One-shot: pin 1× and settle camera while the hold runs
    if (clock.playing && !landingBeat.settled && beatKind) {
      landingBeat.settled = true;
      if (Math.abs(clock.speed) > 1 + 1e-9) {
        clock.setSpeed(1);
      }
      const mode = landingBeatCameraMode(beatKind);
      autoCam.phase = frame.phase;
      autoCam.staged = frame.staged;
      director.easeToMode(mode, { frame: true });
      notifyAutoCamera(mode);
    }
  }

  const showCompleteCard =
    completeRaw &&
    (landingBeat.holdStartMs == null ||
      landingBeatCardReady((nowMs - landingBeat.holdStartMs) / 1000));

  hud.update({
    phase: prelaunch ? "Countdown" : frame.phaseLabel,
    phaseId: prelaunch ? "launch" : frame.phase,
    t: physicsT,
    durationS: transportS,
    distanceToMoon: Math.max(0, frame.distMoon - R_MOON),
    altitude: prelaunch ? 0.01 : altitude,
    speed: prelaunch ? 0 : frame.speed,
    fuelBooster: frame.fuelBooster,
    fuelShip: frame.fuelShip,
    thrustN: showThrustN,
    playing: clock.playing,
    dateUtc: formatMissionDateUtc(physicsT, cache.horizonsLandingT, epoch.clockUtcMsAtT0),
    playbackSpeed: clock.speed,
    missionComplete: showCompleteCard,
    completeKind: landingBeat.kind,
    translunarInjectionDeltaV: cache.translunarInjectionDeltaV,
    minMoonAlt: cache.minMoonAlt,
    peakSpeedKmS: cache.peakSpeedKmS,
    stageT: cache.stageT,
    keplerRefMaxDevKm: cache.keplerRefMaxDevKm,
    focusDistance: director.getFocusDistance(),
    altEarth: prelaunch ? 0.01 : frame.altEarth,
    altMoon: frame.altMoon,
    distMoon: frame.distMoon,
    speedEarth: prelaunch ? 0 : speedEarth,
    speedMoon,
    staged: prelaunch ? false : frame.staged,
    burning: showBurning,
  });

  // Auto-pause at end after the landing-beat hold (card may then steal focus)
  if (u >= 1 && clock.playing && showCompleteCard) {
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
// Pad opening was built at t=0 in the director ctor; transport u=0 is T−2:00.
{
  const openT = transportUToPhysicsT(0, physicsDurationS);
  director.snapPadOpening(openT);
}

function frame(): void {
  requestAnimationFrame(frame);
  resize();

  const dt = Math.min(wall.getDelta(), 0.05);
  clock.tick(dt, transportS);
  applyMissionState(clock.t);

  pulsePadBeacon(starbasePad, wall.elapsedTime);
  spinBodies(bodies, dt);
  // Keep prelaunch t < 0 so starbase tracking matches the pad-held stack.
  const simT = transportUToPhysicsT(clock.t, physicsDurationS);
  director.update(dt, simT, craftPos, craftVel);
  updateZoomLabels(scene, camera);

  // Pad / low-altitude sky (fades out once the camera leaves the atmosphere)
  updateGroundSky(groundSky, camera, _skyEarth, _skySun);

  renderer.render(scene, camera);
}

frame();
}

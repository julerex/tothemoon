import * as THREE from "three";
import { MissionClock } from "../mission/clock";
import {
  computeFlight13Trajectory,
  loadFlight13Trajectory,
  sampleAtProgress,
  type Trajectory,
} from "../physics/trajectoryCache";
import { bodyPositions } from "../physics/bodies";
import { R_EARTH, R_MOON } from "../physics/constants";
import {
  EARTH_SPIN_RATE,
  earthNorthPole,
  geodeticToMeshLocal,
  meshLocalToInertial,
  starbasePadState,
} from "../physics/earthFrame";
import { formatMissionDateUtc } from "../physics/epoch";
import { applyFlight13Epoch } from "../physics/flight13Epoch";
import {
  compareFlight13ToEarthOnly,
  formatForceCompareLine,
} from "../physics/flight13ForceCompare";
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
// Flight 13 reuses Moon path for scale context; no coast corridor overlay.
import { createBodies, spinBodies, updateBodies } from "../scene/bodies";
import {
  CRAFT_MESH_SCALE,
  createCraft,
  craftLengthKm,
  updateCraftVisuals,
  updateLocatorVisibility,
} from "../scene/craft";
import { updateFatLineResolutions } from "../scene/fatLines";
import { meshLocalTrailFromSamples } from "../physics/earthTrail";
import { createTrailFromPoints } from "../scene/trail";
import { StagingFx, findStageEvent } from "../scene/stagingFx";
import { EntryFx } from "../scene/entryFx";
import { SplashFx } from "../scene/splashFx";
import {
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
} from "../physics/flight13Mission";
import {
  entryPlasmaStrength,
  landingEngineCount,
  landingFlipBlend,
  shipAttitudeMode,
} from "../physics/flight13Attitude";
import {
  createAscentGroundTrack,
  createStarbasePad,
  pulsePadBeacon,
  updateStarbaseLaunchFx,
} from "../scene/earthTheater";
import { createGroundSky, updateGroundSky } from "../scene/groundSky";
import {
  atmosphereBrownout,
  cameraAltitudeEarthKm,
  createCinemaComposer,
  enableSunShadows,
  markShadowMeshes,
  renderCinema,
  resizeCinema,
  updateSunShadowFocus,
} from "../scene/cinema";
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
  clampCraftAboveEarth,
  sunElevAtPad,
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
import { nudgePlaybackSpeed } from "../ui/hudFormat";
import { setTheaterVisible } from "../app/shell";

/**
 * Starship Flight 13 full mission theater (baked suborbital profile).
 * Call once after the user picks this mission from the menu shell.
 */
export function startFlight13Theater(): void {
const canvasEl = document.querySelector<HTMLCanvasElement>("#c");
if (!canvasEl) throw new Error("Canvas #c not found");
const canvas = canvasEl;

setTheaterVisible(true);
document.title = "tothemoon — Starship Flight 13";

// Hide menus / briefing host
const menus = document.getElementById("menus");
if (menus) menus.hidden = true;
const briefing = document.getElementById("flight13-briefing");
if (briefing) briefing.hidden = true;

// HUD title for this mission
const h1 = document.querySelector(".hud-header h1");
if (h1) h1.textContent = "Starship Flight 13";
const sub = document.querySelector(".hud-header .subtitle");
if (sub) sub.textContent = "July 2026 · Starbase · flight test · true scale";
const mcSub = document.querySelector(".mc-sub");
if (mcSub) {
  mcSub.textContent = "Starbase → Indian Ocean splashdown · Flight 13";
}

// Trajectory baked at build time (scripts/precompute-flight13.ts).
const recompute =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("recompute");
if (recompute) {
  const phaseBoot = document.querySelector("#phase");
  if (phaseBoot) phaseBoot.textContent = "Recomputing Flight 13…";
}
const cache: Trajectory = recompute
  ? computeFlight13Trajectory()
  : loadFlight13Trajectory();
// Explicit Flight 13 epoch (liftoff UTC + analytic Earth/Sun)
const { epoch, sunPhase0: sun0, padSunElev } = applyFlight13Epoch(
  cache.moonPhase0,
  cache.horizonsLandingT,
);
console.info(
  `[flight13] Launch theater · duration ${(cache.durationS / 60).toFixed(1)} min · ` +
    `stageT=${cache.stageT?.toFixed(0) ?? "—"}s · peak |v|=${cache.peakSpeedKmS.toFixed(2)} km/s · ` +
    `daytime pad sin(el)=${padSunElev.toFixed(3)} · sunPhase0=${sun0.toFixed(4)}` +
    (hasHorizonsEpoch() ? ` · ephemeris=${horizonsSource()}` : " · analytic Earth/Sun"),
);

// Earth-only re-integration vs baked n-body pack (Metrics force-check row).
// One extra Flight 13 integrate at open — keeps the HUD honest without a bake field.
const forceCompare = compareFlight13ToEarthOnly(cache.samples, {
  durationS: cache.durationS,
  stageT: cache.stageT,
});
const forceCompareLine = formatForceCompareLine(forceCompare);
console.info(
  `[flight13] Force check · coast max |Δr|=${forceCompare.coastMaxPosDevKm.toFixed(2)} km · ` +
    `full max |Δr|=${forceCompare.maxPosDevKm.toFixed(1)} km · ` +
    `max |Δv|=${forceCompare.maxVelDevKmS.toFixed(3)} km/s`,
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
// Slightly brighter for stainless stack + afternoon pad (day launch);
// V5 cinemaExposure adapts per-frame from camera altitude.
renderer.toneMappingExposure = 1.2;

const camera = new THREE.PerspectiveCamera(50, 1, 1, 2_000_000);
const director = new CameraDirector(camera, canvas);
director.setEpoch(epoch);

const { scene, sunLight, fillLight, earthshine, orbitGroup } = createScene();
// V5: soft sun shadows for pad + craft
enableSunShadows(renderer, sunLight);
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
markShadowMeshes(starbasePad, { cast: true, receive: true });
const groundTrack = createAscentGroundTrack(cache.samples, epoch);
if (groundTrack) bodies.earth.add(groundTrack);

// Earth-centric craft trail: mesh-local under the spinning globe so it
// co-rotates with the surface and revolves with Earth (not heliocentric).
const trailPts = meshLocalTrailFromSamples(cache.samples, 1500, epoch);
const craftTrail = createTrailFromPoints(trailPts);
bodies.earth.add(craftTrail);

// Moon path still visible for context (no Kepler corridor on suborbital flight)
const moonPathSim = createMoonPathThroughSim(cache.durationS, 640, epoch);
orbitGroup.add(moonPathSim);
const moonRelOrbit = createMoonRelativeOrbit(0, epoch);
bodies.earthGroup.add(moonRelOrbit);

/** Extra orbit overlays not parented under orbitGroup (Earth-fixed trail/track, v/a, Moon ring). */
const orbitExtras: THREE.Object3D[] = [moonRelOrbit, craftTrail];
if (groundTrack) orbitExtras.push(groundTrack);

const { group: craft, locator } = createCraft();
scene.add(craft);
director.setCraft(craft);
markShadowMeshes(craft, { cast: true, receive: true });

// V5 cinema stack (mild bloom + exposure adaptation)
const cinema = createCinemaComposer(renderer, scene, camera);
/** Last frame flags for scrub-safe cinema (set in applyMissionState). */
const cinemaState = {
  burning: false,
  phase: "launch" as string,
  plasma: 0,
  altEarth: 0,
};

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
// Flight 13: Super Heavy soft-lands offshore in the Gulf of America
stagingFx.setStageEvent(stageEvent, "gulf");
const stageT = stageEvent?.t ?? null;
scene.add(stagingFx.group);
// Grid-fin cam follows the free-flyer after stage-out
director.setDetachedBooster(stagingFx.detachedBooster);
markShadowMeshes(stagingFx.group, { cast: true, receive: true });

// Indian Ocean splash site (Earth-fixed) + entry plasma on the craft
const splashFx = new SplashFx();
const lastSample = cache.samples[cache.samples.length - 1]!;
splashFx.setSplashTime(lastSample.t);
bodies.earth.add(splashFx.group);

const entryFx = new EntryFx();
craft.add(entryFx.group);

// Scratch for splash-site range (mesh-local → inertial)
const _splashMesh = { x: 0, y: 0, z: 0 };
const _splashWorld = { x: 0, y: 0, z: 0 };

const clock = new MissionClock();
const physicsDurationS = cache.durationS;
const transportS = transportDurationS(physicsDurationS);
const timeline = timelineWithPrelaunch(
  buildTimeline(cache.samples, physicsDurationS),
  physicsDurationS,
);
// Start at 1× real-time immediately (no Play click required)
clock.setSpeed(1);
clock.play();

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

const hud = bindHud(
  clock,
  timeline,
  {
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
      const frame = sampleAtProgress(cache, bm.u);
      autoCam.phase = frame.phase;
      autoCam.staged = frame.staged;
      director.easeToMode(bm.mode, {
        frame: bm.frame,
        frameScale: bm.frameScale,
      });
    },
  },
  cache.samples,
  "gulf",
);
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

/** Scratch for belly / engines-first basis. */
const _nose = new THREE.Vector3();
const _belly = new THREE.Vector3();
const _side = new THREE.Vector3();

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
 * Set craft basis from nose (+Z) and belly (+Y) world directions.
 * Mesh: +Z nose, +Y windward tiles, −Z engines.
 */
function applyCraftBasis(nose: THREE.Vector3, belly: THREE.Vector3): void {
  _nose.copy(nose).normalize();
  _belly.copy(belly).normalize();
  // x = y × z
  _side.crossVectors(_belly, _nose);
  if (_side.lengthSq() < 1e-12) {
    applyCraftHeading(_nose);
    return;
  }
  _side.normalize();
  // Re-orthogonalize belly = z × x
  _belly.crossVectors(_nose, _side).normalize();
  _look.makeBasis(_side, _belly, _nose);
  _quat.setFromRotationMatrix(_look);
  craft.quaternion.copy(_quat);
}

/**
 * Attitude for the stack:
 * - Pad / tower: local radial up
 * - Ascent / coast: air-relative prograde
 * - Entry: belly-flop (heat shield +Y into wind)
 * - Landing burn: engines-first after flip blend
 */
function orientCraft(
  vel: THREE.Vector3,
  earthPos: THREE.Vector3,
  earthVel: THREE.Vector3,
  nearEarth: boolean,
  missionT: number,
  phase: PhaseId,
  burning: boolean,
  altEarth: number,
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

  // v_air = v − v_earth − ω × r  (ground-relative)
  _spinVel.crossVectors(_omega, _localUp).multiplyScalar(r);
  _airVel.copy(vel).sub(earthVel).sub(_spinVel);

  const mode = shipAttitudeMode(missionT, phase, altEarth, burning);

  if (mode === "radial_up") {
    applyCraftHeading(_localUp);
    return;
  }

  if (
    _airVel.lengthSq() < AIR_VEL_ATTITUDE_MIN * AIR_VEL_ATTITUDE_MIN &&
    mode === "prograde"
  ) {
    applyCraftHeading(_localUp);
    return;
  }

  if (mode === "belly" || mode === "engines_first") {
    const speed = _airVel.length();
    if (speed < 1e-6) {
      applyCraftHeading(_localUp);
      return;
    }
    const flip = landingFlipBlend(missionT);
    // Belly pose: +Y (tiles) into air-relative velocity
    _belly.copy(_airVel).multiplyScalar(1 / speed);
    _nose.crossVectors(_localUp, _belly);
    if (_nose.lengthSq() < 1e-10) {
      _nose.set(0, 1, 0).cross(_belly);
    }
    _nose.normalize().addScaledVector(_localUp, 0.15).normalize();

    if (mode === "engines_first" || flip > 0.01) {
      // Engines-first: nose anti-velocity, belly roughly radial
      _side.copy(_airVel).multiplyScalar(-1 / speed); // target nose
      // blend nose/belly from belly-flop → engines-first
      const u = mode === "engines_first" ? Math.max(flip, 0.01) : flip;
      _nose.lerp(_side, u).normalize();
      _belly.lerp(_localUp, u).normalize();
    }
    applyCraftBasis(_nose, _belly);
    return;
  }

  // Prograde
  if (nearEarth) {
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
  // Transport u includes T−2:00 pre-liftoff; physics t=0 is liftoff
  const physicsT = transportUToPhysicsT(u, physicsDurationS);
  const prelaunch = physicsT < 0;
  const frame = sampleAtProgress(
    cache,
    physicsTToSampleU(physicsT, physicsDurationS),
  );
  if (prelaunch) {
    // Hold on the pad through countdown (Earth keeps spinning with wall clock)
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

  // Never draw the craft under Earth's surface (entire Flight 13 arc is near Earth)
  {
    const lifted = clampCraftAboveEarth(
      craftPos,
      b.earth,
      R_EARTH + 0.05,
    );
    craftPos.set(lifted.x, lifted.y, lifted.z);
  }

  craft.position.copy(craftPos);
  // Pre-liftoff: engines off on the pad
  const showBurning = prelaunch ? false : frame.burning;
  const showThrustN = prelaunch ? 0 : frame.thrustN;
  const displayPhase = prelaunch ? "launch" : frame.phase;
  const displayAltEarth = prelaunch ? 0.01 : frame.altEarth;
  cinemaState.burning = showBurning;
  cinemaState.phase = displayPhase;
  cinemaState.altEarth = displayAltEarth;

  // Flight 13 is always Earth-local for attitude
  const useSurfaceAttitude = true;
  orientCraft(
    craftVel,
    _earthPos,
    _earthVel,
    useSurfaceAttitude,
    Math.max(0, physicsT),
    displayPhase,
    showBurning,
    displayAltEarth,
  );

  const engCount = prelaunch ? 0 : landingEngineCount(frame.t);
  updateCraftVisuals(craft, {
    staged: prelaunch ? false : frame.staged,
    burning: showBurning,
    thrustN: showThrustN,
    missionT: Math.max(0, physicsT),
    stageT,
    altEarth: displayAltEarth,
    phase: displayPhase,
    shipEngineCount: engCount > 0 ? engCount : undefined,
  });
  // Sun elevation at Starbase (for night floodlights / day fill)
  starbasePad.getWorldPosition(_padWorld);
  const sunElev = sunElevAtPad(b.sun, b.earth, _padWorld);
  updateStarbaseLaunchFx(starbasePad, {
    // Negative during T− hold so vent steam / pad ops stay live
    missionT: physicsT,
    phase: displayPhase,
    burning: showBurning,
    altEarth: displayAltEarth,
    sunElev,
  });
  stagingFx.update(Math.max(0, physicsT), craftPos, craft.quaternion, camera);
  splashFx.update(Math.max(0, physicsT), craftPos, {
    phase: displayPhase,
    altEarth: displayAltEarth,
  });
  // Surface-relative speed for plasma
  const speedAir = Math.hypot(
    craftVel.x - b.earthVel.x,
    craftVel.y - b.earthVel.y,
    craftVel.z - b.earthVel.z,
  );
  entryFx.update(
    Math.max(0, physicsT),
    displayPhase,
    displayAltEarth,
    prelaunch ? 0 : speedAir,
  );
  cinemaState.plasma = prelaunch
    ? 0
    : entryPlasmaStrength(
        Math.max(0, physicsT),
        displayPhase as PhaseId,
        displayAltEarth,
        speedAir,
      );
  updateBodies(simT, bodies, epoch);
  // Osculating Earth–Moon ring — same epoch as bodies so the Moon sits on it
  if (orbitsVisible) updateMoonRelativeOrbit(moonRelOrbit, simT, epoch);

  // Unit-scale sun + soft anti-sun fill + Earthshine (pad stays sunlit by day)
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
  const phaseForCam = displayPhase as PhaseId;
  const stagedForCam = prelaunch ? false : frame.staged;
  const autoCut = nextAutoCamCut(
    autoCam.enabled,
    phaseForCam,
    stagedForCam,
    { phase: autoCam.phase, staged: autoCam.staged },
    "flight13",
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

  // Flight 13 is Earth-local — always show Earth altitude
  const altitude = displayAltEarth;

  // Distance to Indian Ocean splash site (surface) for the telemetry range slot
  geodeticToMeshLocal(
    FLIGHT13_SPLASH_LAT,
    FLIGHT13_SPLASH_LON,
    R_EARTH,
    _splashMesh,
  );
  meshLocalToInertial(_splashMesh, simT, _splashWorld);
  const distSplash = Math.hypot(
    craftPos.x - (b.earth.x + _splashWorld.x),
    craftPos.y - (b.earth.y + _splashWorld.y),
    craftPos.z - (b.earth.z + _splashWorld.z),
  );

  // Relative speeds for metrics (M) — barycentric inertial sample minus body vel
  const speedEarth = Math.hypot(
    craftVel.x - b.earthVel.x,
    craftVel.y - b.earthVel.y,
    craftVel.z - b.earthVel.z,
  );
  const speedMoon = Math.hypot(
    craftVel.x - b.moonVel.x,
    craftVel.y - b.moonVel.y,
    craftVel.z - b.moonVel.z,
  );

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
      t: Math.max(0, physicsT),
      thrustN: showThrustN,
      burning: showBurning,
      staged: stagedForCam,
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

  // Terminal beat: splashdown complete
  const completeRaw =
    frame.phase === "splashdown" ||
    frame.phase === "landed" ||
    u >= 0.999;
  const beatKind = classifyLandingBeat(
    frame.phase === "splashdown" ? "landed" : frame.phase,
    completeRaw,
  );
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
    phaseId: displayPhase as PhaseId,
    t: physicsT,
    durationS: transportS,
    distanceToMoon: Math.max(0, distSplash),
    altitude,
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
    altEarth: displayAltEarth,
    altMoon: frame.altMoon,
    distMoon: frame.distMoon,
    speedEarth: prelaunch ? 0 : speedEarth,
    speedMoon,
    staged: prelaunch ? false : frame.staged,
    burning: showBurning,
    forceCompareLine,
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
    resizeCinema(
      cinema,
      w,
      h,
      Math.min(window.devicePixelRatio || 1, 2),
    );
  }
}

const wall = new THREE.Clock();
applyMissionState(0);
// Pad opening was built at t=0 in the director ctor; transport u=0 is T−2:00.
// Snap so the camera tracks the same epoch as the stack on the pad.
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
  // Keep prelaunch t < 0 — pad / Earth move ~thousands of km in 2 min.
  const simT = transportUToPhysicsT(clock.t, physicsDurationS);
  director.update(dt, simT, craftPos, craftVel);
  updateZoomLabels(scene, camera);

  // Pad / low-altitude sky + V5 brownout / star fade / shadows / bloom
  const camAltKm = cameraAltitudeEarthKm(camera.position, _skyEarth);
  const brownout = atmosphereBrownout(
    cinemaState.phase,
    cinemaState.altEarth > 0 ? cinemaState.altEarth : camAltKm,
    cinemaState.plasma,
  );
  updateGroundSky(groundSky, camera, _skyEarth, _skySun, brownout);
  updateSunShadowFocus(sunLight, craftPos, _skySun, camAltKm);
  renderCinema(cinema, renderer, scene, {
    camAltKm,
    burning: cinemaState.burning,
    brownout,
  });
}

frame();
}

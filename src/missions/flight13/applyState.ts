/**
 * Per-frame mission state for Flight 13 theater.
 * Scene unit = 1 km.
 */

import { bodyPositions } from "../../physics/bodies";
import { EARTH_SURFACE_RADIUS_KM, R_EARTH, R_MOON, STARBASE_ALT } from "../../physics/constants";
import {
  geodeticToMeshLocal,
  meshLocalToInertial,
  starbasePadState,
} from "../../physics/earthFrame";
import { formatMissionDateUtc } from "../../physics/epoch";
import { boosterPhaseAt } from "../../physics/boosterRecovery";
import {
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
} from "../../physics/flight13Mission";
import {
  entryPlasmaStrength,
  entryVisualBank,
  landingEngineCount,
} from "../../physics/flight13Attitude";
import { sampleAtProgress } from "../../physics/trajectoryCache";
import type { PhaseId } from "../../physics/missionTypes";
import {
  physicsTToSampleU,
  transportUToPhysicsT,
} from "../../mission/prelaunch";
import { clampCraftAboveEarth, sunElevAtPad } from "../../mission/frameDerive";
import { stepLandingBeat } from "../../mission/landingBeatHold";
import { nextAutoCamCut, finaleChaseBias } from "../../camera/autoCam";
import {
  applyEarthshine,
  applyFillLight,
  applySunLight,
} from "../../scene/sunLight";
import {
  craftLengthKm,
  updateCraftVisuals,
  updateLocatorVisibility,
} from "../../scene/craft";
import { updateBodies } from "../../scene/bodies";
import { updateMoonRelativeOrbit } from "../../scene/createScene";
import { updateStarbaseLaunchFx, updateMechazillaRecovery } from "../../scene/earthTheater";
import { deriveChopstickPose } from "../../scene/padRecoveryFx";
import type { F13Ctx } from "./bootstrap";
import { orientCraft } from "./orientCraft";

type SampleFrame = ReturnType<typeof sampleAtProgress>;
type BodyState = ReturnType<typeof bodyPositions>;

function resolvePhysics(ctx: F13Ctx, u: number) {
  const physicsT = transportUToPhysicsT(u, ctx.physicsDurationS);
  const prelaunch = physicsT < 0;
  const frame = sampleAtProgress(
    ctx.cache,
    physicsTToSampleU(physicsT, ctx.physicsDurationS),
  );
  return { physicsT, prelaunch, frame };
}

function setCraftFromPad(ctx: F13Ctx, physicsT: number): void {
  const pad = starbasePadState(physicsT, ctx.epoch);
  ctx.craftPos.set(pad.pos.x, pad.pos.y, pad.pos.z);
  ctx.craftVel.set(pad.vel.x, pad.vel.y, pad.vel.z);
}

function setCraftFromFrame(ctx: F13Ctx, frame: SampleFrame): void {
  ctx.craftPos.set(frame.pos.x, frame.pos.y, frame.pos.z);
  ctx.craftVel.set(frame.vel.x, frame.vel.y, frame.vel.z);
}

function placeCraft(ctx: F13Ctx, prelaunch: boolean, physicsT: number, frame: SampleFrame): void {
  if (prelaunch) setCraftFromPad(ctx, physicsT);
  else setCraftFromFrame(ctx, frame);
}

function syncEarth(ctx: F13Ctx, simT: number): BodyState {
  const b = bodyPositions(simT, ctx.epoch);
  ctx.earthPos.set(b.earth.x, b.earth.y, b.earth.z);
  ctx.earthVel.set(b.earthVel.x, b.earthVel.y, b.earthVel.z);
  return b;
}

function clampCraft(ctx: F13Ctx, b: BodyState): void {
  const lifted = clampCraftAboveEarth(ctx.craftPos, b.earth, EARTH_SURFACE_RADIUS_KM);
  ctx.craftPos.set(lifted.x, lifted.y, lifted.z);
  ctx.craft.position.copy(ctx.craftPos);
}

function displayFields(prelaunch: boolean, frame: SampleFrame) {
  return {
    showBurning: prelaunch ? false : frame.burning,
    showThrustN: prelaunch ? 0 : frame.thrustN,
    displayPhase: (prelaunch ? "launch" : frame.phase) as PhaseId,
    displayAltEarth: prelaunch ? STARBASE_ALT : frame.altEarth,
    stagedForCam: prelaunch ? false : frame.staged,
  };
}

function writeCinema(
  ctx: F13Ctx,
  d: ReturnType<typeof displayFields>,
): void {
  ctx.cinemaState.burning = d.showBurning;
  ctx.cinemaState.phase = d.displayPhase;
  ctx.cinemaState.altEarth = d.displayAltEarth;
}

function applyAttitude(
  ctx: F13Ctx,
  physicsT: number,
  d: ReturnType<typeof displayFields>,
): void {
  orientCraft(
    ctx.orient, ctx.craftVel, ctx.earthPos, ctx.earthVel, true,
    Math.max(0, physicsT), d.displayPhase, d.showBurning, d.displayAltEarth,
  );
}

function craftVisualArgs(
  ctx: F13Ctx,
  physicsT: number,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  air: number,
) {
  const engCount = physicsT < 0 ? 0 : landingEngineCount(frame.t);
  const t = Math.max(0, physicsT);
  const plasma = physicsT < 0
    ? 0
    : entryPlasmaStrength(t, d.displayPhase, d.displayAltEarth, air);
  return {
    staged: d.stagedForCam, burning: d.showBurning, thrustN: d.showThrustN,
    missionT: t, stageT: ctx.stageT, altEarth: d.displayAltEarth,
    phase: d.displayPhase, shipEngineCount: engCount > 0 ? engCount : undefined,
    plasmaStrength: plasma,
  };
}

function updateCraftFx(
  ctx: F13Ctx,
  physicsT: number,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  air: number,
): void {
  updateCraftVisuals(ctx.craft, craftVisualArgs(ctx, physicsT, frame, d, air));
}

function updatePadFx(
  ctx: F13Ctx,
  physicsT: number,
  b: BodyState,
  d: ReturnType<typeof displayFields>,
): void {
  ctx.starbasePad.getWorldPosition(ctx.padWorld);
  const sunElev = sunElevAtPad(b.sun, b.earth, ctx.padWorld);
  updateStarbaseLaunchFx(ctx.starbasePad, {
    missionT: physicsT,
    phase: d.displayPhase,
    burning: d.showBurning,
    altEarth: d.displayAltEarth,
    sunElev,
  });
  updateMechazillaRecovery(ctx.starbasePad, deriveChopstickPose({
    age: ctx.stageT == null ? -1 : physicsT - ctx.stageT,
    profile: "gulf",
  }));
}

function updateStageSplash(
  ctx: F13Ctx,
  physicsT: number,
  d: ReturnType<typeof displayFields>,
): void {
  const t = Math.max(0, physicsT);
  ctx.stagingFx.update(t, ctx.craftPos, ctx.craft.quaternion, ctx.camera);
  ctx.splashFx.update(t, ctx.craftPos, {
    phase: d.displayPhase,
    altEarth: d.displayAltEarth,
  });
  ctx.gulfLandFx.update(t, ctx.craftPos, {
    recoveryPhase: ctx.stageT == null ? "sep" : boosterPhaseAt(t - ctx.stageT, "gulf"),
  });
}

function speedAir(ctx: F13Ctx, b: BodyState): number {
  return Math.hypot(
    ctx.craftVel.x - b.earthVel.x,
    ctx.craftVel.y - b.earthVel.y,
    ctx.craftVel.z - b.earthVel.z,
  );
}

function updateEntry(
  ctx: F13Ctx,
  physicsT: number,
  prelaunch: boolean,
  d: ReturnType<typeof displayFields>,
  air: number,
): void {
  const t = Math.max(0, physicsT);
  ctx.entryFx.update(
    t,
    d.displayPhase,
    d.displayAltEarth,
    prelaunch ? 0 : air,
    prelaunch ? 0 : entryVisualBank(ctx.orient.side, ctx.orient.airVel, ctx.orient.localUp),
  );
  ctx.cinemaState.plasma = prelaunch
    ? 0
    : entryPlasmaStrength(t, d.displayPhase, d.displayAltEarth, air);
}

function updateLights(ctx: F13Ctx, simT: number, b: BodyState): void {
  updateBodies(simT, ctx.bodies, ctx.epoch);
  if (ctx.flags.orbitsVisible) {
    updateMoonRelativeOrbit(ctx.moonRelOrbit, simT, ctx.epoch);
  }
  const sunUnit = applySunLight(ctx.sunLight, b.sun, b.earth, ctx.skySun);
  applyFillLight(ctx.fillLight, sunUnit, b.earth);
  applyEarthshine(ctx.earthshine, b.earth, b.moon);
  ctx.skyEarth.copy(ctx.earthPos);
}

function updateLocators(ctx: F13Ctx, frame: SampleFrame, b: BodyState): void {
  updateLocatorVisibility(ctx.locator, ctx.camera, ctx.craftPos, {
    sizeKm: craftLengthKm(frame.staged),
  });
  updateLocatorVisibility(ctx.bodies.earthLocator, ctx.camera, ctx.earthPos, {
    sizeKm: R_EARTH * 2,
  });
  updateMoonLocator(ctx, b);
}

function updateMoonLocator(ctx: F13Ctx, b: BodyState): void {
  ctx.moonPosV.set(b.moon.x, b.moon.y, b.moon.z);
  updateLocatorVisibility(ctx.bodies.moonLocator, ctx.camera, ctx.moonPosV, {
    sizeKm: R_MOON * 2,
  });
}

function easeAutoSuggestion(
  ctx: F13Ctx,
  s: { mode: Parameters<F13Ctx["notifyAutoCamera"]>[0]; frame: boolean; frameScale?: number },
): void {
  ctx.director.easeToMode(s.mode, { frame: s.frame, frameScale: s.frameScale });
  ctx.notifyAutoCamera(s.mode);
}

function applyAutoCam(
  ctx: F13Ctx,
  d: ReturnType<typeof displayFields>,
  b: BodyState,
): void {
  const autoCut = nextAutoCamCut(
    ctx.autoCam.enabled, d.displayPhase, d.stagedForCam,
    { phase: ctx.autoCam.phase, staged: ctx.autoCam.staged }, "flight13",
  );
  ctx.autoCam.phase = autoCut.phase;
  ctx.autoCam.staged = autoCut.staged;
  if (autoCut.suggestion) easeAutoSuggestion(ctx, autoCut.suggestion);
  const chaseOn = ctx.autoCam.enabled && ctx.director.getMode() === "chase";
  const bias = finaleChaseBias(chaseOn, "flight13", d.displayPhase);
  ctx.director.setChaseBias({
    ...bias,
    lookDownDir: {
      x: b.earth.x - ctx.craftPos.x,
      y: b.earth.y - ctx.craftPos.y,
      z: b.earth.z - ctx.craftPos.z,
    },
  });
}

function splashWorldPoint(ctx: F13Ctx, simT: number): void {
  geodeticToMeshLocal(
    FLIGHT13_SPLASH_LAT,
    FLIGHT13_SPLASH_LON,
    EARTH_SURFACE_RADIUS_KM,
    ctx.splashMesh,
  );
  meshLocalToInertial(ctx.splashMesh, simT, ctx.splashWorld);
}

function distToSplash(ctx: F13Ctx, simT: number, b: BodyState): number {
  splashWorldPoint(ctx, simT);
  const e = b.earth;
  const s = ctx.splashWorld;
  return Math.hypot(
    ctx.craftPos.x - (e.x + s.x),
    ctx.craftPos.y - (e.y + s.y),
    ctx.craftPos.z - (e.z + s.z),
  );
}

function relSpeed(
  vel: { x: number; y: number; z: number },
  bodyVel: { x: number; y: number; z: number },
): number {
  return Math.hypot(vel.x - bodyVel.x, vel.y - bodyVel.y, vel.z - bodyVel.z);
}

function relativeSpeeds(ctx: F13Ctx, b: BodyState) {
  return {
    speedEarth: relSpeed(ctx.craftVel, b.earthVel),
    speedMoon: relSpeed(ctx.craftVel, b.moonVel),
  };
}

function bodyArrowState(ctx: F13Ctx, b: BodyState) {
  ctx.earthVelV.set(b.earthVel.x, b.earthVel.y, b.earthVel.z);
  ctx.moonPosV.set(b.moon.x, b.moon.y, b.moon.z);
  ctx.moonVelV.set(b.moonVel.x, b.moonVel.y, b.moonVel.z);
  return {
    earth: ctx.earthPos,
    earthVel: ctx.earthVelV,
    moon: ctx.moonPosV,
    moonVel: ctx.moonVelV,
  };
}

function craftArrowState(
  ctx: F13Ctx,
  physicsT: number,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
) {
  ctx.craftHeading.set(0, 0, 1).applyQuaternion(ctx.craft.quaternion);
  return {
    pos: ctx.craftPos, vel: ctx.craftVel, heading: ctx.craftHeading,
    t: Math.max(0, physicsT), thrustN: d.showThrustN, burning: d.showBurning,
    staged: d.stagedForCam, fuelBooster: frame.fuelBooster, fuelShip: frame.fuelShip,
  };
}

function updateVectors(
  ctx: F13Ctx,
  physicsT: number,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  b: BodyState,
): void {
  ctx.vectorArrows.update(
    craftArrowState(ctx, physicsT, frame, d),
    bodyArrowState(ctx, b),
    ctx.camera,
  );
}

function completeRaw(frame: SampleFrame, u: number): boolean {
  return (
    frame.phase === "splashdown" ||
    frame.phase === "landed" ||
    u >= 0.999
  );
}

function setAutoCamPhase(ctx: F13Ctx, phase: PhaseId, staged: boolean): void {
  ctx.autoCam.phase = phase;
  ctx.autoCam.staged = staged;
}

function landingBeatHooks(ctx: F13Ctx) {
  return {
    setSpeed: (rate: number) => ctx.clock.setSpeed(rate),
    setAutoCamPhase: (phase: PhaseId, staged: boolean) => setAutoCamPhase(ctx, phase, staged),
    easeToMode: ctx.director.easeToMode.bind(ctx.director),
    notifyAutoCamera: ctx.notifyAutoCamera,
  };
}

function runLandingBeat(
  ctx: F13Ctx,
  frame: SampleFrame,
  u: number,
): boolean {
  return stepLandingBeat(ctx.landingBeat, {
    completeRaw: completeRaw(frame, u), phase: frame.phase,
    classifyPhase: frame.phase === "splashdown" ? "landed" : frame.phase,
    playing: ctx.clock.playing, nowMs: performance.now(),
    clockSpeed: ctx.clock.speed, staged: frame.staged, ...landingBeatHooks(ctx),
  });
}

function hudCore(
  ctx: F13Ctx,
  physicsT: number,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  distSplash: number,
) {
  return {
    phase: prelaunch ? "Countdown" : frame.phaseLabel, phaseId: d.displayPhase,
    t: physicsT, durationS: ctx.transportS, distanceToMoon: Math.max(0, distSplash),
    altitude: d.displayAltEarth, speed: prelaunch ? 0 : frame.speed,
    fuelBooster: frame.fuelBooster, fuelShip: frame.fuelShip, thrustN: d.showThrustN,
  };
}

function hudPlayback(
  ctx: F13Ctx,
  physicsT: number,
  showCompleteCard: boolean,
) {
  return {
    playing: ctx.clock.playing,
    dateUtc: formatMissionDateUtc(physicsT, ctx.cache.horizonsLandingT, ctx.epoch.clockUtcMsAtT0),
    playbackSpeed: ctx.clock.speed, missionComplete: showCompleteCard,
    completeKind: ctx.landingBeat.kind,
  };
}

function hudPackMeta(ctx: F13Ctx) {
  return {
    translunarInjectionDeltaV: ctx.cache.translunarInjectionDeltaV,
    minMoonAlt: ctx.cache.minMoonAlt,
    peakSpeedKmS: ctx.cache.peakSpeedKmS,
    stageT: ctx.cache.stageT,
    keplerRefMaxDevKm: ctx.cache.keplerRefMaxDevKm,
    focusDistance: ctx.director.getFocusDistance(),
    cameraMode: ctx.director.getMode(),
    forceCompareLine: ctx.forceCompareLine,
  };
}

function hudDetail(
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  speeds: ReturnType<typeof relativeSpeeds>,
) {
  return {
    altEarth: d.displayAltEarth,
    altMoon: frame.altMoon,
    distMoon: frame.distMoon,
    speedEarth: prelaunch ? 0 : speeds.speedEarth,
    speedMoon: speeds.speedMoon,
    staged: d.stagedForCam,
    burning: d.showBurning,
  };
}

function pushHud(
  ctx: F13Ctx,
  physicsT: number,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  distSplash: number,
  speeds: ReturnType<typeof relativeSpeeds>,
  showCompleteCard: boolean,
): void {
  ctx.hud.update({
    ...hudCore(ctx, physicsT, prelaunch, frame, d, distSplash),
    ...hudPlayback(ctx, physicsT, showCompleteCard),
    ...hudPackMeta(ctx),
    ...hudDetail(prelaunch, frame, d, speeds),
  });
}

function maybePauseAtEnd(
  ctx: F13Ctx,
  u: number,
  showCompleteCard: boolean,
): void {
  if (u >= 1 && ctx.clock.playing && showCompleteCard) ctx.clock.pause();
}

function updateFxStack(
  ctx: F13Ctx,
  physicsT: number,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  b: BodyState,
): void {
  applyAttitude(ctx, physicsT, d);
  const air = speedAir(ctx, b);
  updateCraftFx(ctx, physicsT, frame, d, air);
  updatePadFx(ctx, physicsT, b, d);
  updateStageSplash(ctx, physicsT, d);
  updateEntry(ctx, physicsT, prelaunch, d, air);
}

function updateSceneStack(
  ctx: F13Ctx,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  b: BodyState,
  simT: number,
): void {
  updateLights(ctx, simT, b);
  updateLocators(ctx, frame, b);
  applyAutoCam(ctx, d, b);
}

function poseCraft(ctx: F13Ctx, u: number) {
  const { physicsT, prelaunch, frame } = resolvePhysics(ctx, u);
  placeCraft(ctx, prelaunch, physicsT, frame);
  const simT = prelaunch ? physicsT : frame.t;
  const b = syncEarth(ctx, simT);
  clampCraft(ctx, b);
  return { physicsT, prelaunch, frame, simT, b };
}

function finishFrame(
  ctx: F13Ctx,
  u: number,
  physicsT: number,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  b: BodyState,
  simT: number,
): void {
  updateVectors(ctx, physicsT, frame, d, b);
  const show = runLandingBeat(ctx, frame, u);
  const splash = distToSplash(ctx, simT, b);
  const speeds = relativeSpeeds(ctx, b);
  pushHud(ctx, physicsT, prelaunch, frame, d, splash, speeds, show);
  maybePauseAtEnd(ctx, u, show);
}

/** Apply transport progress u ∈ [0,1] to craft, FX, camera cues, and HUD. */
export function applyMissionState(ctx: F13Ctx, u: number): void {
  const { physicsT, prelaunch, frame, simT, b } = poseCraft(ctx, u);
  const d = displayFields(prelaunch, frame);
  writeCinema(ctx, d);
  updateFxStack(ctx, physicsT, prelaunch, frame, d, b);
  updateSceneStack(ctx, frame, d, b, simT);
  finishFrame(ctx, u, physicsT, prelaunch, frame, d, b, simT);
}

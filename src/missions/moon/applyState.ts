/**
 * Per-frame mission state for Starbase → Moon theater.
 * Scene unit = 1 km.
 */

import type { Line2 } from "three/addons/lines/Line2.js";
import type { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { bodyPositions } from "../../physics/bodies";
import { EARTH_SURFACE_RADIUS_KM, R_EARTH, R_MOON, STARBASE_ALT } from "../../physics/constants";
import { starbasePadState } from "../../physics/earthFrame";
import {
  formatMissionDateAustralia,
  formatMissionDateTexas,
  formatMissionDateUtc,
} from "../../physics/epoch";
import { sampleAtProgress } from "../../physics/trajectoryCache";
import {
  physicsTToSampleU,
  transportUToPhysicsT,
} from "../../mission/prelaunch";
import {
  attitudeNearEarth,
  clampCraftAboveEarth,
  craftTrailStyle,
  relativeSpeedKmS,
  shouldClampAboveEarth,
  sunElevAtPad,
  telemetryAltitudeKm,
} from "../../mission/frameDerive";
import { stepLandingBeat } from "../../mission/landingBeatHold";
import { applyLandingBeatEffects } from "../theaterHandlers";
import { nextAutoCamCut, lunarFinaleChaseScale, lunarFinaleShouldCut, finaleChaseBias } from "../../camera/autoCam";
import {
  applyEarthshine,
  applyFillLight,
  applySunLight,
} from "../../scene/sunLight";
import {
  updateCraftVisuals,
  updateLocatorVisibility,
} from "../../scene/craft";
import { updateBodies } from "../../scene/bodies";
import { updateMoonRelativeOrbit } from "../../scene/createScene";
import { updateCoastBeatsOverlay } from "../../scene/coastCorridor";
import { updateStarbaseLaunchFx, updateMechazillaRecovery } from "../../scene/earthTheater";
import { deriveChopstickPose } from "../../scene/padRecoveryFx";
import type { MoonCtx } from "./bootstrap";
import { orientCraft } from "./orientCraft";

type SampleFrame = ReturnType<typeof sampleAtProgress>;
type BodyState = ReturnType<typeof bodyPositions>;

function resolvePhysics(ctx: MoonCtx, u: number) {
  const physicsT = transportUToPhysicsT(u, ctx.physicsDurationS);
  const prelaunch = physicsT < 0;
  const frame = sampleAtProgress(
    ctx.cache,
    physicsTToSampleU(physicsT, ctx.physicsDurationS),
  );
  return { physicsT, prelaunch, frame };
}

function placeCraft(
  ctx: MoonCtx,
  prelaunch: boolean,
  physicsT: number,
  frame: SampleFrame,
): void {
  if (prelaunch) {
    const pad = starbasePadState(physicsT, ctx.epoch);
    ctx.craftPos.set(pad.pos.x, pad.pos.y, pad.pos.z);
    ctx.craftVel.set(pad.vel.x, pad.vel.y, pad.vel.z);
    return;
  }
  ctx.craftPos.set(frame.pos.x, frame.pos.y, frame.pos.z);
  ctx.craftVel.set(frame.vel.x, frame.vel.y, frame.vel.z);
}

function syncEarth(ctx: MoonCtx, simT: number): BodyState {
  const b = bodyPositions(simT, ctx.epoch);
  ctx.earthPos.set(b.earth.x, b.earth.y, b.earth.z);
  ctx.earthVel.set(b.earthVel.x, b.earthVel.y, b.earthVel.z);
  return b;
}

function maybeClamp(ctx: MoonCtx, frame: SampleFrame, b: BodyState): void {
  if (!shouldClampAboveEarth(frame.phase)) return;
  const lifted = clampCraftAboveEarth(ctx.craftPos, b.earth, EARTH_SURFACE_RADIUS_KM);
  ctx.craftPos.set(lifted.x, lifted.y, lifted.z);
}

function displayFields(prelaunch: boolean, frame: SampleFrame) {
  return {
    showBurning: prelaunch ? false : frame.burning,
    showThrustN: prelaunch ? 0 : frame.thrustN,
    displayPhase: prelaunch ? "launch" : frame.phase,
    displayAltEarth: prelaunch ? STARBASE_ALT : frame.altEarth,
    staged: prelaunch ? false : frame.staged,
  };
}

function writeCinema(ctx: MoonCtx, d: ReturnType<typeof displayFields>): void {
  ctx.cinemaState.burning = d.showBurning;
  ctx.cinemaState.phase = d.displayPhase;
}

function applyAttitude(
  ctx: MoonCtx,
  prelaunch: boolean,
  frame: SampleFrame,
): void {
  const useSurface = attitudeNearEarth(
    frame.phase,
    prelaunch ? STARBASE_ALT : frame.altEarth,
  );
  orientCraft(ctx.orient, ctx.craftVel, ctx.earthPos, ctx.earthVel, useSurface);
}

function updateCraftFx(
  ctx: MoonCtx,
  physicsT: number,
  d: ReturnType<typeof displayFields>,
): void {
  updateCraftVisuals(ctx.craft, {
    staged: d.staged,
    burning: d.showBurning,
    thrustN: d.showThrustN,
    missionT: Math.max(0, physicsT),
    stageT: ctx.stageT,
    altEarth: d.displayAltEarth,
    phase: d.displayPhase,
  });
}

function updateTrail(ctx: MoonCtx, prelaunch: boolean, frame: SampleFrame): void {
  const trailMat = (ctx.craftTrail as Line2).material as LineMaterial;
  const style = craftTrailStyle(prelaunch, frame.phase, frame.burning);
  trailMat.linewidth = style.linewidth;
  trailMat.opacity = style.opacity;
}

function updatePadFx(
  ctx: MoonCtx,
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
    profile: "chopsticks",
  }));
}

function updateLandingFx(
  ctx: MoonCtx,
  physicsT: number,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
): void {
  const t = Math.max(0, physicsT);
  ctx.stagingFx.update(t, ctx.craftPos, ctx.craft.quaternion, ctx.camera);
  ctx.landingFx.update(t, ctx.craftPos, {
    phase: frame.phase,
    burning: d.showBurning,
    altMoon: frame.altMoon,
  });
}

function updateLights(ctx: MoonCtx, simT: number, b: BodyState): void {
  updateBodies(simT, ctx.bodies, ctx.epoch);
  if (ctx.flags.orbitsVisible) {
    updateMoonRelativeOrbit(ctx.moonRelOrbit, simT, ctx.epoch);
    const beats = ctx.orbitGroup.getObjectByName("coast-beats");
    if (beats) {
      updateCoastBeatsOverlay(beats, b.earth, b.moon, b.sun, ctx.craftPos);
    }
  }
  const sunUnit = applySunLight(ctx.sunLight, b.sun, b.earth, ctx.skySun);
  applyFillLight(ctx.fillLight, sunUnit, b.earth);
  applyEarthshine(ctx.earthshine, b.earth, b.moon);
  ctx.skyEarth.copy(ctx.earthPos);
}

function updateMoonLocator(ctx: MoonCtx, b: BodyState): void {
  ctx.moonPosV.set(b.moon.x, b.moon.y, b.moon.z);
  updateLocatorVisibility(ctx.bodies.moonLocator, ctx.camera, ctx.moonPosV, {
    sizeKm: R_MOON * 2,
  });
}

function updateLocators(ctx: MoonCtx, b: BodyState): void {
  updateLocatorVisibility(ctx.bodies.earthLocator, ctx.camera, ctx.earthPos, {
    sizeKm: R_EARTH * 2,
  });
  updateMoonLocator(ctx, b);
}

function easeAutoSuggestion(
  ctx: MoonCtx,
  s: { mode: Parameters<MoonCtx["notifyAutoCamera"]>[0]; frame: boolean; frameScale?: number },
): void {
  ctx.director.easeToMode(s.mode, { frame: s.frame, frameScale: s.frameScale });
  ctx.notifyAutoCamera(s.mode);
}

function applyAutoCam(ctx: MoonCtx, frame: SampleFrame, b: BodyState): void {
  const autoCut = nextAutoCamCut(
    ctx.autoCam.enabled,
    frame.phase,
    frame.staged,
    { phase: ctx.autoCam.phase, staged: ctx.autoCam.staged },
  );
  ctx.autoCam.phase = autoCut.phase;
  ctx.autoCam.staged = autoCut.staged;
  if (autoCut.suggestion) easeAutoSuggestion(ctx, autoCut.suggestion);
  maybeLunarFinaleChase(ctx, frame);
  applyFinaleChaseBias(ctx, frame.phase, b);
}

function maybeLunarFinaleChase(ctx: MoonCtx, frame: SampleFrame): void {
  const last = ctx.cache.samples[ctx.cache.samples.length - 1];
  if (!last || frame.phase !== "descent") {
    ctx.autoCam.finaleNudged = false;
    return;
  }
  const timeToLand = last.t - frame.t;
  if (!lunarFinaleShouldCut(ctx.autoCam.enabled, frame.phase, timeToLand, ctx.autoCam.finaleNudged)) {
    return;
  }
  const scale = lunarFinaleChaseScale(timeToLand);
  if (scale == null) return;
  ctx.autoCam.finaleNudged = true;
  easeAutoSuggestion(ctx, { mode: "chase", frame: true, frameScale: scale });
}

function applyFinaleChaseBias(ctx: MoonCtx, phase: SampleFrame["phase"], b: BodyState): void {
  const chaseOn = ctx.autoCam.enabled && ctx.director.getMode() === "chase";
  const bias = finaleChaseBias(chaseOn, "lunar", phase);
  ctx.director.setChaseBias({
    ...bias,
    lookDownDir: {
      x: b.moon.x - ctx.craftPos.x,
      y: b.moon.y - ctx.craftPos.y,
      z: b.moon.z - ctx.craftPos.z,
    },
  });
}

function craftArrowState(ctx: MoonCtx, frame: SampleFrame) {
  ctx.craftHeading.set(0, 0, 1).applyQuaternion(ctx.craft.quaternion);
  return {
    pos: ctx.craftPos, vel: ctx.craftVel, heading: ctx.craftHeading, t: frame.t,
    thrustN: frame.thrustN, burning: frame.burning, staged: frame.staged,
    fuelBooster: frame.fuelBooster, fuelShip: frame.fuelShip,
  };
}

function bodyArrowState(ctx: MoonCtx, b: BodyState) {
  ctx.earthVelV.set(b.earthVel.x, b.earthVel.y, b.earthVel.z);
  ctx.moonPosV.set(b.moon.x, b.moon.y, b.moon.z);
  ctx.moonVelV.set(b.moonVel.x, b.moonVel.y, b.moonVel.z);
  return { earth: ctx.earthPos, earthVel: ctx.earthVelV, moon: ctx.moonPosV, moonVel: ctx.moonVelV };
}

function updateVectors(
  ctx: MoonCtx,
  frame: SampleFrame,
  b: BodyState,
): void {
  ctx.vectorArrows.update(craftArrowState(ctx, frame), bodyArrowState(ctx, b), ctx.camera);
}

function completeRaw(frame: SampleFrame, u: number): boolean {
  return (
    frame.phase === "landed" ||
    frame.phase === "impact" ||
    (u >= 0.999 && frame.phase === "coast")
  );
}

function runLandingBeat(ctx: MoonCtx, frame: SampleFrame, u: number): boolean {
  const step = stepLandingBeat(ctx.landingBeat, {
    completeRaw: completeRaw(frame, u),
    phase: frame.phase,
    playing: ctx.clock.playing,
    nowMs: performance.now(),
    clockSpeed: ctx.clock.speed,
    staged: frame.staged,
  });
  ctx.landingBeat = step.state;
  applyLandingBeatEffects(step.effects, ctx);
  return step.showCompleteCard;
}

function hudCore(
  ctx: MoonCtx,
  physicsT: number,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  altitude: number,
) {
  return {
    phase: prelaunch ? "Countdown" : frame.phaseLabel,
    phaseId: prelaunch ? ("launch" as const) : frame.phase,
    t: physicsT, durationS: ctx.transportS,
    distanceToMoon: Math.max(0, frame.distMoon - R_MOON),
    altitude: prelaunch ? STARBASE_ALT : altitude, speed: prelaunch ? 0 : frame.speed,
    fuelBooster: frame.fuelBooster, fuelShip: frame.fuelShip, thrustN: d.showThrustN,
  };
}

function hudPlayback(ctx: MoonCtx, physicsT: number, showCompleteCard: boolean) {
  return {
    playing: ctx.clock.playing,
    dateUtc: formatMissionDateUtc(physicsT, ctx.cache.horizonsLandingT, ctx.epoch.clockUtcMsAtT0),
    dateTexas: formatMissionDateTexas(physicsT, ctx.cache.horizonsLandingT, ctx.epoch.clockUtcMsAtT0),
    dateAustralia: formatMissionDateAustralia(physicsT, ctx.cache.horizonsLandingT, ctx.epoch.clockUtcMsAtT0),
    playbackSpeed: ctx.clock.speed, missionComplete: showCompleteCard,
    completeKind: ctx.landingBeat.kind,
  };
}

function hudPackMeta(ctx: MoonCtx) {
  return {
    translunarInjectionDeltaV: ctx.cache.translunarInjectionDeltaV,
    minMoonAlt: ctx.cache.minMoonAlt, peakSpeedKmS: ctx.cache.peakSpeedKmS,
    stageT: ctx.cache.stageT, keplerRefMaxDevKm: ctx.cache.keplerRefMaxDevKm,
    focusDistance: ctx.director.getFocusDistance(),
    cameraMode: ctx.director.getMode(),
  };
}

function hudDetail(
  ctx: MoonCtx,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  b: BodyState,
) {
  return {
    altEarth: d.displayAltEarth, altMoon: frame.altMoon, distMoon: frame.distMoon,
    speedEarth: prelaunch ? 0 : relativeSpeedKmS(ctx.craftVel, b.earthVel),
    speedMoon: relativeSpeedKmS(ctx.craftVel, b.moonVel),
    staged: d.staged, burning: d.showBurning,
  };
}

function pushHud(
  ctx: MoonCtx,
  physicsT: number,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  b: BodyState,
  showCompleteCard: boolean,
): void {
  const altitude = telemetryAltitudeKm(frame.phase, frame.distMoon, frame.altEarth, frame.altMoon);
  ctx.hud.update({
    ...hudCore(ctx, physicsT, prelaunch, frame, d, altitude),
    ...hudPlayback(ctx, physicsT, showCompleteCard),
    ...hudPackMeta(ctx),
    ...hudDetail(ctx, prelaunch, frame, d, b),
  });
}

function updateFxStack(
  ctx: MoonCtx,
  physicsT: number,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  b: BodyState,
): void {
  applyAttitude(ctx, prelaunch, frame);
  updateCraftFx(ctx, physicsT, d);
  updateTrail(ctx, prelaunch, frame);
  updatePadFx(ctx, physicsT, b, d);
  updateLandingFx(ctx, physicsT, frame, d);
}

function poseCraft(ctx: MoonCtx, u: number) {
  const { physicsT, prelaunch, frame } = resolvePhysics(ctx, u);
  placeCraft(ctx, prelaunch, physicsT, frame);
  const simT = prelaunch ? physicsT : frame.t;
  const b = syncEarth(ctx, simT);
  maybeClamp(ctx, frame, b);
  ctx.craft.position.copy(ctx.craftPos);
  return { physicsT, prelaunch, frame, simT, b };
}

function sceneAndHud(
  ctx: MoonCtx,
  u: number,
  physicsT: number,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  simT: number,
  b: BodyState,
): void {
  updateLights(ctx, simT, b);
  updateLocators(ctx, b);
  applyAutoCam(ctx, frame, b);
  updateVectors(ctx, frame, b);
  const show = runLandingBeat(ctx, frame, u);
  pushHud(ctx, physicsT, prelaunch, frame, d, b, show);
  if (u >= 1 && ctx.clock.playing && show) ctx.clock.pause();
}

/** Apply transport progress u ∈ [0,1] to craft, FX, camera cues, and HUD. */
export function applyMissionState(ctx: MoonCtx, u: number): void {
  const { physicsT, prelaunch, frame, simT, b } = poseCraft(ctx, u);
  const d = displayFields(prelaunch, frame);
  writeCinema(ctx, d);
  updateFxStack(ctx, physicsT, prelaunch, frame, d, b);
  sceneAndHud(ctx, u, physicsT, prelaunch, frame, d, simT, b);
}

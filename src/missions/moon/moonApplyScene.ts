/** Moon scene + HUD. */

import type { bodyPositions } from "../../physics/bodies";
import { R_EARTH, R_MOON } from "../../physics/constants";
import type { sampleAtProgress } from "../../physics/trajectoryCache";
import {
  finaleChaseBias,
  lunarFinaleChaseScale,
  lunarFinaleShouldCut,
  nextAutoCamCut,
} from "../../camera/autoCam";
import {
  applyEarthshine,
  applyFillLight,
  applySunLight,
} from "../../scene/sunLight";
import { updateLocatorVisibility } from "../../scene/craft";
import { updateBodies } from "../../scene/bodies";
import { updateMoonRelativeOrbit } from "../../scene/createScene";
import { updateCoastBeatsOverlay } from "../../scene/coastCorridor";
import type { MoonCtx } from "./bootstrap";
import type { displayFields } from "./moonApplyCore";
import { pushHud, runLandingBeat } from "./moonApplyHud";

type SampleFrame = ReturnType<typeof sampleAtProgress>;
type BodyState = ReturnType<typeof bodyPositions>;

export function updateLights(ctx: MoonCtx, simT: number, b: BodyState): void {
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

export function updateMoonLocator(ctx: MoonCtx, b: BodyState): void {
  ctx.moonPosV.set(b.moon.x, b.moon.y, b.moon.z);
  updateLocatorVisibility(ctx.bodies.moonLocator, ctx.camera, ctx.moonPosV, {
    sizeKm: R_MOON * 2,
  });
}

export function updateLocators(ctx: MoonCtx, b: BodyState): void {
  updateLocatorVisibility(ctx.bodies.earthLocator, ctx.camera, ctx.earthPos, {
    sizeKm: R_EARTH * 2,
  });
  updateMoonLocator(ctx, b);
}

export function easeAutoSuggestion(
  ctx: MoonCtx,
  s: { mode: Parameters<MoonCtx["notifyAutoCamera"]>[0]; frame: boolean; frameScale?: number },
): void {
  ctx.director.easeToMode(s.mode, { frame: s.frame, frameScale: s.frameScale });
  ctx.notifyAutoCamera(s.mode);
}

export function applyAutoCam(ctx: MoonCtx, frame: SampleFrame, b: BodyState): void {
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

export function maybeLunarFinaleChase(ctx: MoonCtx, frame: SampleFrame): void {
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

export function applyFinaleChaseBias(
  ctx: MoonCtx,
  phase: SampleFrame["phase"],
  b: BodyState,
): void {
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

export function craftArrowState(ctx: MoonCtx, frame: SampleFrame) {
  ctx.craftHeading.set(0, 0, 1).applyQuaternion(ctx.craft.quaternion);
  return {
    pos: ctx.craftPos, vel: ctx.craftVel, heading: ctx.craftHeading, t: frame.t,
    thrustN: frame.thrustN, burning: frame.burning, staged: frame.staged,
    fuelBooster: frame.fuelBooster, fuelShip: frame.fuelShip,
  };
}

export function bodyArrowState(ctx: MoonCtx, b: BodyState) {
  ctx.earthVelV.set(b.earthVel.x, b.earthVel.y, b.earthVel.z);
  ctx.moonPosV.set(b.moon.x, b.moon.y, b.moon.z);
  ctx.moonVelV.set(b.moonVel.x, b.moonVel.y, b.moonVel.z);
  return { earth: ctx.earthPos, earthVel: ctx.earthVelV, moon: ctx.moonPosV, moonVel: ctx.moonVelV };
}

export function updateVectors(
  ctx: MoonCtx,
  frame: SampleFrame,
  b: BodyState,
): void {
  ctx.vectorArrows.update(craftArrowState(ctx, frame), bodyArrowState(ctx, b), ctx.camera);
}

export function sceneAndHud(
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

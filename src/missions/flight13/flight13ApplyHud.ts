/** F13 HUD builders. */

import type { sampleAtProgress } from "../../physics/trajectoryCache";
import {
  formatMissionDateAustralia,
  formatMissionDateTexas,
  formatMissionDateUtc,
} from "../../physics/epoch";
import { stepLandingBeat } from "../../mission/landingBeatHold";
import { applyLandingBeatEffects } from "../theaterHandlers";
import type { F13Ctx } from "./bootstrap";
import type { displayFields } from "./flight13ApplyCore";

type SampleFrame = ReturnType<typeof sampleAtProgress>;

export function completeRaw(frame: SampleFrame, u: number): boolean {
  // Splashdown is a long float hold (through T+1:10). Complete only at the end.
  return frame.phase === "landed" || u >= 0.999;
}

export function runLandingBeat(
  ctx: F13Ctx,
  frame: SampleFrame,
  u: number,
): boolean {
  const step = stepLandingBeat(ctx.landingBeat, {
    completeRaw: completeRaw(frame, u), phase: frame.phase,
    classifyPhase: frame.phase === "splashdown" ? "landed" : frame.phase,
    playing: ctx.clock.playing, nowMs: performance.now(),
    clockSpeed: ctx.clock.speed, staged: frame.staged,
  });
  ctx.landingBeat = step.state;
  applyLandingBeatEffects(step.effects, ctx);
  return step.showCompleteCard;
}

export function hudCore(
  ctx: F13Ctx,
  physicsT: number,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  distSplash: number,
  speedEarthKmS: number,
) {
  return {
    phase: prelaunch ? "Countdown" : frame.phaseLabel, phaseId: d.displayPhase,
    t: physicsT, durationS: ctx.transportS, distanceToMoon: Math.max(0, distSplash),
    altitude: d.displayAltEarth, speed: prelaunch ? 0 : speedEarthKmS, speedKmh: true,
    fuelBooster: frame.fuelBooster, fuelShip: frame.fuelShip, thrustN: d.showThrustN,
  };
}

export function hudPlayback(
  ctx: F13Ctx,
  physicsT: number,
  showCompleteCard: boolean,
) {
  return {
    playing: ctx.clock.playing,
    dateUtc: formatMissionDateUtc(physicsT, ctx.cache.horizonsLandingT, ctx.epoch.clockUtcMsAtT0),
    dateTexas: formatMissionDateTexas(physicsT, ctx.cache.horizonsLandingT, ctx.epoch.clockUtcMsAtT0),
    dateAustralia: formatMissionDateAustralia(physicsT, ctx.cache.horizonsLandingT, ctx.epoch.clockUtcMsAtT0),
    playbackSpeed: ctx.clock.speed, missionComplete: showCompleteCard,
    completeKind: ctx.landingBeat.kind,
  };
}

export function hudPackMeta(ctx: F13Ctx) {
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

export function hudDetail(
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  speeds: { speedEarth: number; speedMoon: number },
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

export function pushHud(
  ctx: F13Ctx,
  physicsT: number,
  prelaunch: boolean,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  distSplash: number,
  speeds: { speedEarth: number; speedMoon: number },
  showCompleteCard: boolean,
): void {
  ctx.hud.update({
    ...hudCore(ctx, physicsT, prelaunch, frame, d, distSplash, speeds.speedEarth),
    ...hudPlayback(ctx, physicsT, showCompleteCard),
    ...hudPackMeta(ctx),
    ...hudDetail(prelaunch, frame, d, speeds),
  });
}

export function maybePauseAtEnd(
  ctx: F13Ctx,
  u: number,
  showCompleteCard: boolean,
): void {
  if (u >= 1 && ctx.clock.playing && showCompleteCard) ctx.clock.pause();
}

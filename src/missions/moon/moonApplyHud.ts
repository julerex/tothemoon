/** Moon HUD builders. */

import type { bodyPositions } from "../../physics/bodies";
import { R_MOON, STARBASE_ALT } from "../../physics/constants";
import {
  formatMissionDateAustralia,
  formatMissionDateTexas,
  formatMissionDateUtc,
} from "../../physics/epoch";
import type { sampleAtProgress } from "../../physics/trajectoryCache";
import {
  relativeSpeedKmS,
  telemetryAltitudeKm,
} from "../../mission/frameDerive";
import { stepLandingBeat } from "../../mission/landingBeatHold";
import { applyLandingBeatEffects } from "../theaterHandlers";
import { cameraHudTelemetry } from "../../ui/hudCameraPose";
import type { MoonCtx } from "./bootstrap";
import type { displayFields } from "./moonApplyCore";

type SampleFrame = ReturnType<typeof sampleAtProgress>;
type BodyState = ReturnType<typeof bodyPositions>;

export function completeRaw(frame: SampleFrame, u: number): boolean {
  return (
    frame.phase === "landed" ||
    frame.phase === "impact" ||
    (u >= 0.999 && frame.phase === "coast")
  );
}

export function runLandingBeat(ctx: MoonCtx, frame: SampleFrame, u: number): boolean {
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

export function hudCore(
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

export function hudPlayback(ctx: MoonCtx, physicsT: number, showCompleteCard: boolean) {
  return {
    playing: ctx.clock.playing,
    dateUtc: formatMissionDateUtc(physicsT, ctx.cache.horizonsLandingT, ctx.epoch.clockUtcMsAtT0),
    dateTexas: formatMissionDateTexas(physicsT, ctx.cache.horizonsLandingT, ctx.epoch.clockUtcMsAtT0),
    dateAustralia: formatMissionDateAustralia(physicsT, ctx.cache.horizonsLandingT, ctx.epoch.clockUtcMsAtT0),
    playbackSpeed: ctx.clock.speed, missionComplete: showCompleteCard,
    completeKind: ctx.landingBeat.kind,
  };
}

export function hudPackMeta(ctx: MoonCtx, earth: BodyState["earth"]) {
  return {
    translunarInjectionDeltaV: ctx.cache.translunarInjectionDeltaV,
    minMoonAlt: ctx.cache.minMoonAlt, peakSpeedKmS: ctx.cache.peakSpeedKmS,
    stageT: ctx.cache.stageT, keplerRefMaxDevKm: ctx.cache.keplerRefMaxDevKm,
    focusDistance: ctx.director.getFocusDistance(),
    cameraMode: ctx.director.getMode(),
    ...(cameraHudTelemetry(ctx.director.getWorldPose(), earth) ?? {}),
  };
}

export function hudDetail(
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

export function pushHud(
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
    ...hudPackMeta(ctx, b.earth),
    ...hudDetail(ctx, prelaunch, frame, d, b),
  });
}

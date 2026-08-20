/** F13 FX stack. */

import type { bodyPositions } from "../../physics/bodies";
import { boosterPhaseAt } from "../../physics/boosterRecovery";
import {
  entryPlasmaStrength,
  entryVisualBank,
  landingEngineCount,
} from "../../physics/flight13Attitude";
import type { sampleAtProgress } from "../../physics/trajectoryCache";
import { sunElevAtPad } from "../../mission/frameDerive";
import { updateCraftVisuals } from "../../scene/craft";
import { updateMechazillaRecovery, updateStarbaseLaunchFx } from "../../scene/earthTheater";
import { deriveChopstickPose } from "../../scene/padRecoveryFx";
import type { F13Ctx } from "./bootstrap";
import { orientCraft } from "./orientCraft";
import type { displayFields } from "./flight13ApplyCore";

type SampleFrame = ReturnType<typeof sampleAtProgress>;
type BodyState = ReturnType<typeof bodyPositions>;

/** Pad roll so the T−2 ground cam sees TPS camera-left / stainless right. */
const PAD_TPS_CLOCK_RAD = -0.55;

export function applyAttitude(
  ctx: F13Ctx,
  physicsT: number,
  d: ReturnType<typeof displayFields>,
): void {
  orientCraft(
    ctx.orient, ctx.craftVel, ctx.earthPos, ctx.earthVel, true,
    Math.max(0, physicsT), d.displayPhase, d.showBurning, d.displayAltEarth,
  );
  if (physicsT < 0) {
    ctx.craft.rotateOnWorldAxis(ctx.orient.localUp, PAD_TPS_CLOCK_RAD);
  }
}

export function craftVisualArgs(
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

export function updateCraftFx(
  ctx: F13Ctx,
  physicsT: number,
  frame: SampleFrame,
  d: ReturnType<typeof displayFields>,
  air: number,
): void {
  updateCraftVisuals(ctx.craft, craftVisualArgs(ctx, physicsT, frame, d, air));
}

export function updatePadFx(
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

export function updateStageSplash(
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

export function speedAir(ctx: F13Ctx, b: BodyState): number {
  return Math.hypot(
    ctx.craftVel.x - b.earthVel.x,
    ctx.craftVel.y - b.earthVel.y,
    ctx.craftVel.z - b.earthVel.z,
  );
}

export function updateEntry(
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
  ctx.payloadFx.update(prelaunch ? 0 : t);
}

export function updateFxStack(
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

/** Moon FX stack. */

import type { Line2 } from "three/addons/lines/Line2.js";
import type { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { bodyPositions } from "../../physics/bodies";
import { STARBASE_ALT } from "../../physics/constants";
import type { sampleAtProgress } from "../../physics/trajectoryCache";
import {
  attitudeNearEarth,
  craftTrailStyle,
  sunElevAtPad,
} from "../../mission/frameDerive";
import { updateCraftVisuals } from "../../scene/craft";
import { updateMechazillaRecovery, updateStarbaseLaunchFx } from "../../scene/earthTheater";
import { deriveChopstickPose } from "../../scene/padRecoveryFx";
import type { MoonCtx } from "./bootstrap";
import { orientCraft } from "./orientCraft";
import type { displayFields } from "./moonApplyCore";

type SampleFrame = ReturnType<typeof sampleAtProgress>;
type BodyState = ReturnType<typeof bodyPositions>;

export function applyAttitude(
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

export function updateCraftFx(
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

export function updateTrail(ctx: MoonCtx, prelaunch: boolean, frame: SampleFrame): void {
  const trailMat = (ctx.craftTrail as Line2).material as LineMaterial;
  const style = craftTrailStyle(prelaunch, frame.phase, frame.burning);
  trailMat.linewidth = style.linewidth;
  trailMat.opacity = style.opacity;
}

export function updatePadFx(
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

export function updateLandingFx(
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

export function updateFxStack(
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

/** Moon pose + display fields. */

import { bodyPositions } from "../../physics/bodies";
import { EARTH_SURFACE_ALT_KM, STARBASE_ALT } from "../../physics/constants";
import { earthNorthPole, starbasePadState } from "../../physics/earthFrame";
import { clampAboveEllipsoid } from "../../physics/wgs84";
import { sampleAtProgress } from "../../physics/trajectoryCache";
import {
  physicsTToSampleU,
  transportUToPhysicsT,
} from "../../mission/prelaunch";
import { shouldClampAboveEarth } from "../../mission/frameDerive";
import type { MoonCtx } from "./bootstrap";

type SampleFrame = ReturnType<typeof sampleAtProgress>;
type BodyState = ReturnType<typeof bodyPositions>;

export function resolvePhysics(ctx: MoonCtx, u: number) {
  const physicsT = transportUToPhysicsT(u, ctx.physicsDurationS);
  const prelaunch = physicsT < 0;
  const frame = sampleAtProgress(
    ctx.cache,
    physicsTToSampleU(physicsT, ctx.physicsDurationS),
  );
  return { physicsT, prelaunch, frame };
}

export function placeCraft(
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

export function syncEarth(ctx: MoonCtx, simT: number): BodyState {
  const b = bodyPositions(simT, ctx.epoch);
  ctx.earthPos.set(b.earth.x, b.earth.y, b.earth.z);
  ctx.earthVel.set(b.earthVel.x, b.earthVel.y, b.earthVel.z);
  return b;
}

const _north = { x: 0, y: 0, z: 0 };

export function maybeClamp(ctx: MoonCtx, frame: SampleFrame, b: BodyState): void {
  if (!shouldClampAboveEarth(frame.phase)) return;
  earthNorthPole(_north);
  const lifted = clampAboveEllipsoid(ctx.craftPos, b.earth, _north, EARTH_SURFACE_ALT_KM);
  ctx.craftPos.set(lifted.x, lifted.y, lifted.z);
}

export function displayFields(prelaunch: boolean, frame: SampleFrame) {
  return {
    showBurning: prelaunch ? false : frame.burning,
    showThrustN: prelaunch ? 0 : frame.thrustN,
    displayPhase: prelaunch ? "launch" : frame.phase,
    displayAltEarth: prelaunch ? STARBASE_ALT : frame.altEarth,
    staged: prelaunch ? false : frame.staged,
  };
}

export function writeCinema(ctx: MoonCtx, d: ReturnType<typeof displayFields>): void {
  ctx.cinemaState.burning = d.showBurning;
  ctx.cinemaState.phase = d.displayPhase;
}

export function poseCraft(ctx: MoonCtx, u: number) {
  const { physicsT, prelaunch, frame } = resolvePhysics(ctx, u);
  placeCraft(ctx, prelaunch, physicsT, frame);
  const simT = prelaunch ? physicsT : frame.t;
  const b = syncEarth(ctx, simT);
  maybeClamp(ctx, frame, b);
  ctx.craft.position.copy(ctx.craftPos);
  return { physicsT, prelaunch, frame, simT, b };
}

/** F13 pose + display fields. */

import { bodyPositions } from "../../physics/bodies";
import { EARTH_SURFACE_ALT_KM, STARBASE_ALT } from "../../physics/constants";
import { earthNorthPole, starbasePadState } from "../../physics/earthFrame";
import { splashFloatRadiusKm } from "../../physics/flight13Attitude";
import { sampleAtProgress } from "../../physics/trajectoryCache";
import type { PhaseId } from "../../physics/missionTypes";
import {
  physicsTToSampleU,
  transportUToPhysicsT,
} from "../../mission/prelaunch";
import { clampAboveEllipsoid } from "../../physics/wgs84";
import { setCraftEarthRadius } from "../../mission/frameDerive";
import type { F13Ctx } from "./bootstrap";

type SampleFrame = ReturnType<typeof sampleAtProgress>;
type BodyState = ReturnType<typeof bodyPositions>;

export function resolvePhysics(ctx: F13Ctx, u: number) {
  const physicsT = transportUToPhysicsT(u, ctx.physicsDurationS);
  const prelaunch = physicsT < 0;
  const frame = sampleAtProgress(
    ctx.cache,
    physicsTToSampleU(physicsT, ctx.physicsDurationS),
  );
  return { physicsT, prelaunch, frame };
}

export function setCraftFromPad(ctx: F13Ctx, physicsT: number): void {
  const pad = starbasePadState(physicsT, ctx.epoch);
  ctx.craftPos.set(pad.pos.x, pad.pos.y, pad.pos.z);
  ctx.craftVel.set(pad.vel.x, pad.vel.y, pad.vel.z);
}

export function setCraftFromFrame(ctx: F13Ctx, frame: SampleFrame): void {
  ctx.craftPos.set(frame.pos.x, frame.pos.y, frame.pos.z);
  ctx.craftVel.set(frame.vel.x, frame.vel.y, frame.vel.z);
}

export function placeCraft(
  ctx: F13Ctx,
  prelaunch: boolean,
  physicsT: number,
  frame: SampleFrame,
): void {
  if (prelaunch) setCraftFromPad(ctx, physicsT);
  else setCraftFromFrame(ctx, frame);
}

export function syncEarth(ctx: F13Ctx, simT: number): BodyState {
  const b = bodyPositions(simT, ctx.epoch);
  ctx.earthPos.set(b.earth.x, b.earth.y, b.earth.z);
  ctx.earthVel.set(b.earthVel.x, b.earthVel.y, b.earthVel.z);
  return b;
}

const _north = { x: 0, y: 0, z: 0 };

export function clampCraft(
  ctx: F13Ctx,
  b: BodyState,
  phase: PhaseId,
  physicsT: number,
): void {
  earthNorthPole(_north);
  const lifted = clampAboveEllipsoid(ctx.craftPos, b.earth, _north, EARTH_SURFACE_ALT_KM);
  ctx.craftPos.set(lifted.x, lifted.y, lifted.z);
  if (phase === "splashdown") {
    const seated = setCraftEarthRadius(
      ctx.craftPos,
      b.earth,
      splashFloatRadiusKm(Math.max(0, physicsT)),
    );
    ctx.craftPos.set(seated.x, seated.y, seated.z);
  }
  ctx.craft.position.copy(ctx.craftPos);
}

export function displayFields(prelaunch: boolean, frame: SampleFrame) {
  return {
    showBurning: prelaunch ? false : frame.burning,
    showThrustN: prelaunch ? 0 : frame.thrustN,
    displayPhase: (prelaunch ? "launch" : frame.phase) as PhaseId,
    displayAltEarth: prelaunch ? STARBASE_ALT : frame.altEarth,
    stagedForCam: prelaunch ? false : frame.staged,
  };
}

export function writeCinema(
  ctx: F13Ctx,
  d: ReturnType<typeof displayFields>,
): void {
  ctx.cinemaState.burning = d.showBurning;
  ctx.cinemaState.phase = d.displayPhase;
  ctx.cinemaState.altEarth = d.displayAltEarth;
}

export function poseCraft(ctx: F13Ctx, u: number) {
  const { physicsT, prelaunch, frame } = resolvePhysics(ctx, u);
  placeCraft(ctx, prelaunch, physicsT, frame);
  const simT = prelaunch ? physicsT : frame.t;
  const b = syncEarth(ctx, simT);
  clampCraft(ctx, b, prelaunch ? "launch" : frame.phase, physicsT);
  return { physicsT, prelaunch, frame, simT, b };
}

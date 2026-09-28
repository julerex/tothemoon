/** F14 scene + finish. */

import type { bodyPositions } from "../../physics/bodies";
import { EARTH_SURFACE_ALT_KM, R_EARTH, R_MOON } from "../../physics/constants";
import { groundRelativeSpeedKmS, meshLocalToInertial } from "../../physics/earthFrame";
import type { sampleAtProgress } from "../../physics/trajectoryCache";
import { geodeticToEllipsoidMeshLocal } from "../../physics/wgs84";
import {
  autoCamFromWebcastShot,
  finaleChaseBias,
  nextAutoCamCut,
  type AutoCamSuggestion,
} from "../../camera/autoCam";
import { webcastShotAt } from "../../camera/flight14WebcastShots";
import {
  applyEarthshine,
  applyFillLight,
  applySunLight,
} from "../../scene/sunLight";
import { updateLocatorVisibility } from "../../scene/craft";
import { updateBodies } from "../../scene/bodies";
import { updateMoonRelativeOrbit } from "../../scene/createScene";
import type { F14Ctx } from "./bootstrap";
import type { displayFields } from "./flight14ApplyCore";
import { maybePauseAtEnd, pushHud, runLandingBeat } from "./flight14ApplyHud";

type SampleFrame = ReturnType<typeof sampleAtProgress>;
type BodyState = ReturnType<typeof bodyPositions>;

export function updateLights(ctx: F14Ctx, simT: number, b: BodyState): void {
  updateBodies(simT, ctx.bodies, ctx.epoch);
  if (ctx.flags.orbitsVisible) {
    updateMoonRelativeOrbit(ctx.moonRelOrbit, simT, ctx.epoch);
  }
  const sunUnit = applySunLight(ctx.sunLight, b.sun, b.earth, ctx.skySun);
  applyFillLight(ctx.fillLight, sunUnit, b.earth);
  applyEarthshine(ctx.earthshine, b.earth, b.moon);
  ctx.skyEarth.copy(ctx.earthPos);
}

export function updateLocators(ctx: F14Ctx, b: BodyState): void {
  updateLocatorVisibility(ctx.bodies.earthLocator, ctx.camera, ctx.earthPos, {
    sizeKm: R_EARTH * 2,
  });
  updateMoonLocator(ctx, b);
}

export function updateMoonLocator(ctx: F14Ctx, b: BodyState): void {
  ctx.moonPosV.set(b.moon.x, b.moon.y, b.moon.z);
  updateLocatorVisibility(ctx.bodies.moonLocator, ctx.camera, ctx.moonPosV, {
    sizeKm: R_MOON * 2,
  });
}

export function easeAutoSuggestion(ctx: F14Ctx, s: AutoCamSuggestion): void {
  ctx.director.easeToMode(s.mode, s);
  ctx.notifyAutoCamera(s.mode);
}

export function applyAutoCam(
  ctx: F14Ctx,
  d: ReturnType<typeof displayFields>,
  b: BodyState,
  physicsT: number,
): void {
  const autoCut = nextAutoCamCut(
    ctx.autoCam.enabled, d.displayPhase, d.stagedForCam,
    {
      phase: ctx.autoCam.phase,
      staged: ctx.autoCam.staged,
      shotKey: ctx.autoCam.shotKey,
    },
    "flight14",
    physicsT,
  );
  ctx.autoCam.phase = autoCut.phase;
  ctx.autoCam.staged = autoCut.staged;
  ctx.autoCam.shotKey = autoCut.shotKey;
  if (autoCut.suggestion) easeAutoSuggestion(ctx, autoCut.suggestion);
  const chaseOn = ctx.autoCam.enabled && ctx.director.getMode() === "chase";
  const bias = finaleChaseBias(chaseOn, "flight14", d.displayPhase);
  ctx.director.setChaseBias({
    ...bias,
    lookDownDir: {
      x: b.earth.x - ctx.craftPos.x,
      y: b.earth.y - ctx.craftPos.y,
      z: b.earth.z - ctx.craftPos.z,
    },
  });
  holdSplashDrone(ctx, physicsT);
}

/** Keep the sea-level drone seated while Auto-cam is on the splash-drone cut. */
export function holdSplashDrone(ctx: F14Ctx, physicsT: number): void {
  if (!ctx.autoCam.enabled) return;
  const shot = webcastShotAt(physicsT);
  if (shot.key !== "splash-drone") return;
  ctx.director.easeToMode(shot.mode, autoCamFromWebcastShot(shot));
}

export function splashWorldPoint(ctx: F14Ctx, simT: number): void {
  geodeticToEllipsoidMeshLocal(
    ctx.splashFx.lat,
    ctx.splashFx.lon,
    EARTH_SURFACE_ALT_KM,
    ctx.splashMesh,
  );
  meshLocalToInertial(ctx.splashMesh, simT, ctx.splashWorld);
}

export function distToSplash(ctx: F14Ctx, simT: number, b: BodyState): number {
  splashWorldPoint(ctx, simT);
  const e = b.earth;
  const s = ctx.splashWorld;
  return Math.hypot(
    ctx.craftPos.x - (e.x + s.x),
    ctx.craftPos.y - (e.y + s.y),
    ctx.craftPos.z - (e.z + s.z),
  );
}

export function relSpeed(
  vel: { x: number; y: number; z: number },
  bodyVel: { x: number; y: number; z: number },
): number {
  return Math.hypot(vel.x - bodyVel.x, vel.y - bodyVel.y, vel.z - bodyVel.z);
}

export function relativeSpeeds(ctx: F14Ctx, b: BodyState) {
  return {
    speedEarth: groundRelativeSpeedKmS(ctx.craftPos, ctx.craftVel, b.earth, b.earthVel),
    speedMoon: relSpeed(ctx.craftVel, b.moonVel),
  };
}

export function bodyArrowState(ctx: F14Ctx, b: BodyState) {
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

export function craftArrowState(
  ctx: F14Ctx,
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

export function updateVectors(
  ctx: F14Ctx,
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

export function updateSceneStack(
  ctx: F14Ctx,
  d: ReturnType<typeof displayFields>,
  b: BodyState,
  simT: number,
  physicsT: number,
): void {
  updateLights(ctx, simT, b);
  updateLocators(ctx, b);
  applyAutoCam(ctx, d, b, physicsT);
}

export function finishFrame(
  ctx: F14Ctx,
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
  ctx.flushHud = () => {
    pushHud(ctx, physicsT, prelaunch, frame, d, splash, speeds, show, b.earth);
  };
  maybePauseAtEnd(ctx, u, show);
}

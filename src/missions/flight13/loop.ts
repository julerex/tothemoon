/**
 * Flight 13 render loop: resize, tick clock, apply state, cinema pass.
 * Scene unit = 1 km.
 */

import {
  atmosphereBrownout,
  cameraAltitudeEarthKm,
  renderCinema,
  resizeCinema,
  updateSunShadowFocus,
} from "../../scene/cinema";
import { updateFatLineResolutions } from "../../scene/fatLines";
import { pulsePadBeacon } from "../../scene/earthTheater";
import { spinBodies } from "../../scene/bodies";
import { updateGroundSky } from "../../scene/groundSky";
import { updateZoomLabels } from "../../scene/zoomLabels";
import { transportUToPhysicsT } from "../../mission/prelaunch";
import type { F13Ctx } from "./bootstrap";
import { applyMissionState } from "./applyState";

function resizeIfNeeded(ctx: F13Ctx): void {
  const w = ctx.canvas.clientWidth;
  const h = ctx.canvas.clientHeight;
  if (ctx.canvas.width === w && ctx.canvas.height === h) return;
  ctx.renderer.setSize(w, h, false);
  ctx.camera.aspect = w / Math.max(h, 1);
  ctx.camera.updateProjectionMatrix();
  updateFatLineResolutions(ctx.scene, w, h);
  resizeCinema(ctx.cinema, w, h, Math.min(window.devicePixelRatio || 1, 2));
}

function tickSim(ctx: F13Ctx, dt: number): void {
  ctx.clock.tick(dt, ctx.transportS);
  applyMissionState(ctx, ctx.clock.t);
  pulsePadBeacon(ctx.starbasePad, ctx.wall.elapsedTime);
  spinBodies(ctx.bodies, dt);
}

function updateDirector(ctx: F13Ctx, dt: number): void {
  const simT = transportUToPhysicsT(ctx.clock.t, ctx.physicsDurationS);
  ctx.director.update(dt, simT, ctx.craftPos, ctx.craftVel);
  updateZoomLabels(ctx.scene, ctx.camera);
}

function frameBrownout(ctx: F13Ctx, camAltKm: number): number {
  return atmosphereBrownout(
    ctx.cinemaState.phase,
    ctx.cinemaState.altEarth > 0 ? ctx.cinemaState.altEarth : camAltKm,
    ctx.cinemaState.plasma,
  );
}

function renderFrame(ctx: F13Ctx): void {
  const camAltKm = cameraAltitudeEarthKm(ctx.camera.position, ctx.skyEarth);
  const brownout = frameBrownout(ctx, camAltKm);
  updateGroundSky(ctx.groundSky, ctx.camera, ctx.skyEarth, ctx.skySun, brownout);
  updateSunShadowFocus(ctx.sunLight, ctx.craftPos, ctx.skySun, camAltKm);
  renderCinema(ctx.cinema, ctx.renderer, ctx.scene, {
    camAltKm,
    burning: ctx.cinemaState.burning,
    brownout,
    phase: ctx.cinemaState.phase,
  });
}

function frame(ctx: F13Ctx): void {
  requestAnimationFrame(() => frame(ctx));
  resizeIfNeeded(ctx);
  const dt = Math.min(ctx.wall.getDelta(), 0.05);
  tickSim(ctx, dt);
  updateDirector(ctx, dt);
  renderFrame(ctx);
}

/** Snap pad opening camera, apply u=0, start rAF loop. */
export function startFlight13Loop(ctx: F13Ctx): void {
  applyMissionState(ctx, 0);
  const openT = transportUToPhysicsT(0, ctx.physicsDurationS);
  ctx.director.snapPadOpening(openT);
  frame(ctx);
}

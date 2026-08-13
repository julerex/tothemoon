/**
 * Lunar mission render loop.
 * Scene unit = 1 km.
 */

import {
  atmosphereBrownout,
  cameraAltitudeEarthKm,
  cameraAltitudeMoonKm,
  renderCinema,
  resizeCinema,
  shadowAltitudeKm,
  updateSunShadowFocus,
} from "../../scene/cinema";
import { updateFatLineResolutions } from "../../scene/fatLines";
import { pulsePadBeacon } from "../../scene/earthTheater";
import { spinBodies } from "../../scene/bodies";
import { updateGroundSky } from "../../scene/groundSky";
import { updateZoomLabels } from "../../scene/zoomLabels";
import { transportUToPhysicsT } from "../../mission/prelaunch";
import type { MoonCtx } from "./bootstrap";
import { applyMissionState } from "./applyState";

function resizeIfNeeded(ctx: MoonCtx): void {
  const w = ctx.canvas.clientWidth;
  const h = ctx.canvas.clientHeight;
  if (ctx.canvas.width === w && ctx.canvas.height === h) return;
  ctx.renderer.setSize(w, h, false);
  ctx.camera.aspect = w / Math.max(h, 1);
  ctx.camera.updateProjectionMatrix();
  updateFatLineResolutions(ctx.scene, w, h);
  resizeCinema(ctx.cinema, w, h, Math.min(window.devicePixelRatio || 1, 2));
}

function tickSim(ctx: MoonCtx, dt: number): void {
  ctx.clock.tick(dt, ctx.transportS);
  applyMissionState(ctx, ctx.clock.t);
  pulsePadBeacon(ctx.starbasePad, ctx.wall.elapsedTime);
  spinBodies(ctx.bodies, dt);
}

function updateDirector(ctx: MoonCtx, dt: number): void {
  const simT = transportUToPhysicsT(ctx.clock.t, ctx.physicsDurationS);
  ctx.director.update(dt, simT, ctx.craftPos, ctx.craftVel);
  updateZoomLabels(ctx.scene, ctx.camera);
}

function renderFrame(ctx: MoonCtx): void {
  const camAltEarth = cameraAltitudeEarthKm(ctx.camera.position, ctx.skyEarth);
  const camAltMoon = cameraAltitudeMoonKm(ctx.camera.position, ctx.moonPosV);
  const camAltKm = shadowAltitudeKm(camAltEarth, camAltMoon);
  const brownout = atmosphereBrownout(ctx.cinemaState.phase, camAltKm);
  updateGroundSky(ctx.groundSky, ctx.camera, ctx.skyEarth, ctx.skySun, brownout);
  updateSunShadowFocus(ctx.sunLight, ctx.craftPos, ctx.skySun, camAltKm);
  renderCinema(ctx.cinema, ctx.renderer, ctx.scene, {
    camAltKm,
    burning: ctx.cinemaState.burning,
    brownout,
  });
}

function frame(ctx: MoonCtx): void {
  requestAnimationFrame(() => frame(ctx));
  resizeIfNeeded(ctx);
  const dt = Math.min(ctx.wall.getDelta(), 0.05);
  tickSim(ctx, dt);
  updateDirector(ctx, dt);
  renderFrame(ctx);
}

/** Snap pad opening, apply u=0, start rAF loop. */
export function startToTheMoonLoop(ctx: MoonCtx): void {
  applyMissionState(ctx, 0);
  const openT = transportUToPhysicsT(0, ctx.physicsDurationS);
  ctx.director.snapPadOpening(openT);
  frame(ctx);
}

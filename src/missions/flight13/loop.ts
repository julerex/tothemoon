/**
 * Flight 13 render loop: the shared theater loop plus a cinema pass that folds
 * entry plasma and true craft altitude into the atmospheric brownout.
 *
 * Scene unit = 1 km.
 */

import {
  atmosphereBrownout,
  cameraAltitudeEarthKm,
  renderCinema,
  updateSunShadowFocus,
} from "../../scene/cinema";
import { updateGroundSky } from "../../scene/groundSky";
import { startMissionLoop } from "../missionLoop";
import type { F13Ctx } from "./bootstrap";
import { applyMissionState } from "./applyState";

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

/** Snap pad opening camera, apply u=0, start rAF loop. */
export function startFlight13Loop(ctx: F13Ctx): void {
  startMissionLoop(ctx, { applyState: applyMissionState, render: renderFrame });
}

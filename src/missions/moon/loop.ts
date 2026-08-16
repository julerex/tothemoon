/**
 * Lunar mission render loop: the shared theater loop plus a cinema pass that
 * folds in Moon-relative camera altitude for shadow focus.
 *
 * Scene unit = 1 km.
 */

import {
  atmosphereBrownout,
  cameraAltitudeEarthKm,
  cameraAltitudeMoonKm,
  renderCinema,
  shadowAltitudeKm,
  updateSunShadowFocus,
} from "../../scene/cinema";
import { updateGroundSky } from "../../scene/groundSky";
import { startMissionLoop } from "../missionLoop";
import type { MoonCtx } from "./bootstrap";
import { applyMissionState } from "./applyState";

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
    phase: ctx.cinemaState.phase,
    focus: ctx.director.getMode(),
  });
}

/** Snap pad opening, apply u=0, start rAF loop. */
export function startToTheMoonLoop(ctx: MoonCtx): void {
  startMissionLoop(ctx, { applyState: applyMissionState, render: renderFrame });
}

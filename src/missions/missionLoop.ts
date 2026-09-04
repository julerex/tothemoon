/**
 * Shared mission theater render loop.
 *
 * Both theaters ran byte-identical resize / tick / camera / rAF code and
 * differed only in the cinema pass (the lunar mission folds in Moon-relative
 * shadow altitude; Flight 13 folds in entry plasma). That difference is the one
 * hook this higher-order loop takes. HUD camera readouts flush after the
 * director seats the eye so altitude is not one physics tick behind Earth.
 *
 * Scene unit = 1 km.
 */

import type * as THREE from "three";
import { resizeCinema } from "../scene/cinema";
import { spinBodies } from "../scene/bodies";
import { updateFatLineResolutions } from "../scene/fatLines";
import { pulsePadBeacon } from "../scene/earthTheater";
import { updateZoomLabels } from "../scene/zoomLabels";
import type { CameraDirector } from "../camera/modes";
import type { MissionClock } from "../mission/clock";
import { transportUToPhysicsT } from "../mission/prelaunch";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { syncUndergroundOverlay } from "../ui/undergroundOverlay";

/** The context fields every theater loop touches, whatever the mission. */
export type MissionLoopCtx = {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  cinema: Parameters<typeof resizeCinema>[0];
  bodies: Parameters<typeof spinBodies>[0];
  starbasePad: THREE.Group;
  director: CameraDirector;
  clock: MissionClock;
  /** Mission ephemeris (Earth / Moon centers for the underground overlay). */
  epoch: EphemerisEpoch;
  /** Wall-clock delta source (also drives pad beacon pulse). */
  wall: THREE.Clock;
  /** Transport duration (s) at 1× playback. */
  transportS: number;
  /** Physics duration (s) the transport maps onto. */
  physicsDurationS: number;
  craftPos: THREE.Vector3;
  craftVel: THREE.Vector3;
  /**
   * Filled during applyState. The loop runs it **after** the camera director
   * seats this frame so Earth-relative HUD (cam altitude) is not one tick stale.
   */
  flushHud?: () => void;
};

/** Mission-specific passes the shared loop calls each frame. */
export type MissionLoopHooks<C extends MissionLoopCtx> = Readonly<{
  /** Push mission state onto the scene graph at transport progress `u`. */
  applyState: (ctx: C, u: number) => void;
  /** Ground sky, sun shadow focus, and the cinema composer pass. */
  render: (ctx: C) => void;
}>;

/** Longest simulated step (s); larger wall gaps are clamped so scrubs stay sane. */
const MAX_STEP_S = 0.05;

function resizeIfNeeded(ctx: MissionLoopCtx): void {
  const w = ctx.canvas.clientWidth;
  const h = ctx.canvas.clientHeight;
  if (ctx.canvas.width === w && ctx.canvas.height === h) return;
  ctx.renderer.setSize(w, h, false);
  ctx.camera.aspect = w / Math.max(h, 1);
  ctx.camera.updateProjectionMatrix();
  updateFatLineResolutions(ctx.scene, w, h);
  resizeCinema(ctx.cinema, w, h, Math.min(window.devicePixelRatio || 1, 2));
}

function tickSim<C extends MissionLoopCtx>(
  ctx: C, dt: number, applyState: MissionLoopHooks<C>["applyState"],
): void {
  ctx.clock.tick(dt, ctx.transportS);
  applyState(ctx, ctx.clock.t);
  pulsePadBeacon(ctx.starbasePad, ctx.wall.elapsedTime);
  spinBodies(ctx.bodies, dt);
}

function updateDirector(ctx: MissionLoopCtx, dt: number): void {
  const simT = transportUToPhysicsT(ctx.clock.t, ctx.physicsDurationS);
  ctx.director.update(dt, simT, ctx.craftPos, ctx.craftVel);
  updateZoomLabels(ctx.scene, ctx.camera);
  syncUndergroundOverlay(ctx.camera.position, simT, ctx.epoch);
}

function seatCameraThenHud(ctx: MissionLoopCtx, dt: number): void {
  updateDirector(ctx, dt);
  ctx.flushHud?.();
}

function frame<C extends MissionLoopCtx>(ctx: C, hooks: MissionLoopHooks<C>): void {
  requestAnimationFrame(() => frame(ctx, hooks));
  resizeIfNeeded(ctx);
  const dt = Math.min(ctx.wall.getDelta(), MAX_STEP_S);
  tickSim(ctx, dt, hooks.applyState);
  seatCameraThenHud(ctx, dt);
  hooks.render(ctx);
}

/** Apply the current clock (pad at u=0, or a deep-link seek), then start rAF. */
export function startMissionLoop<C extends MissionLoopCtx>(
  ctx: C,
  hooks: MissionLoopHooks<C>,
): void {
  hooks.applyState(ctx, ctx.clock.t);
  // Pad opening snap is only for a cold start; a `?t=` seek already placed
  // the craft, and Auto-cam will cut to the shot for that time.
  if (ctx.clock.t < 1e-9) {
    ctx.director.snapPadOpening(transportUToPhysicsT(0, ctx.physicsDurationS));
  } else {
    const simT = transportUToPhysicsT(ctx.clock.t, ctx.physicsDurationS);
    ctx.director.update(0, simT, ctx.craftPos, ctx.craftVel);
  }
  ctx.flushHud?.();
  frame(ctx, hooks);
}

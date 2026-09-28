/**
 * Per-frame mission state for Flight 14 theater.
 * Scene unit = 1 km.
 */

import type { F14Ctx } from "./bootstrap";
import {
  displayFields,
  poseCraft,
  writeCinema,
} from "./flight14ApplyCore";
import { updateFxStack } from "./flight14ApplyFx";
import { finishFrame, updateSceneStack } from "./flight14ApplyScene";

/** Apply transport progress u ∈ [0,1] to craft, FX, camera cues, and HUD. */
export function applyMissionState(ctx: F14Ctx, u: number): void {
  const { physicsT, prelaunch, frame, simT, b } = poseCraft(ctx, u);
  const d = displayFields(prelaunch, frame);
  writeCinema(ctx, d);
  updateFxStack(ctx, physicsT, prelaunch, frame, d, b);
  updateSceneStack(ctx, d, b, simT, physicsT);
  finishFrame(ctx, u, physicsT, prelaunch, frame, d, b, simT);
}

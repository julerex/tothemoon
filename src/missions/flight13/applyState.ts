/**
 * Per-frame mission state for Flight 13 theater.
 * Scene unit = 1 km.
 */

import type { F13Ctx } from "./bootstrap";
import {
  displayFields,
  poseCraft,
  writeCinema,
} from "./flight13ApplyCore";
import { updateFxStack } from "./flight13ApplyFx";
import { finishFrame, updateSceneStack } from "./flight13ApplyScene";

/** Apply transport progress u ∈ [0,1] to craft, FX, camera cues, and HUD. */
export function applyMissionState(ctx: F13Ctx, u: number): void {
  const { physicsT, prelaunch, frame, simT, b } = poseCraft(ctx, u);
  const d = displayFields(prelaunch, frame);
  writeCinema(ctx, d);
  updateFxStack(ctx, physicsT, prelaunch, frame, d, b);
  updateSceneStack(ctx, d, b, simT, physicsT);
  finishFrame(ctx, u, physicsT, prelaunch, frame, d, b, simT);
}

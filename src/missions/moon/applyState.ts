/**
 * Per-frame mission state for Starbase → Moon theater.
 * Scene unit = 1 km.
 */

import type { MoonCtx } from "./bootstrap";
import { displayFields, poseCraft, writeCinema } from "./moonApplyCore";
import { updateFxStack } from "./moonApplyFx";
import { sceneAndHud } from "./moonApplyScene";

/** Apply transport progress u ∈ [0,1] to craft, FX, camera cues, and HUD. */
export function applyMissionState(ctx: MoonCtx, u: number): void {
  const { physicsT, prelaunch, frame, simT, b } = poseCraft(ctx, u);
  const d = displayFields(prelaunch, frame);
  writeCinema(ctx, d);
  updateFxStack(ctx, physicsT, prelaunch, frame, d, b);
  sceneAndHud(ctx, u, physicsT, prelaunch, frame, d, simT, b);
}

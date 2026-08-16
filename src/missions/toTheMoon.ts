/**
 * Starbase → Moon mission theater (existing precomputed trajectory).
 * Call once after the user picks this mission from the menu shell.
 */

import { attachMissionSeek, type MissionStartOpts } from "../app/seekUrl";
import { bootstrapToTheMoon } from "./moon/bootstrap";
import { startToTheMoonLoop } from "./moon/loop";

/**
 * Starbase → Moon mission theater (existing precomputed trajectory).
 * Call once after the user picks this mission from the menu shell.
 */
export function startToTheMoonMission(opts?: MissionStartOpts): void {
  const ctx = bootstrapToTheMoon();
  attachMissionSeek(ctx.clock, ctx.physicsDurationS, "to-the-moon", opts?.seekT);
  startToTheMoonLoop(ctx);
}

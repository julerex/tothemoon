/**
 * Starship Flight 13 full mission theater (baked suborbital profile).
 * Call once after the user picks this mission from the menu shell.
 */

import { attachMissionSeek, type MissionStartOpts } from "../app/seekUrl";
import { bootstrapFlight13 } from "./flight13/bootstrap";
import { startFlight13Loop } from "./flight13/loop";

/**
 * Starship Flight 13 full mission theater (baked suborbital profile).
 * Call once after the user picks this mission from the menu shell.
 */
export function startFlight13Theater(opts?: MissionStartOpts): void {
  const ctx = bootstrapFlight13();
  attachMissionSeek(ctx.clock, ctx.physicsDurationS, "flight-13", opts?.seekT);
  startFlight13Loop(ctx);
}

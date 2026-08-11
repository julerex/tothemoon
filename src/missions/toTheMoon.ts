/**
 * Starbase → Moon mission theater (existing precomputed trajectory).
 * Call once after the user picks this mission from the menu shell.
 */

import { bootstrapToTheMoon } from "./moon/bootstrap";
import { startToTheMoonLoop } from "./moon/loop";

/**
 * Starbase → Moon mission theater (existing precomputed trajectory).
 * Call once after the user picks this mission from the menu shell.
 */
export function startToTheMoonMission(): void {
  const ctx = bootstrapToTheMoon();
  startToTheMoonLoop(ctx);
}

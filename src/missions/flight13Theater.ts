/**
 * Starship Flight 13 full mission theater (baked suborbital profile).
 * Call once after the user picks this mission from the menu shell.
 */

import { bootstrapFlight13 } from "./flight13/bootstrap";
import { startFlight13Loop } from "./flight13/loop";

/**
 * Starship Flight 13 full mission theater (baked suborbital profile).
 * Call once after the user picks this mission from the menu shell.
 */
export function startFlight13Theater(): void {
  const ctx = bootstrapFlight13();
  startFlight13Loop(ctx);
}

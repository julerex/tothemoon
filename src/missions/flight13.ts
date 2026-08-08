/**
 * Starship Flight 13 entry: full 3D theater (baked trajectory pack).
 */

import { startFlight13Theater } from "./flight13Theater";

/**
 * Start the Flight 13 mission theater (same visual fidelity class as
 * Starbase → Moon: craft, pad, staging FX, cameras, HUD, scrubber).
 */
export function startFlight13Mission(): void {
  startFlight13Theater();
}

/**
 * Starship Flight 13 entry: full 3D theater (baked trajectory pack).
 */

import type { MissionStartOpts } from "../app/seekUrl";
import { startFlight13Theater } from "./flight13Theater";

/**
 * Start the Flight 13 mission theater (same visual fidelity class as
 * Starbase → Moon: craft, pad, staging FX, cameras, HUD, scrubber).
 * Returns the unveil callback from {@link startFlight13Theater}.
 */
export function startFlight13Mission(opts?: MissionStartOpts): () => void {
  return startFlight13Theater(opts);
}

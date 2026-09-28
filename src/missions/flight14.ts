/**
 * Starship Flight 14 entry: full 3D theater (baked trajectory pack).
 */

import type { MissionStartOpts } from "../app/seekUrl";
import { startFlight14Theater } from "./flight14Theater";

/**
 * Start the Flight 14 mission theater (same visual fidelity class as
 * Starbase → Moon: craft, pad, staging FX, cameras, HUD, scrubber).
 * Returns the unveil callback from {@link startFlight14Theater}.
 */
export function startFlight14Mission(opts?: MissionStartOpts): () => void {
  return startFlight14Theater(opts);
}

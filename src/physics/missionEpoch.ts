/**
 * Mission ephemeris epoch helpers (July 2027 theater).
 *
 * Sets Moon / Sun mean phases so analytic and Horizons paths share one map.
 */

import { setMoonPhase0, setSunPhase0 } from "./bodies";
import { sunPhase0ForLanding } from "./epoch";
import { transferTimeEst } from "./tli";

/** Apply July-2027-consistent ephemeris for a candidate moon phase. */
export function setEpochPhases(
  moonPhase0: number,
  landingT: number = transferTimeEst(),
): void {
  setMoonPhase0(moonPhase0);
  setSunPhase0(sunPhase0ForLanding(moonPhase0, landingT));
}

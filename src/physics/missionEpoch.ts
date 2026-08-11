/**
 * Mission ephemeris epoch factories (July 2027 lunar theater).
 *
 * Pure builders for {@link EphemerisEpoch} — no module setters.
 */

import type { EphemerisEpoch } from "./ephemerisEpoch";
import { hasHorizonsTable } from "./horizonsEpoch";
import { sunPhase0ForLanding } from "./epoch";
import { transferTimeEst } from "./translunarInjection";

/**
 * Lunar theater epoch for a candidate Moon phase and Horizons landing map.
 * `sunPhase0` matches waning-gibbous geometry at `landingT` (July 2027).
 */
function lunarEpochPartial(moonPhase0: number, landingT: number, useHorizons: boolean): EphemerisEpoch {
  return { moonPhase0, sunPhase0: Math.PI, horizonsLandingT: landingT, useHorizons, clockUtcMsAtT0: null };
}

export function makeLunarEpoch(
  moonPhase0: number, landingT: number = transferTimeEst(), useHorizons: boolean = hasHorizonsTable(),
): EphemerisEpoch {
  const partial = lunarEpochPartial(moonPhase0, landingT, useHorizons);
  return Object.freeze({ ...partial, sunPhase0: sunPhase0ForLanding(moonPhase0, landingT, partial) });
}

/**
 * @deprecated Use {@link makeLunarEpoch}. Name kept for search-call readability.
 * Apply July-2027-consistent ephemeris for a candidate moon phase.
 */
export function epochForPhases(
  moonPhase0: number,
  landingT: number = transferTimeEst(),
  useHorizons: boolean = hasHorizonsTable(),
): EphemerisEpoch {
  return makeLunarEpoch(moonPhase0, landingT, useHorizons);
}

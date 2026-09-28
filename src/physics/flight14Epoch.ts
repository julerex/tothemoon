/**
 * Flight 14 mission clock + lighting epoch.
 *
 * Pins mission t = 0 to the flown liftoff (**7:48:59 a.m. CDT** =
 * 2026-09-28 12:48:59 UTC — docs/STARSHIP_14.md). The bake stays analytic so
 * the pad frame stays consistent. `sunPhase0` is the USNO solar longitude at
 * that UTC.
 *
 * Pure factory — no module setters.
 */

import type { EphemerisEpoch } from "./ephemerisEpoch";
import { starbaseSunElev } from "./earthFrame";
import {
  FLIGHT14_LIFTOFF_UTC_MS,
  sunPhase0ForUtc,
} from "./epoch";

/**
 * Build Flight 14 epoch: liftoff UTC + matching sunPhase0, analytic ephemeris.
 * @param moonPhase0 Kepler moon phase at t = 0 (pack default 0 is fine)
 * @param splashMissionT mission time of splash (horizonsLandingT bookkeeping)
 */
export function makeFlight14Epoch(
  moonPhase0 = 0,
  splashMissionT = 0,
): EphemerisEpoch {
  return Object.freeze({
    moonPhase0,
    sunPhase0: sunPhase0ForUtc(FLIGHT14_LIFTOFF_UTC_MS),
    horizonsLandingT: splashMissionT,
    useHorizons: false,
    clockUtcMsAtT0: FLIGHT14_LIFTOFF_UTC_MS,
  });
}

/**
 * Build Flight 14 epoch and report pad sun elevation at t = 0.
 * Prefer {@link makeFlight14Epoch} when elevation is not needed.
 */
export function applyFlight14Epoch(
  moonPhase0 = 0,
  splashMissionT = 0,
): {
  epoch: EphemerisEpoch;
  sunPhase0: number;
  liftoffUtcMs: number;
  padSunElev: number;
} {
  const epoch = makeFlight14Epoch(moonPhase0, splashMissionT);
  return {
    epoch,
    sunPhase0: epoch.sunPhase0,
    liftoffUtcMs: FLIGHT14_LIFTOFF_UTC_MS,
    padSunElev: starbaseSunElev(0, epoch),
  };
}

/**
 * Flight 13 mission clock + lighting epoch.
 *
 * Pins mission t = 0 to the public launch-window open (**5:45 p.m. CDT** =
 * 2026-07-23 22:45 UTC — docs/STARSHIP_13.md). Solar longitude matches that
 * instant (no theater nudge). Analytic Earth/Sun only (Horizons pack is the
 * July 2027 lunar window).
 *
 * Pure factory — no module setters.
 */

import { starbaseSunElev } from "./earthFrame";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import {
  FLIGHT13_LIFTOFF_UTC_MS,
  sunPhase0ForUtc,
} from "./epoch";

/**
 * Build Flight 13 epoch: liftoff UTC + matching sunPhase0, analytic ephemeris.
 * @param moonPhase0 Kepler moon phase at t = 0 (pack default 0 is fine)
 * @param splashMissionT mission time of splash (horizonsLandingT bookkeeping)
 */
export function makeFlight13Epoch(
  moonPhase0 = 0,
  splashMissionT = 0,
): EphemerisEpoch {
  return Object.freeze({
    moonPhase0,
    sunPhase0: sunPhase0ForUtc(FLIGHT13_LIFTOFF_UTC_MS),
    horizonsLandingT: splashMissionT,
    useHorizons: false,
    clockUtcMsAtT0: FLIGHT13_LIFTOFF_UTC_MS,
  });
}

/**
 * Build Flight 13 epoch and report pad sun elevation at t = 0.
 * Prefer {@link makeFlight13Epoch} when elevation is not needed.
 */
export function applyFlight13Epoch(
  moonPhase0 = 0,
  splashMissionT = 0,
): {
  epoch: EphemerisEpoch;
  sunPhase0: number;
  liftoffUtcMs: number;
  padSunElev: number;
} {
  const epoch = makeFlight13Epoch(moonPhase0, splashMissionT);
  return {
    epoch,
    sunPhase0: epoch.sunPhase0,
    liftoffUtcMs: FLIGHT13_LIFTOFF_UTC_MS,
    padSunElev: starbaseSunElev(0, epoch),
  };
}

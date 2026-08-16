/**
 * Flight 13 mission clock + lighting epoch.
 *
 * Pins mission t = 0 to the public launch-window open (**5:45 p.m. CDT** =
 * 2026-07-23 22:45 UTC — docs/STARSHIP_13.md). Analytic Earth/Sun only
 * (Horizons pack is the July 2027 lunar window), plus
 * {@link FLIGHT13_SUN_PHASE_NUDGE_RAD} so splash is webcast daylight.
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
 * Theater lighting offset (rad) added to analytic `sunPhase0`.
 *
 * Raw UTC at the Indian Ocean splash is a low southern-winter morning; without
 * this the terminator sits ~10° short of the site (webcast splash is full
 * daylight). Negative = earlier solar longitude, lifting splash sun while
 * leaving Starbase in afternoon.
 */
export const FLIGHT13_SUN_PHASE_NUDGE_RAD = (-16 * Math.PI) / 180;

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
    sunPhase0:
      sunPhase0ForUtc(FLIGHT13_LIFTOFF_UTC_MS) + FLIGHT13_SUN_PHASE_NUDGE_RAD,
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

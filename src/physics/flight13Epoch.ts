/**
 * Flight 13 mission clock + lighting epoch.
 *
 * Pins mission t = 0 to the public launch-window open (5:45 p.m. CDT) so
 * Starbase is in daylight, and forces analytic Earth/Sun (Horizons is the
 * lunar July 2027 table only). Call before integrating or loading the pack.
 */

import { setMoonPhase0, setSunPhase0 } from "./bodies";
import {
  FLIGHT13_LIFTOFF_UTC_MS,
  setMissionClockEpochUtc,
  sunPhase0ForFlight13Liftoff,
} from "./epoch";
import { setHorizonsEnabled, setMissionLandingT } from "./horizonsEpoch";

/**
 * Apply Flight 13 epoch: liftoff UTC, daytime sunPhase0, analytic ephemeris.
 * @param moonPhase0 Kepler moon phase at t = 0 (pack default 0 is fine)
 * @param splashMissionT mission time of splash (for setMissionLandingT bookkeeping)
 */
export function applyFlight13Epoch(
  moonPhase0 = 0,
  splashMissionT = 0,
): { sunPhase0: number; liftoffUtcMs: number } {
  setHorizonsEnabled(false);
  setMissionClockEpochUtc(FLIGHT13_LIFTOFF_UTC_MS);
  // Keep a finite landing-T for any code still reading getMissionLandingT
  setMissionLandingT(splashMissionT);
  setMoonPhase0(moonPhase0);
  const sunPhase0 = sunPhase0ForFlight13Liftoff();
  setSunPhase0(sunPhase0);
  return { sunPhase0, liftoffUtcMs: FLIGHT13_LIFTOFF_UTC_MS };
}

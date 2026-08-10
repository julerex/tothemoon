/**
 * Flight 13 mission clock + lighting epoch.
 *
 * Pins mission t = 0 to the public launch-window open (**5:45 p.m. CDT** =
 * 2026-07-23 22:45 UTC — docs/STARSHIP_13.md). Solar longitude matches that
 * instant (no theater nudge). Analytic Earth/Sun only (Horizons pack is the
 * July 2027 lunar window).
 *
 * Call before integrating or loading the pack.
 */

import { setMoonPhase0, setSunPhase0 } from "./bodies";
import { starbaseSunElev } from "./earthFrame";
import {
  FLIGHT13_LIFTOFF_UTC_MS,
  setMissionClockEpochUtc,
  sunPhase0ForUtc,
} from "./epoch";
import { setHorizonsEnabled, setMissionLandingT } from "./horizonsEpoch";

/**
 * Apply Flight 13 epoch: liftoff UTC + matching sunPhase0, analytic ephemeris.
 * @param moonPhase0 Kepler moon phase at t = 0 (pack default 0 is fine)
 * @param splashMissionT mission time of splash (for setMissionLandingT bookkeeping)
 */
export function applyFlight13Epoch(
  moonPhase0 = 0,
  splashMissionT = 0,
): { sunPhase0: number; liftoffUtcMs: number; padSunElev: number } {
  setHorizonsEnabled(false);
  setMissionClockEpochUtc(FLIGHT13_LIFTOFF_UTC_MS);
  // Keep a finite landing-T for any code still reading getMissionLandingT
  setMissionLandingT(splashMissionT);
  setMoonPhase0(moonPhase0);
  // Honest solar geometry for the wall-clock liftoff — no elev search
  const sunPhase0 = sunPhase0ForUtc(FLIGHT13_LIFTOFF_UTC_MS);
  setSunPhase0(sunPhase0);
  return {
    sunPhase0,
    liftoffUtcMs: FLIGHT13_LIFTOFF_UTC_MS,
    padSunElev: starbaseSunElev(0),
  };
}

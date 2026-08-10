/**
 * Flight 13 mission clock + lighting epoch.
 *
 * Pins mission t = 0 to the public launch-window open (5:45 p.m. CDT) and
 * forces analytic Earth/Sun (Horizons is the lunar July 2027 table only).
 * Solar longitude is then **nudged** so Starbase sun elevation is clearly
 * daytime (theater lighting — not ops hour-angle accuracy).
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

/** Prefer sin(elev) at least this high at the pad (≈35°). */
const MIN_PAD_SUN_ELEV = 0.58;

/**
 * Seasonal sunPhase0, then small search so pad elev is solidly daytime.
 * GMST still follows the wall-clock liftoff UTC.
 */
export function sunPhase0ForFlight13Daylight(): number {
  const seasonal = sunPhase0ForUtc(FLIGHT13_LIFTOFF_UTC_MS);
  setSunPhase0(seasonal);
  let bestPhase = seasonal;
  let bestElev = starbaseSunElev(0);
  if (bestElev >= MIN_PAD_SUN_ELEV) return bestPhase;

  // ±90° of ecliptic Earth angle ≈ theater daylight without full season flip
  for (let deg = -90; deg <= 90; deg += 3) {
    const phase = seasonal + (deg * Math.PI) / 180;
    setSunPhase0(phase);
    const elev = starbaseSunElev(0);
    if (elev > bestElev) {
      bestElev = elev;
      bestPhase = phase;
    }
  }
  return bestPhase;
}

/**
 * Apply Flight 13 epoch: liftoff UTC, daytime sunPhase0, analytic ephemeris.
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
  const sunPhase0 = sunPhase0ForFlight13Daylight();
  setSunPhase0(sunPhase0);
  return {
    sunPhase0,
    liftoffUtcMs: FLIGHT13_LIFTOFF_UTC_MS,
    padSunElev: starbaseSunElev(0),
  };
}

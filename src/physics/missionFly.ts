/**
 * Full flight path: ascent → low Earth orbit dogleg → finite translunar injection → ballistic n-body coast.
 *
 * Ends in lunar impact or ballistic flyby (no lunar orbit insertion / powered descent/landing burns).
 */

import { getAscent } from "./ascentCache";
import { runBallisticCoast } from "./ballisticCoast";
import {
  appendAscentAndLowEarthOrbitCoast,
  getLastDoglegDvKmS,
} from "./lowEarthOrbitCoast";
import type { MissionResult, Sample } from "./missionTypes";
import { createPropState, fuelShipFrac } from "./propellant";
import { runFiniteTranslunarInjection } from "./translunarInjection";

/**
 * Full flight: ascent → low Earth orbit dogleg → finite translunar injection → pure n-body ballistic coast.
 * `toa` is reserved for callers that still pass design perilune time.
 */
export function flyMission(
  moonPhase0: number,
  translunarInjectionDeltaV: number,
  toa?: number,
): MissionResult {
  void toa;
  const samples: Sample[] = [];
  const lastT = { t: -Infinity };
  const prop = createPropState(0);

  if (!getAscent().ok) {
    return {
      samples,
      durationS: 0,
      moonPhase0,
      translunarInjectionDeltaV,
      minMoonAlt: Infinity,
      ok: false,
      message: "Ascent failed",
    };
  }

  const state = appendAscentAndLowEarthOrbitCoast(samples, lastT, prop);
  console.info(
    `[tothemoon] low Earth orbit dogleg Δv=${getLastDoglegDvKmS().toFixed(3)} km/s · ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );
  const translunarInjectionBurn = runFiniteTranslunarInjection(state, translunarInjectionDeltaV, samples, lastT, prop);
  console.info(
    `[tothemoon] translunar injection finite burn Δv=${translunarInjectionBurn.dvDelivered.toFixed(3)} km/s · ` +
      `${(translunarInjectionBurn.burnS / 60).toFixed(2)} min · a=${(translunarInjectionBurn.accel / 0.00980665).toFixed(2)} g · ` +
      `ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );

  return runBallisticCoast({
    state,
    samples,
    lastT,
    prop,
    moonPhase0,
    translunarInjectionDeltaV,
  });
}

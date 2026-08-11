/**
 * Full flight path: ascent → low Earth orbit dogleg → finite translunar injection →
 * n-body coast → lunar orbit insertion → low lunar orbit → powered descent → land.
 */

import { getAscent } from "./ascentCache";
import {
  appendAscentAndLowEarthOrbitCoast,
  getLastDoglegDvKmS,
} from "./lowEarthOrbitCoast";
import { runLunarCapture } from "./lunarCapture";
import type { MissionResult, Sample } from "./missionTypes";
import { createPropState, fuelShipFrac } from "./propellant";
import { runFiniteTranslunarInjection } from "./translunarInjection";

/**
 * Full flight through soft landing at the lunar south pole.
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
  const translunarInjectionBurn = runFiniteTranslunarInjection(
    state,
    translunarInjectionDeltaV,
    samples,
    lastT,
    prop,
  );
  console.info(
    `[tothemoon] translunar injection finite burn Δv=${translunarInjectionBurn.dvDelivered.toFixed(3)} km/s · ` +
      `${(translunarInjectionBurn.burnS / 60).toFixed(2)} min · a=${(translunarInjectionBurn.accel / 0.00980665).toFixed(2)} g · ` +
      `ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );

  return runLunarCapture({
    state,
    samples,
    lastT,
    prop,
    moonPhase0,
    translunarInjectionDeltaV,
  });
}

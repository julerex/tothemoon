/**
 * Full flight path: ascent → LEO dogleg → finite TLI → ballistic n-body coast.
 *
 * Ends in lunar impact or ballistic flyby (no LOI/PDI/landing burns).
 */

import { getAscent } from "./ascentCache";
import { runBallisticCoast } from "./ballisticCoast";
import {
  appendAscentAndLeoCoast,
  getLastDoglegDvKmS,
} from "./leoCoast";
import type { MissionResult, Sample } from "./missionTypes";
import { createPropState, fuelShipFrac } from "./propellant";
import { runFiniteTli } from "./tli";

/**
 * Full flight: ascent → LEO dogleg → finite TLI → pure n-body ballistic coast.
 * `toa` is reserved for callers that still pass design perilune time.
 */
export function flyMission(
  moonPhase0: number,
  tliDv: number,
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
      tliDv,
      minMoonAlt: Infinity,
      ok: false,
      message: "Ascent failed",
    };
  }

  const state = appendAscentAndLeoCoast(samples, lastT, prop);
  console.info(
    `[tothemoon] LEO dogleg Δv=${getLastDoglegDvKmS().toFixed(3)} km/s · ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );
  const tliBurn = runFiniteTli(state, tliDv, samples, lastT, prop);
  console.info(
    `[tothemoon] TLI finite burn Δv=${tliBurn.dvDelivered.toFixed(3)} km/s · ` +
      `${(tliBurn.burnS / 60).toFixed(2)} min · a=${(tliBurn.accel / 0.00980665).toFixed(2)} g · ` +
      `ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );

  return runBallisticCoast({
    state,
    samples,
    lastT,
    prop,
    moonPhase0,
    tliDv,
  });
}

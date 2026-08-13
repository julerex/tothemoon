/**
 * Full flight path: ascent → low Earth orbit dogleg → finite translunar injection →
 * n-body coast → lunar orbit insertion → low lunar orbit → powered descent → land.
 */

import { getAscent } from "./ascentCache";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import {
  appendAscentAndLowEarthOrbitCoast,
  getLastDoglegDvKmS,
} from "./lowEarthOrbitCoast";
import { runLunarCapture } from "./lunarCapture";
import type { MissionResult, Sample } from "./missionTypes";
import { createPropState, fuelShipFrac } from "./propellant";
import { runFiniteTranslunarInjection } from "./translunarInjection";

function ascentFailResult(moonPhase0: number, translunarInjectionDeltaV: number): MissionResult {
  return {
    samples: [], durationS: 0, moonPhase0, translunarInjectionDeltaV,
    minMoonAlt: Infinity, ok: false, message: "Ascent failed",
  };
}

function logLeoDogleg(prop: ReturnType<typeof createPropState>): void {
  console.info(
    `[tothemoon] low Earth orbit dogleg Δv=${getLastDoglegDvKmS().toFixed(3)} km/s · ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );
}

function logTliBurn(
  burn: { dvDelivered: number; burnS: number; accel: number },
  prop: ReturnType<typeof createPropState>,
): void {
  console.info(
    `[tothemoon] translunar injection finite burn Δv=${burn.dvDelivered.toFixed(3)} km/s · ` +
      `${(burn.burnS / 60).toFixed(2)} min · a=${(burn.accel / 0.00980665).toFixed(2)} g · ` +
      `ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );
}

function captureArgs(
  state: ReturnType<typeof appendAscentAndLowEarthOrbitCoast>,
  samples: Sample[], lastT: { t: number }, prop: ReturnType<typeof createPropState>,
  epoch: EphemerisEpoch, translunarInjectionDeltaV: number, applyTcm: boolean,
) {
  return { state, samples, lastT, prop, moonPhase0: epoch.moonPhase0, translunarInjectionDeltaV, epoch, applyTcm };
}

function flyThroughCapture(
  epoch: EphemerisEpoch, translunarInjectionDeltaV: number,
  samples: Sample[], lastT: { t: number }, prop: ReturnType<typeof createPropState>,
  applyTcm: boolean,
): MissionResult {
  const state = appendAscentAndLowEarthOrbitCoast(samples, lastT, prop, epoch);
  logLeoDogleg(prop);
  const burn = runFiniteTranslunarInjection(state, translunarInjectionDeltaV, samples, lastT, prop, epoch);
  logTliBurn(burn, prop);
  return runLunarCapture(captureArgs(state, samples, lastT, prop, epoch, translunarInjectionDeltaV, applyTcm));
}

/**
 * Full flight through soft landing at the lunar south pole.
 * `toa` is reserved for callers that still pass design perilune time.
 */
export function flyMission(
  epoch: EphemerisEpoch,
  translunarInjectionDeltaV: number,
  toa?: number,
  applyTcm = false,
): MissionResult {
  void toa;
  if (!getAscent().ok) return ascentFailResult(epoch.moonPhase0, translunarInjectionDeltaV);
  const samples: Sample[] = [];
  const lastT = { t: -Infinity };
  const prop = createPropState(0);
  return flyThroughCapture(epoch, translunarInjectionDeltaV, samples, lastT, prop, applyTcm);
}

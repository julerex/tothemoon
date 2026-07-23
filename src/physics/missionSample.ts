import {
  burnProp,
  coastProp,
  fuelBoosterFrac,
  fuelShipFrac,
  thrustForceN,
  type PropState,
  type Tank,
} from "./propellant";
import type { CraftState } from "./integrator";
import { clone } from "./vec3";
import type { PhaseId, Sample } from "./missionTypes";

/**
 * Append a trajectory sample, optionally consuming propellant for HUD thrust.
 * Shared by LEO coast, TLI coast, and capture legs.
 */
export function pushSample(
  samples: Sample[],
  state: CraftState,
  phase: PhaseId,
  burning: boolean,
  force = false,
  minDt = 0,
  lastT = { t: -Infinity },
  prop: PropState | null = null,
  aKmS2 = 0,
  tank: Tank = "ship",
  /** When false, report thrust but do not deplete propellant (soft approach). */
  consumeFuel = true,
): void {
  if (!force && state.t - lastT.t < minDt) return;
  lastT.t = state.t;

  let thrustN = 0;
  let fuelBooster = 0;
  let fuelShip = 1;
  if (prop) {
    // Floor tiny midcourse accel so coast reads idle on the HUD
    const aUse = aKmS2 >= 1e-4 ? aKmS2 : 0;
    if (aUse > 0) {
      if (consumeFuel) {
        thrustN = burnProp(prop, state.t, aUse, tank);
      } else {
        thrustN = thrustForceN(prop, aUse);
        coastProp(prop, state.t);
      }
    } else {
      coastProp(prop, state.t);
    }
    fuelBooster = fuelBoosterFrac(prop);
    fuelShip = fuelShipFrac(prop);
  }

  samples.push({
    t: state.t,
    pos: clone(state.pos),
    vel: clone(state.vel),
    phase,
    burning,
    fuelBooster,
    fuelShip,
    thrustN,
    staged: prop?.staged ?? false,
  });
}

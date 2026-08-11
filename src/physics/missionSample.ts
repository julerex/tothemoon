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

function applySampleProp(
  prop: PropState, t: number, aUse: number, tank: Tank, consumeFuel: boolean,
): number {
  if (aUse > 0 && consumeFuel) return burnProp(prop, t, aUse, tank);
  if (aUse > 0) { const n = thrustForceN(prop, aUse); coastProp(prop, t); return n; }
  coastProp(prop, t);
  return 0;
}

function sampleThrustFuel(
  prop: PropState | null, t: number, aKmS2: number, tank: Tank, consumeFuel: boolean,
): { thrustN: number; fuelBooster: number; fuelShip: number } {
  if (!prop) return { thrustN: 0, fuelBooster: 0, fuelShip: 1 };
  const thrustN = applySampleProp(prop, t, aKmS2 >= 1e-4 ? aKmS2 : 0, tank, consumeFuel);
  return { thrustN, fuelBooster: fuelBoosterFrac(prop), fuelShip: fuelShipFrac(prop) };
}

function makeSample(
  state: CraftState, phase: PhaseId, burning: boolean, prop: PropState | null,
  thrustN: number, fuelBooster: number, fuelShip: number,
): Sample {
  return {
    t: state.t, pos: clone(state.pos), vel: clone(state.vel), phase, burning,
    fuelBooster, fuelShip, thrustN, staged: prop?.staged ?? false,
  };
}

/**
 * Append a trajectory sample, optionally consuming propellant for HUD thrust.
 * Shared by low Earth orbit coast, Translunar injection coast, and capture legs.
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
  const f = sampleThrustFuel(prop, state.t, aKmS2, tank, consumeFuel);
  samples.push(makeSample(state, phase, burning, prop, f.thrustN, f.fuelBooster, f.fuelShip));
}

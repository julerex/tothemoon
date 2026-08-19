/** Flight 13 loop state and sample helpers. */
import type { AccelOptions, CraftState, GravityModel } from "./integrator";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import type { PhaseId, Sample } from "./missionTypes";
import { fuelBoosterFrac, fuelShipFrac, type PropState } from "./propellant";
import type { V3 } from "./vec3";
import { clone } from "./vec3";

export function makeSample(
  state: CraftState,
  phase: PhaseId,
  burning: boolean,
  prop: PropState,
  thrustN: number,
): Sample {
  return { t: state.t, pos: clone(state.pos), vel: clone(state.vel), phase, burning, fuelBooster: fuelBoosterFrac(prop), fuelShip: fuelShipFrac(prop), thrustN, staged: prop.staged };
}

export function pushSample(
  samples: Sample[],
  state: CraftState,
  phase: PhaseId,
  burning: boolean,
  prop: PropState,
  thrustN: number,
): void {
  samples.push(makeSample(state, phase, burning, prop, thrustN));
}

export type BurnMode =
  | "boost"
  | "hot_stage"
  | "upper"
  | "relight"
  | "land"
  | "idle";

export type SteerGeo = {
  alt: number;
  vRad: number;
  vHoriz: number;
  vCirc: number;
  along: V3;
};
/** Options for {@link runFlight13Mission}. */
export type Flight13MissionOptions = {
  /**
   * Force model. Default `"nbody"` (Earth + Moon + solar tide + J₂ + drag).
   * `"earth"` drops Moon / Sun for an independent Earth-mechanics check.
   */
  gravity?: GravityModel;
  /** Explicit ephemeris; default {@link makeFlight13Epoch}. */
  epoch?: EphemerisEpoch;
};

export type F13Loop = {
  state: CraftState;
  samples: Sample[];
  prop: PropState;
  epoch: EphemerisEpoch;
  mode: BurnMode;
  hotStageT0: number;
  lastThrustN: number;
  lastBoostN: number;
  lastShipN: number;
  thrAcc: V3;
  accelOpts: AccelOptions;
  /** True after the terminal splash snap; remaining time is a kinematic float. */
  splashed: boolean;
  /** Mission time of the splash snap (s). */
  splashT: number;
  /** Geodetic pose of the float (set at splash; no target teleport). */
  floatLat: number;
  floatLon: number;
  /**
   * Inertial Earth-relative plane normal through pad@T+0 and splash@
   * {@link F13.SPLASH}. Frozen for the run.
   */
  interceptN: V3;
};


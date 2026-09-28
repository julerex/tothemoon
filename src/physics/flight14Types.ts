/** Flight 14 loop state. Shares sample helpers with Flight 13. */
import type { AccelOptions, CraftState, GravityModel } from "./integrator";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import type { Sample } from "./missionTypes";
import type { PropState } from "./propellant";
import type { V3 } from "./vec3";

export { makeSample, pushSample } from "./flight13Types";
export type { SteerGeo } from "./flight13Types";

export type BurnMode =
  | "boost"
  | "hot_stage"
  | "upper"
  | "insert"
  | "deorbit"
  | "land"
  | "idle";

/** Options for {@link runFlight14Mission}. */
export type Flight14MissionOptions = {
  /**
   * Force model. Default `"nbody"` (Earth + Moon + Sun + J₂ + drag).
   * `"earth"` drops Moon / Sun for an independent Earth-mechanics check.
   */
  gravity?: GravityModel;
  /** Explicit ephemeris; default {@link makeFlight14Epoch}. */
  epoch?: EphemerisEpoch;
};

export type F14Loop = {
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
  splashed: boolean;
  splashT: number;
  floatLat: number;
  floatLon: number;
  interceptN: V3;
};

/** Flight 13 mission entry: integrate liftoff through float hold. */
import { F13 } from "./flight13Timeline";
import { pushSample } from "./flight13Types";
import { peakForceN } from "./flight13Steer";
import { makeFlight13ThrustFn } from "./flight13Thrust";
import { finalizeFlight13, flight13Step, initFlight13Loop } from "./flight13Splash";
import type { MissionResult } from "./missionTypes";
import type { Flight13MissionOptions } from "./flight13Types";

export function runFlight13Mission(opts?: Flight13MissionOptions): MissionResult {
  const loop = initFlight13Loop(opts);
  const thrustFn = makeFlight13ThrustFn(loop);
  pushSample(loop.samples, loop.state, "launch", true, loop.prop, peakForceN("boost", 0.98));
  const maxT = F13.END;
  while (loop.state.t < maxT) {
    if (!flight13Step(loop, thrustFn, maxT)) break;
  }
  return finalizeFlight13(loop);
}

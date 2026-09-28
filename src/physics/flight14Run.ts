/** Flight 14 mission entry: integrate liftoff through float hold. */
import { F14 } from "./flight14Timeline";
import { pushSample } from "./flight14Types";
import { peakForceN } from "./flight14Steer";
import { makeFlight14ThrustFn } from "./flight14Thrust";
import { finalizeFlight14, flight14Step, initFlight14Loop } from "./flight14Splash";
import type { MissionResult } from "./missionTypes";
import type { Flight14MissionOptions } from "./flight14Types";

export function runFlight14Mission(opts?: Flight14MissionOptions): MissionResult {
  const loop = initFlight14Loop(opts);
  const thrustFn = makeFlight14ThrustFn(loop);
  pushSample(loop.samples, loop.state, "launch", true, loop.prop, peakForceN("boost", 0.98));
  const maxT = F14.END;
  while (loop.state.t < maxT) {
    if (!flight14Step(loop, thrustFn, maxT)) break;
  }
  return finalizeFlight14(loop);
}

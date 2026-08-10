/**
 * Flight 13 epoch: daytime Starbase sun elevation at liftoff.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { starbaseSunElev } from "./earthFrame.ts";
import { clearMissionClockEpochUtc } from "./epoch.ts";
import { applyFlight13Epoch } from "./flight13Epoch.ts";
import {
  isHorizonsEnabled,
  setHorizonsEnabled,
} from "./horizonsEpoch.ts";

describe("applyFlight13Epoch", () => {
  it("puts the Sun above the Starbase horizon at the real window-open time", () => {
    const prevHorizons = isHorizonsEnabled();
    try {
      const { padSunElev } = applyFlight13Epoch(0, 3600);
      const elev = starbaseSunElev(0);
      // 5:45 p.m. CDT in late July ≈ mid-afternoon elev (~30°+), not night
      assert.ok(
        elev > 0.2,
        `expected daytime sun elev at 5:45 p.m. CDT, got sin(el)=${elev.toFixed(3)}`,
      );
      assert.ok(Math.abs(elev - padSunElev) < 1e-9);
      assert.equal(isHorizonsEnabled(), false);
    } finally {
      clearMissionClockEpochUtc();
      setHorizonsEnabled(prevHorizons);
    }
  });
});

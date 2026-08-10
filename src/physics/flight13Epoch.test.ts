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
  it("puts the Sun above the Starbase horizon at liftoff", () => {
    const prevHorizons = isHorizonsEnabled();
    try {
      applyFlight13Epoch(0, 3600);
      const elev = starbaseSunElev(0);
      // sin(el) > 0.15 ≈ +9° — clear afternoon daylight at 5:45 p.m. CDT theater
      assert.ok(
        elev > 0.15,
        `expected daytime sun elev, got sin(el)=${elev.toFixed(3)}`,
      );
      assert.equal(isHorizonsEnabled(), false);
    } finally {
      clearMissionClockEpochUtc();
      setHorizonsEnabled(prevHorizons);
    }
  });
});

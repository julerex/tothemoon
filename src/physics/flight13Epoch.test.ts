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
  it("puts the Sun well above the Starbase horizon at liftoff", () => {
    const prevHorizons = isHorizonsEnabled();
    try {
      const { padSunElev } = applyFlight13Epoch(0, 3600);
      const elev = starbaseSunElev(0);
      assert.ok(
        elev > 0.55,
        `expected strong daytime sun elev, got sin(el)=${elev.toFixed(3)}`,
      );
      assert.ok(Math.abs(elev - padSunElev) < 1e-9);
      assert.equal(isHorizonsEnabled(), false);
    } finally {
      clearMissionClockEpochUtc();
      setHorizonsEnabled(prevHorizons);
    }
  });
});

/**
 * Flight 14 epoch: morning Starbase sun at liftoff.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { starbaseSunElev } from "./earthFrame.ts";
import { applyFlight14Epoch } from "./flight14Epoch.ts";
import { FLIGHT14_LIFTOFF_UTC_MS } from "./epoch.ts";

describe("applyFlight14Epoch", () => {
  it("puts the Sun above the Starbase horizon at the flown morning liftoff", () => {
    const { epoch, padSunElev, liftoffUtcMs } = applyFlight14Epoch(0, 3600);
    const elev = starbaseSunElev(0, epoch);
    assert.equal(liftoffUtcMs, FLIGHT14_LIFTOFF_UTC_MS);
    assert.ok(
      elev > 0.05,
      `expected morning sun at Starbase, got sin(el)=${elev.toFixed(3)}`,
    );
    assert.ok(Math.abs(elev - padSunElev) < 1e-9);
    assert.equal(epoch.useHorizons, false);
    assert.ok(epoch.clockUtcMsAtT0 != null);
  });
});

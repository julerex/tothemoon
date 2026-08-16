/**
 * Flight 13 epoch: daytime Starbase sun elevation at liftoff
 * and daylight at the Indian Ocean splash (webcast match).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { starbaseSunElev, sunElevAtGeodetic } from "./earthFrame.ts";
import { applyFlight13Epoch } from "./flight13Epoch.ts";
import {
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
} from "./flight13Corridor.ts";
import { F13 } from "./flight13Mission.ts";

describe("applyFlight13Epoch", () => {
  it("puts the Sun above the Starbase horizon at the flown liftoff time", () => {
    const { epoch, padSunElev } = applyFlight13Epoch(0, 3600);
    const elev = starbaseSunElev(0, epoch);
    // Afternoon at Starbase (5:51 p.m. CDT)
    assert.ok(
      elev > 0.2,
      `expected daytime sun elev at 5:51 p.m. CDT, got sin(el)=${elev.toFixed(3)}`,
    );
    assert.ok(Math.abs(elev - padSunElev) < 1e-9);
    assert.equal(epoch.useHorizons, false);
    assert.ok(epoch.clockUtcMsAtT0 != null);
  });

  it("puts the splash site in daylight at the public splash mark", () => {
    const { epoch } = applyFlight13Epoch(0, F13.SPLASH);
    const splash = sunElevAtGeodetic(
      F13.SPLASH,
      FLIGHT13_SPLASH_LAT,
      FLIGHT13_SPLASH_LON,
      epoch,
    );
    // Winter morning at 107°E / 23:56 UTC — sun is up, not high noon.
    // A theater sun-phase nudge would push this toward 0.25+.
    assert.ok(
      splash > 0,
      `expected daylight at splash, got sin(el)=${splash.toFixed(3)}`,
    );
    assert.ok(
      splash < 0.22,
      `splash sun too high (sin(el)=${splash.toFixed(3)}) — possible sun-phase nudge`,
    );
    const pad = starbaseSunElev(0, epoch);
    assert.ok(pad > 0.2, `pad must stay in afternoon sun, sin(el)=${pad.toFixed(3)}`);
  });
});

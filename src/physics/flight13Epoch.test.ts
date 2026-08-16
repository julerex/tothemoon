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
  it("puts the Sun above the Starbase horizon at the real window-open time", () => {
    const { epoch, padSunElev } = applyFlight13Epoch(0, 3600);
    const elev = starbaseSunElev(0, epoch);
    // Afternoon at Starbase (theater lighting also keeps splash in daylight)
    assert.ok(
      elev > 0.2,
      `expected daytime sun elev at 5:45 p.m. CDT, got sin(el)=${elev.toFixed(3)}`,
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
    // Webcast splash is full daylight (blue sky, sun-glint ocean), not night
    assert.ok(
      splash > 0.25,
      `expected daylight at splash, got sin(el)=${splash.toFixed(3)}`,
    );
    const pad = starbaseSunElev(0, epoch);
    assert.ok(pad > 0.2, `pad must stay in afternoon sun, sin(el)=${pad.toFixed(3)}`);
  });
});

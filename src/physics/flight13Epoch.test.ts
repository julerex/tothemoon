/**
 * Flight 13 epoch: daytime Starbase sun elevation at liftoff
 * and daylight at the Indian Ocean splash (webcast match).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { starbaseSunElev, sunElevAtGeodetic } from "./earthFrame.ts";
import { applyFlight13Epoch } from "./flight13Epoch.ts";
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

  it("puts the eastern Indian Ocean in morning daylight at the public splash mark", () => {
    const { epoch } = applyFlight13Epoch(0, F13.SPLASH);
    // Eastern Indian Ocean, west of Australia — a region, not an aim point.
    // Winter morning near 23:56 UTC: sun up east of ~105°E, not high noon.
    for (const latDeg of [-18, -24]) {
      for (const lonDeg of [105, 112]) {
        const splash = sunElevAtGeodetic(
          F13.SPLASH,
          (latDeg * Math.PI) / 180,
          (lonDeg * Math.PI) / 180,
          epoch,
        );
        assert.ok(
          splash > 0,
          `expected daylight at ${latDeg}°, ${lonDeg}°E, got sin(el)=${splash.toFixed(3)}`,
        );
        assert.ok(
          splash < 0.45,
          `sun too high at ${latDeg}°, ${lonDeg}°E (sin(el)=${splash.toFixed(3)})`,
        );
      }
    }
    const pad = starbaseSunElev(0, epoch);
    assert.ok(pad > 0.2, `pad must stay in afternoon sun, sin(el)=${pad.toFixed(3)}`);
  });
});

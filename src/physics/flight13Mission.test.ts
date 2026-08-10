/**
 * Unit tests for Flight 13 mission integration.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { altitudeEarth } from "./integrator.ts";
import { F13, runFlight13Mission } from "./flight13Mission.ts";

describe("runFlight13Mission", () => {
  const result = runFlight13Mission();

  it("completes successfully with splashdown", () => {
    assert.equal(result.ok, true);
    assert.ok(result.samples.length > 100);
    assert.equal(result.samples[result.samples.length - 1]!.phase, "splashdown");
    assert.ok(result.durationS > F13.SPLASH - 5);
    assert.ok(result.durationS < F13.SPLASH + 30);
  });

  it("stages near the public hot-stage mark", () => {
    assert.ok(result.stageT != null);
    assert.ok(
      Math.abs((result.stageT as number) - F13.HOT_STAGE) < 15,
      `stageT ${result.stageT}`,
    );
  });

  it("follows launch → ascent → coast → entry → descent → splashdown", () => {
    const phases: string[] = [];
    for (const s of result.samples) {
      if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    }
    assert.deepEqual(phases, [
      "launch",
      "ascent",
      "coast",
      "entry",
      "descent",
      "splashdown",
    ]);
  });

  it("stays suborbital (peak altitude tens–hundreds of km, not escape)", () => {
    let maxAlt = 0;
    for (const s of result.samples) {
      const a = altitudeEarth(s.t, s.pos);
      if (a > maxAlt) maxAlt = a;
    }
    assert.ok(maxAlt > 80, `maxAlt too low ${maxAlt}`);
    assert.ok(maxAlt < 2000, `maxAlt too high ${maxAlt}`);
    // peakSpeedKmS is heliocentric |v| (~30 km/s near Earth) — ensure finite
    assert.ok(
      Number.isFinite(result.peakSpeedKmS) && (result.peakSpeedKmS ?? 0) > 20,
      `heliocentric peak ${result.peakSpeedKmS}`,
    );
  });

  it("burns on ascent and is coasting after SECO", () => {
    const early = result.samples.find((s) => s.t > 30 && s.t < 100);
    assert.ok(early?.burning);
    const coast = result.samples.find((s) => s.phase === "coast");
    assert.ok(coast);
    assert.equal(coast!.burning, false);
  });

  it("coasts at high altitude through mid-mission (not surface hover)", () => {
    // At T+20 min the free coast should still be well above the atmosphere
    const mid = result.samples.reduce((best, cur) =>
      Math.abs(cur.t - 1200) < Math.abs(best.t - 1200) ? cur : best,
    );
    const a = altitudeEarth(mid.t, mid.pos);
    assert.ok(a > 150, `mid-coast alt ${a} km — expected lofted suborbital`);
  });

  it("enters with remaining altitude near the public entry mark", () => {
    const ent = result.samples.reduce((best, cur) =>
      Math.abs(cur.t - F13.ENTRY) < Math.abs(best.t - F13.ENTRY) ? cur : best,
    );
    const a = altitudeEarth(ent.t, ent.pos);
    assert.ok(a > 20, `entry alt ${a} km too low`);
    assert.ok(a < 200, `entry alt ${a} km too high`);
  });

  it("fires a landing burn before splashdown", () => {
    const land = result.samples.find(
      (s) => s.phase === "descent" && s.burning && s.thrustN > 1e3,
    );
    assert.ok(land, "expected descent burn sample");
    assert.ok(land!.t >= F13.LAND_BURN - 150, `land burn t=${land!.t}`);
  });
});

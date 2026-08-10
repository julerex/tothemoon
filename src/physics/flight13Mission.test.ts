/**
 * Unit tests for Flight 13 mission integration.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { altitudeEarth, getBodies } from "./integrator.ts";
import { F13, runFlight13Mission } from "./flight13Mission.ts";
import { len, sub, v3 } from "./vec3.ts";

describe("runFlight13Mission", () => {
  const result = runFlight13Mission();
  const _tmp = v3();

  it("completes successfully with splashdown", () => {
    assert.equal(result.ok, true);
    assert.ok(result.samples.length > 100);
    assert.equal(result.samples[result.samples.length - 1]!.phase, "splashdown");
    // Natural early splash is OK (dynamics-driven); still a full suborbital flight
    assert.ok(result.durationS > 35 * 60, `duration ${result.durationS}s too short`);
    assert.ok(result.durationS < F13.SPLASH + 60, `duration ${result.durationS}s too long`);
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
    const mid = result.samples.reduce((best, cur) =>
      Math.abs(cur.t - 1200) < Math.abs(best.t - 1200) ? cur : best,
    );
    const a = altitudeEarth(mid.t, mid.pos);
    assert.ok(a > 150, `mid-coast alt ${a} km — expected lofted suborbital`);
  });

  it("has a lofted free coast (no multi-minute surface skid before entry)", () => {
    // Count consecutive samples with alt < 3 km during coast — should be none
    let maxIdle = 0;
    let cur = 0;
    for (const s of result.samples) {
      if (s.phase !== "coast" && s.phase !== "entry") {
        maxIdle = Math.max(maxIdle, cur);
        cur = 0;
        continue;
      }
      const a = altitudeEarth(s.t, s.pos);
      const b = getBodies(s.t);
      sub(_tmp, s.vel, b.earthVel);
      if (a < 3 && len(_tmp) < 0.3) cur += 1;
      else {
        maxIdle = Math.max(maxIdle, cur);
        cur = 0;
      }
    }
    maxIdle = Math.max(maxIdle, cur);
    assert.ok(
      maxIdle < 40,
      `surface-idle streak ${maxIdle} samples — approach glide / hover regress`,
    );
  });

  it("fires a retrograde relight deorbit near the public mark", () => {
    const relight = result.samples.filter(
      (s) =>
        s.burning &&
        s.t >= F13.RELIGHT - 1 &&
        s.t <= F13.RELIGHT_END + 2 &&
        s.thrustN > 1e3,
    );
    assert.ok(relight.length > 5, "expected relight burn samples");
  });

  it("fires a landing burn before splashdown", () => {
    const land = result.samples.find(
      (s) => s.phase === "descent" && s.burning && s.thrustN > 1e3,
    );
    assert.ok(land, "expected descent burn sample");
    // May light earlier than public T+65 once aero has bled speed
    assert.ok(land!.t >= F13.ENTRY - 120, `land burn t=${land!.t}`);
  });

  it("SECO is near-circular at insert altitude (low radial rate)", () => {
    let seco = result.samples[0]!;
    for (const s of result.samples) {
      if (s.phase === "ascent" && s.burning) seco = s;
    }
    const a = altitudeEarth(seco.t, seco.pos);
    const b = getBodies(seco.t);
    sub(_tmp, seco.vel, b.earthVel);
    const v = len(_tmp);
    // Radial rate from pos·vel
    const rx = seco.pos.x - b.earth.x;
    const ry = seco.pos.y - b.earth.y;
    const rz = seco.pos.z - b.earth.z;
    const r = Math.hypot(rx, ry, rz) || 1;
    const vr = (seco.vel.x - b.earthVel.x) * (rx / r) +
      (seco.vel.y - b.earthVel.y) * (ry / r) +
      (seco.vel.z - b.earthVel.z) * (rz / r);
    assert.ok(a > 120, `SECO alt ${a}`);
    assert.ok(v > 7.0 && v < 8.2, `SECO v ${v}`);
    assert.ok(Math.abs(vr) < 0.45, `SECO vr ${vr}`);
  });
});

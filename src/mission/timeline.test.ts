import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PhaseId, Sample } from "../physics/mission.ts";
import { v3 } from "../physics/vec3.ts";
import {
  autoSpeedForPhase,
  buildTimeline,
  PHASE_AUTO_SPEED,
} from "./timeline.ts";

function sample(
  t: number,
  phase: PhaseId,
  opts: Partial<Sample> = {},
): Sample {
  return {
    t,
    pos: v3(t, 0, 0),
    vel: v3(1, 0, 0),
    phase,
    burning: false,
    fuelBooster: opts.fuelBooster ?? (phase === "launch" || phase === "ascent" ? 1 : 0),
    fuelShip: opts.fuelShip ?? 1,
    thrustN: opts.thrustN ?? 0,
    staged: opts.staged ?? !(phase === "launch" || phase === "ascent"),
  };
}

describe("buildTimeline", () => {
  it("builds contiguous segments covering [0, duration]", () => {
    const samples: Sample[] = [
      sample(0, "launch"),
      sample(10, "launch"),
      sample(20, "ascent"),
      sample(100, "leo", { staged: true }),
      sample(200, "tli", { staged: true }),
      sample(300, "coast", { staged: true }),
      sample(900, "landed", { staged: true }),
    ];
    const tl = buildTimeline(samples, 1000);
    assert.ok(tl.segments.length >= 4);
    assert.equal(tl.segments[0]!.u0, 0);
    assert.equal(tl.segments[tl.segments.length - 1]!.u1, 1);
    for (let i = 1; i < tl.segments.length; i++) {
      assert.equal(tl.segments[i]!.t0, tl.segments[i - 1]!.t1);
    }
  });

  it("emits liftoff, staging, and touchdown events", () => {
    const samples: Sample[] = [
      sample(0, "launch", { staged: false }),
      sample(50, "ascent", { staged: false, fuelBooster: 0.5 }),
      sample(100, "leo", { staged: true, fuelBooster: 0 }),
      sample(200, "tli", { staged: true }),
      sample(300, "coast", { staged: true }),
      sample(400, "approach", { staged: true }),
      sample(500, "braking", { staged: true }),
      sample(600, "descent", { staged: true }),
      sample(700, "landed", { staged: true }),
    ];
    const tl = buildTimeline(samples, 700);
    const ids = tl.events.map((e) => e.id);
    assert.ok(ids.includes("liftoff"));
    assert.ok(ids.includes("staging"));
    assert.ok(ids.includes("tli"));
    assert.ok(ids.includes("coast"));
    assert.ok(ids.includes("touchdown"));
    // Monotonic event times
    for (let i = 1; i < tl.events.length; i++) {
      assert.ok(tl.events[i]!.t >= tl.events[i - 1]!.t);
    }
  });

  it("autoSpeedForPhase slows burns and races coast", () => {
    assert.ok(autoSpeedForPhase("coast") > autoSpeedForPhase("ascent"));
    assert.ok(autoSpeedForPhase("ascent") > autoSpeedForPhase("landed"));
    assert.equal(autoSpeedForPhase("coast"), PHASE_AUTO_SPEED.coast);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { downsampleTrajectory } from "./missionDownsample.ts";
import type { MissionResult, Sample } from "./missionTypes.ts";

function sample(
  t: number,
  phase: Sample["phase"],
  opts: { burning?: boolean; staged?: boolean } = {},
): Sample {
  return {
    t,
    pos: { x: t, y: 0, z: 0 },
    vel: { x: 1, y: 0, z: 0 },
    phase,
    burning: opts.burning ?? false,
    fuelBooster: opts.staged ? 0 : 1,
    fuelShip: 0.8,
    thrustN: opts.burning ? 1e6 : 0,
    staged: opts.staged ?? (phase !== "launch" && phase !== "ascent"),
  };
}

function result(samples: Sample[]): MissionResult {
  return {
    samples,
    durationS: samples[samples.length - 1]?.t ?? 0,
    moonPhase0: 0,
    translunarInjectionDeltaV: 3,
    minMoonAlt: 1000,
    ok: true,
    message: "test",
  };
}

describe("downsampleTrajectory", () => {
  it("returns the same result when under the cap", () => {
    const r = result([
      sample(0, "launch"),
      sample(10, "ascent"),
      sample(20, "lowEarthOrbit", { staged: true }),
    ]);
    const out = downsampleTrajectory(r, 100);
    assert.equal(out.samples.length, 3);
    assert.equal(out.samples, r.samples);
  });

  it("keeps phase edges and burn samples when thinning", () => {
    const samples: Sample[] = [sample(0, "launch")];
    for (let i = 1; i < 200; i++) {
      samples.push(sample(i, "coast", { staged: true }));
    }
    samples.push(sample(200, "translunarInjection", { burning: true, staged: true }));
    samples.push(sample(250, "coast", { staged: true }));
    const out = downsampleTrajectory(result(samples), 40);
    assert.ok(out.samples.length <= 40 + 5); // priority may slightly exceed
    assert.equal(out.samples[0]!.phase, "launch");
    assert.ok(out.samples.some((s) => s.phase === "translunarInjection" && s.burning));
    assert.equal(out.samples[out.samples.length - 1]!.t, 250);
  });
});

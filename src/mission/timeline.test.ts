import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PhaseId, Sample } from "../physics/mission.ts";
import { v3 } from "../physics/vec3.ts";
import { buildTimeline, phaseContextAt } from "./timeline.ts";

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
    burning: opts.burning ?? false,
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
      sample(100, "lowEarthOrbit", { staged: true }),
      sample(200, "translunarInjection", { staged: true }),
      sample(300, "coast", { staged: true }),
      sample(900, "impact", { staged: true }),
    ];
    const tl = buildTimeline(samples, 1000);
    assert.ok(tl.segments.length >= 4);
    assert.equal(tl.segments[0]!.u0, 0);
    assert.equal(tl.segments[tl.segments.length - 1]!.u1, 1);
    for (let i = 1; i < tl.segments.length; i++) {
      assert.equal(tl.segments[i]!.t0, tl.segments[i - 1]!.t1);
    }
  });

  it("emits liftoff, staging, dogleg, and impact events", () => {
    const samples: Sample[] = [
      sample(0, "launch", { staged: false }),
      sample(50, "ascent", { staged: false, fuelBooster: 0.5 }),
      sample(100, "lowEarthOrbit", { staged: true, fuelBooster: 0 }),
      sample(120, "lowEarthOrbit", {
        staged: true,
        fuelBooster: 0,
        burning: true,
        thrustN: 5e5,
      }),
      sample(200, "translunarInjection", { staged: true }),
      sample(300, "coast", { staged: true }),
      sample(700, "impact", { staged: true }),
    ];
    const tl = buildTimeline(samples, 700);
    const ids = tl.events.map((e) => e.id);
    assert.ok(ids.includes("liftoff"));
    assert.ok(ids.includes("staging"));
    assert.ok(ids.includes("boostback"));
    assert.ok(ids.includes("booster-catch"));
    assert.ok(ids.includes("dogleg"));
    assert.ok(ids.includes("translunarInjection"));
    assert.ok(ids.includes("coast"));
    assert.ok(ids.includes("impact"));
    for (let i = 1; i < tl.events.length; i++) {
      assert.ok(tl.events[i]!.t >= tl.events[i - 1]!.t);
    }
  });

  it("returns empty segments for empty samples", () => {
    const tl = buildTimeline([], 100);
    assert.equal(tl.segments.length, 0);
    assert.equal(tl.events.length, 0);
    assert.equal(tl.durationS, 100);
  });

  it("assigns short labels and normalized u for each segment", () => {
    const samples: Sample[] = [
      sample(0, "launch"),
      sample(50, "ascent"),
      sample(100, "lowEarthOrbit", { staged: true }),
    ];
    const tl = buildTimeline(samples, 200);
    for (const seg of tl.segments) {
      assert.ok(seg.shortLabel.length > 0);
      assert.ok(seg.u0 >= 0 && seg.u1 <= 1);
      assert.ok(seg.u1 >= seg.u0);
      assert.equal(seg.u0, seg.t0 / 200);
      assert.equal(seg.u1, seg.t1 / 200);
    }
  });

  it("emits flight-test beats for entry / splashdown packs", () => {
    const samples: Sample[] = [
      sample(0, "launch", { staged: false }),
      sample(50, "ascent", { staged: false }),
      sample(140, "ascent", {
        staged: true,
        burning: true,
        thrustN: 2e6,
      }),
      sample(150, "coast", { staged: true, burning: false }),
      sample(800, "coast", {
        staged: true,
        burning: true,
        thrustN: 5e5,
      }),
      sample(900, "coast", { staged: true, burning: false }),
      sample(2000, "entry", { staged: true }),
      sample(2500, "descent", { staged: true, burning: true, thrustN: 1e6 }),
      sample(2800, "splashdown", { staged: true }),
    ];
    const tl = buildTimeline(samples, 2800);
    const ids = new Set(tl.events.map((e) => e.id));
    assert.ok(ids.has("max-q"));
    assert.ok(ids.has("seco"));
    assert.ok(ids.has("payload-start"));
    assert.ok(ids.has("payload-complete"));
    assert.ok(ids.has("relight"));
    assert.ok(ids.has("entry"));
    assert.ok(ids.has("splashdown"));
    assert.ok(ids.has("land-flip"));
    assert.ok(ids.has("land-3to2"));
    assert.ok(ids.has("land-2to1"));
    assert.ok(ids.has("splash-drone"));
  });

  it("emits touchdown for soft-land packs", () => {
    const samples: Sample[] = [
      sample(0, "launch"),
      sample(100, "coast", { staged: true }),
      sample(200, "descent", { staged: true }),
      sample(300, "landed", { staged: true }),
    ];
    const tl = buildTimeline(samples, 300);
    assert.ok(tl.events.some((e) => e.id === "touchdown"));
  });

  it("dedupes events that share an id", () => {
    // Two launch-like segments would try to emit liftoff once only via phase walk
    const samples: Sample[] = [
      sample(0, "launch"),
      sample(10, "launch"),
      sample(20, "ascent"),
      sample(100, "lowEarthOrbit", { staged: true }),
      sample(200, "translunarInjection", { staged: true }),
      sample(300, "coast", { staged: true }),
    ];
    const tl = buildTimeline(samples, 300);
    const liftoff = tl.events.filter((e) => e.id === "liftoff");
    assert.equal(liftoff.length, 1);
  });
});

describe("phaseContextAt", () => {
  it("returns empty context when there are no segments", () => {
    const ctx = phaseContextAt([], 10);
    assert.equal(ctx.phase, null);
    assert.equal(ctx.label, "—");
    assert.equal(ctx.nextLabel, null);
    assert.equal(ctx.remainingS, 0);
  });

  it("reports time until the first segment when t is early", () => {
    const tl = buildTimeline(
      [sample(0, "launch"), sample(50, "ascent"), sample(100, "coast", { staged: true })],
      200,
    );
    const ctx = phaseContextAt(tl.segments, -30);
    assert.equal(ctx.nextLabel, tl.segments[0]!.label);
    assert.equal(ctx.elapsedS, 0);
    assert.equal(ctx.remainingS, 30);
  });

  it("names the next phase and remaining time inside a segment", () => {
    const tl = buildTimeline(
      [sample(0, "launch"), sample(50, "ascent"), sample(100, "coast", { staged: true })],
      200,
    );
    const launch = tl.segments[0]!;
    const mid = (launch.t0 + launch.t1) / 2;
    const ctx = phaseContextAt(tl.segments, mid);
    assert.equal(ctx.phase, "launch");
    assert.equal(ctx.nextLabel, tl.segments[1]!.label);
    assert.ok(Math.abs(ctx.elapsedS - (mid - launch.t0)) < 1e-9);
    assert.ok(Math.abs(ctx.remainingS - (launch.t1 - mid)) < 1e-9);
  });

  it("has no next phase on the last segment", () => {
    const tl = buildTimeline(
      [sample(0, "launch"), sample(50, "ascent"), sample(100, "coast", { staged: true })],
      200,
    );
    const last = tl.segments[tl.segments.length - 1]!;
    const ctx = phaseContextAt(tl.segments, last.t0 + 1);
    assert.equal(ctx.phase, last.phase);
    assert.equal(ctx.nextLabel, null);
    assert.ok(ctx.remainingS >= 0);
  });
});

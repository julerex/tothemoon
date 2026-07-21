import assert from "node:assert/strict";
import { describe, it } from "node:test";
import packed from "../data/trajectory.json" with { type: "json" };
import {
  assertTrajectoryInvariants,
  checkTrajectoryInvariants,
  EXPECTED_PHASE_ORDER,
  unpackPackedForInvariants,
} from "./trajectoryInvariants.ts";
import { buildTimeline } from "../mission/timeline.ts";
import type { Sample } from "./mission.ts";

describe("baked trajectory.json invariants", () => {
  const traj = unpackPackedForInvariants(
    packed as unknown as Parameters<typeof unpackPackedForInvariants>[0],
  );

  it("passes structural invariant suite", () => {
    const issues = checkTrajectoryInvariants(traj);
    assert.deepEqual(
      issues,
      [],
      issues.map((i) => `[${i.code}] ${i.message}`).join("\n"),
    );
  });

  it("assertTrajectoryInvariants does not throw", () => {
    assert.doesNotThrow(() => assertTrajectoryInvariants(traj));
  });

  it("contains every mission phase in order", () => {
    const seq: string[] = [];
    for (const s of traj.samples) {
      if (seq[seq.length - 1] !== s.phase) seq.push(s.phase);
    }
    assert.deepEqual(seq, [...EXPECTED_PHASE_ORDER]);
  });

  it("builds a timeline with markers and events", () => {
    const samples = traj.samples as Sample[];
    const tl = buildTimeline(samples, traj.durationS);
    assert.ok(tl.segments.length >= EXPECTED_PHASE_ORDER.length - 1);
    assert.ok(tl.events.some((e) => e.id === "liftoff"));
    assert.ok(tl.events.some((e) => e.id === "touchdown"));
    // Coast should dominate wall-clock progress on the scrubber
    const coast = tl.segments.find((s) => s.phase === "coast");
    assert.ok(coast);
    assert.ok(coast!.u1 - coast!.u0 > 0.5);
  });

  it("has finite positions within solar-system-ish bounds", () => {
    for (const s of traj.samples) {
      const r = Math.hypot(s.pos.x, s.pos.y, s.pos.z);
      assert.ok(r < 2e6, `position |r|=${r} looks unbounded`);
      assert.ok(Number.isFinite(s.vel.x));
    }
  });
});

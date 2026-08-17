import assert from "node:assert/strict";
import { describe, it } from "node:test";
import packed from "../data/trajectory.json" with { type: "json" };
import {
  assertTrajectoryInvariants,
  checkTrajectoryInvariants,
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

  it("contains ballistic phases in order through coast", () => {
    const seq: string[] = [];
    for (const s of traj.samples) {
      if (seq[seq.length - 1] !== s.phase) seq.push(s.phase);
    }
    assert.deepEqual(seq, ["launch", "ascent", "lowEarthOrbit", "translunarInjection", "coast"]);
    assert.equal(seq[seq.length - 1], "coast");
  });

  it("builds a timeline with markers and events", () => {
    const samples = traj.samples as Sample[];
    const tl = buildTimeline(samples, traj.durationS);
    assert.ok(tl.segments.length >= 4);
    assert.ok(tl.events.some((e) => e.id === "liftoff"));
    assert.ok(
      tl.events.some(
        (e) =>
          e.id === "coast" ||
          e.id === "translunarInjection",
      ),
    );
    // Coast still dominates wall-clock progress on the scrubber
    const coast = tl.segments.find((s) => s.phase === "coast");
    assert.ok(coast);
    assert.ok(coast!.u1 - coast!.u0 > 0.4);
  });

  it("has finite positions within solar-system-ish bounds", () => {
    // Heliocentric frame: Earth ~1 AU ≈ 1.5e8 km; allow out to ~2 AU
    for (const s of traj.samples) {
      const r = Math.hypot(s.pos.x, s.pos.y, s.pos.z);
      assert.ok(r < 3e8, `position |r|=${r} looks unbounded`);
      assert.ok(Number.isFinite(s.vel.x));
    }
  });

  it("ships v2 pack metadata (minMoonAlt, peakSpeed, stageT)", () => {
    const p = packed as {
      version?: number;
      minMoonAlt?: number;
      peakSpeedKmS?: number;
      stageT?: number | null;
    };
    assert.ok((p.version ?? 0) >= 2, `version=${p.version}`);
    assert.ok(Number.isFinite(p.minMoonAlt));
    assert.ok(Number.isFinite(p.peakSpeedKmS) && (p.peakSpeedKmS as number) > 0);
    assert.ok(p.stageT == null || (Number.isFinite(p.stageT) && p.stageT! > 0));
    // stage-out should land inside the sample series when present
    if (p.stageT != null) {
      const staged = traj.samples.find((s) => s.staged);
      assert.ok(staged);
      assert.ok(Math.abs(staged!.t - p.stageT) < 5);
    }
  });
});

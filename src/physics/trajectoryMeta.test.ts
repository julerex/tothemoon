import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePeakSpeedKmS,
  computeStageT,
  deriveTrajectoryMeta,
  resolveTrajectoryMeta,
  TRAJECTORY_PACK_VERSION,
} from "./trajectoryMeta.ts";

function sample(
  t: number,
  opts: {
    vel?: { x: number; y: number; z: number };
    staged?: boolean;
    phase?: string;
    pos?: { x: number; y: number; z: number };
  } = {},
) {
  return {
    t,
    pos: opts.pos ?? { x: 7000, y: 0, z: 0 },
    vel: opts.vel ?? { x: 0, y: 7, z: 0 },
    phase: opts.phase ?? "leo",
    staged: opts.staged ?? false,
  };
}

describe("TRAJECTORY_PACK_VERSION", () => {
  it("is v2 for peak speed + stage time fields", () => {
    assert.equal(TRAJECTORY_PACK_VERSION, 2);
  });
});

describe("computePeakSpeedKmS", () => {
  it("returns the max |v| over samples", () => {
    const peak = computePeakSpeedKmS([
      sample(0, { vel: { x: 3, y: 4, z: 0 } }), // 5
      sample(1, { vel: { x: 0, y: 0, z: 12 } }),
      sample(2, { vel: { x: 1, y: 0, z: 0 } }),
    ]);
    assert.equal(peak, 12);
  });

  it("returns 0 for an empty series", () => {
    assert.equal(computePeakSpeedKmS([]), 0);
  });
});

describe("computeStageT", () => {
  it("returns the first staged sample time", () => {
    const t = computeStageT([
      sample(0, { staged: false }),
      sample(120, { staged: false }),
      sample(140.5, { staged: true }),
      sample(200, { staged: true }),
    ]);
    assert.equal(t, 140.5);
  });

  it("returns null when never staged", () => {
    assert.equal(computeStageT([sample(0), sample(10)]), null);
  });
});

describe("resolveTrajectoryMeta", () => {
  const samples = [
    sample(0, { staged: false, vel: { x: 1, y: 0, z: 0 } }),
    sample(100, { staged: true, vel: { x: 0, y: 20, z: 0 } }),
  ];

  it("prefers finite packed fields over a re-scan", () => {
    const m = resolveTrajectoryMeta(
      { minMoonAlt: 1234.5, peakSpeedKmS: 9.5, stageT: 88 },
      samples,
    );
    assert.equal(m.minMoonAlt, 1234.5);
    assert.equal(m.peakSpeedKmS, 9.5);
    assert.equal(m.stageT, 88);
  });

  it("fills missing v1 fields from samples", () => {
    const m = resolveTrajectoryMeta({ minMoonAlt: 500 }, samples);
    assert.equal(m.minMoonAlt, 500);
    assert.equal(m.peakSpeedKmS, 20);
    assert.equal(m.stageT, 100);
  });

  it("accepts packed stageT null (never staged)", () => {
    const m = resolveTrajectoryMeta(
      { minMoonAlt: 1, peakSpeedKmS: 2, stageT: null },
      samples,
    );
    assert.equal(m.stageT, null);
  });

  it("deriveTrajectoryMeta matches individual helpers", () => {
    const d = deriveTrajectoryMeta(samples);
    assert.equal(d.peakSpeedKmS, computePeakSpeedKmS(samples));
    assert.equal(d.stageT, computeStageT(samples));
  });
});

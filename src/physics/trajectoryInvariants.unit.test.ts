/**
 * Synthetic trajectory invariant cases (does not load baked JSON).
 * Baked-pack checks live in trajectory.invariants.test.ts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkTrajectoryInvariants,
  MAX_STEP_KM,
  type TrajectoryLike,
} from "./trajectoryInvariants.ts";

function baseSample(
  t: number,
  phase: string,
  opts: {
    pos?: { x: number; y: number; z: number };
    staged?: boolean;
    fuelBooster?: number;
    fuelShip?: number;
  } = {},
) {
  return {
    t,
    pos: opts.pos ?? { x: 7000 + t * 0.1, y: 0, z: 0 },
    vel: { x: 0, y: 7.5, z: 0 },
    phase,
    burning: false,
    fuelBooster: opts.fuelBooster ?? (phase === "launch" || phase === "ascent" ? 1 : 0),
    fuelShip: opts.fuelShip ?? 0.8,
    thrustN: 0,
    staged: opts.staged ?? !(phase === "launch" || phase === "ascent"),
  };
}

/** Minimal healthy ballistic arc (padded to MIN_SAMPLES with coast points). */
function healthyTrajectory(): TrajectoryLike {
  const samples = [
    baseSample(0, "launch", { staged: false, fuelBooster: 1 }),
    baseSample(100, "ascent", { staged: false, fuelBooster: 0.5 }),
    baseSample(200, "leo", { staged: true, fuelBooster: 0 }),
    baseSample(300, "tli", { staged: true, fuelBooster: 0 }),
  ];
  const durationS = 2 * 86400;
  // Pad with dense coast samples so sample count and step size pass
  const nPad = 600;
  for (let i = 0; i < nPad; i++) {
    const t = 400 + (i * (durationS - 400)) / (nPad - 1);
    samples.push(
      baseSample(t, "coast", {
        staged: true,
        fuelBooster: 0,
        fuelShip: 0.7,
        pos: { x: 7000 + t * 0.05, y: t * 0.01, z: 0 },
      }),
    );
  }
  return {
    ok: true,
    durationS,
    message: "ok",
    samples,
  };
}

describe("checkTrajectoryInvariants (synthetic)", () => {
  it("accepts a healthy ballistic pack shape", () => {
    const issues = checkTrajectoryInvariants(healthyTrajectory());
    assert.deepEqual(issues, [], issues.map((i) => i.message).join("; "));
  });

  it("flags not_ok missions", () => {
    const traj = healthyTrajectory();
    traj.ok = false;
    traj.message = "failed search";
    const issues = checkTrajectoryInvariants(traj);
    assert.ok(issues.some((i) => i.code === "not_ok"));
  });

  it("flags time going backwards", () => {
    const traj = healthyTrajectory();
    // Swap two coast samples' times
    const a = traj.samples[100]!;
    const b = traj.samples[101]!;
    const tmp = a.t;
    a.t = b.t + 10;
    b.t = tmp;
    const issues = checkTrajectoryInvariants(traj);
    assert.ok(issues.some((i) => i.code === "time_order"));
  });

  it("flags trail teleport jumps", () => {
    const traj = healthyTrajectory();
    const mid = traj.samples[200]!;
    mid.pos = { x: mid.pos.x + MAX_STEP_KM * 2, y: 0, z: 0 };
    const issues = checkTrajectoryInvariants(traj);
    assert.ok(issues.some((i) => i.code === "trail_jump"));
  });

  it("flags fuel increasing", () => {
    const traj = healthyTrajectory();
    // Find first coast sample and give next higher ship fuel
    const i = traj.samples.findIndex((s) => s.phase === "coast");
    assert.ok(i >= 0);
    traj.samples[i]!.fuelShip = 0.5;
    traj.samples[i + 1]!.fuelShip = 0.9;
    const issues = checkTrajectoryInvariants(traj);
    assert.ok(issues.some((i) => i.code === "fuel_ship_increase"));
  });

  it("flags missing LEO phase", () => {
    const traj = healthyTrajectory();
    for (const s of traj.samples) {
      if (s.phase === "leo") s.phase = "ascent";
    }
    const issues = checkTrajectoryInvariants(traj);
    assert.ok(
      issues.some(
        (i) => i.code === "missing_phase" || i.code === "phase_order",
      ),
    );
  });
});

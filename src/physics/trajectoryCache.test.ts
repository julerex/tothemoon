import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  epochFromResult,
  loadPrecomputedTrajectory,
  makeTrajectory,
  normalizePhaseId,
  sampleAtProgress,
  sampleAtTime,
  trailPoints,
  trajectoryCoastCorridor,
  unpackPackedTrajectory,
  type PackedTrajectory,
  type Trajectory,
} from "./trajectoryCache.ts";
import type { MissionResult } from "./missionTypes.ts";
import { v3 } from "./vec3.ts";

describe("normalizePhaseId", () => {
  it("maps legacy leo/tli", () => {
    assert.equal(normalizePhaseId("leo"), "lowEarthOrbit");
    assert.equal(normalizePhaseId("tli"), "translunarInjection");
    assert.equal(normalizePhaseId("coast"), "coast");
  });
});

describe("epochFromResult", () => {
  it("builds Flight 13 epoch for short splash missions", () => {
    const e = epochFromResult({
      moonPhase0: 0,
      durationS: 3600,
      message: "Flight 13 splashdown",
    });
    assert.equal(e.useHorizons, false);
    assert.ok(e.clockUtcMsAtT0 != null);
  });

  it("builds lunar epoch for multi-day packs", () => {
    const e = epochFromResult({
      moonPhase0: 0.1,
      durationS: 200_000,
      horizonsLandingT: 190_000,
      message: "Landed · lunar south pole",
    });
    assert.equal(e.moonPhase0, 0.1);
    assert.equal(e.horizonsLandingT, 190_000);
    assert.equal(e.clockUtcMsAtT0, null);
  });
});

describe("unpackPackedTrajectory / makeTrajectory", () => {
  it("unpacks packed arrays and kN→N thrust", () => {
    const packed: PackedTrajectory = {
      version: 2,
      moonPhase0: 0,
      durationS: 100,
      ok: true,
      message: "test suborbital",
      samples: [
        {
          t: 0,
          p: [1, 2, 3],
          v: [0.1, 0, 0],
          phase: "ascent",
          burning: true,
          fb: 1,
          fs: 1,
          th: 2.5, // kN
          st: false,
        },
        {
          t: 100,
          p: [10, 20, 30],
          v: [1, 0, 0],
          phase: "coast",
          burning: false,
          fb: 0,
          fs: 0.9,
          th: 0,
          st: true,
        },
      ],
    };
    const result = unpackPackedTrajectory(packed);
    assert.equal(result.samples.length, 2);
    assert.equal(result.samples[0]!.thrustN, 2500);
    assert.deepEqual(result.samples[0]!.pos, { x: 1, y: 2, z: 3 });
    assert.equal(result.samples[0]!.phase, "ascent");
    assert.equal(result.samples[1]!.staged, true);

    const traj = makeTrajectory(result);
    assert.equal(traj.durationS, 100);
    assert.equal(traj.epoch.useHorizons, false); // short mission → Flight 13 epoch
    assert.ok(traj.epoch.clockUtcMsAtT0 != null);
  });
});

describe("sampleAtTime / sampleAtProgress", () => {
  function toyTrajectory(): Trajectory {
    const result: MissionResult = {
      samples: [
        {
          t: 0,
          pos: v3(0, 0, 0),
          vel: v3(1, 0, 0),
          phase: "ascent",
          burning: true,
          fuelBooster: 1,
          fuelShip: 1,
          thrustN: 1000,
          staged: false,
        },
        {
          t: 10,
          pos: v3(10, 0, 0),
          vel: v3(2, 0, 0),
          phase: "coast",
          burning: false,
          fuelBooster: 0,
          fuelShip: 0.8,
          thrustN: 0,
          staged: true,
        },
      ],
      durationS: 10,
      moonPhase0: 0,
      translunarInjectionDeltaV: 0,
      minMoonAlt: Infinity,
      ok: true,
      message: "toy suborbital",
      peakSpeedKmS: 2,
      stageT: 5,
    };
    return makeTrajectory(result);
  }

  it("clamps to endpoints", () => {
    const traj = toyTrajectory();
    const a = sampleAtTime(traj, -1);
    assert.equal(a.t, 0);
    assert.equal(a.phase, "ascent");
    const b = sampleAtTime(traj, 999);
    assert.equal(b.t, 10);
    assert.equal(b.phase, "coast");
  });

  it("interpolates mid-span position and fuel", () => {
    const traj = toyTrajectory();
    const mid = sampleAtTime(traj, 5);
    assert.ok(Math.abs(mid.pos.x - 5) < 1e-9);
    assert.ok(Math.abs(mid.fuelShip - 0.9) < 1e-9);
    // f = 0.5 → phase/staged from second sample
    assert.equal(mid.phase, "coast");
    assert.equal(mid.staged, true);
  });

  it("sampleAtProgress maps u∈[0,1] onto duration", () => {
    const traj = toyTrajectory();
    const f = sampleAtProgress(traj, 0.5);
    assert.ok(Math.abs(f.t - 5) < 1e-9);
    assert.ok(Math.abs(f.pos.x - 5) < 1e-9);
  });
});

describe("trailPoints", () => {
  it("returns all points when under max", () => {
    const traj = loadPrecomputedTrajectory();
    const pts = trailPoints(traj, traj.samples.length + 10);
    assert.equal(pts.length, traj.samples.length);
  });

  it("decimates when over max", () => {
    const traj = loadPrecomputedTrajectory();
    const pts = trailPoints(traj, 100);
    assert.equal(pts.length, 100);
  });
});

describe("loadPrecomputedTrajectory", () => {
  it("loads lunar pack with Horizons-capable epoch", () => {
    const traj = loadPrecomputedTrajectory();
    assert.ok(traj.ok);
    assert.ok(traj.samples.length > 100);
    assert.ok(traj.durationS > 24 * 3600);
    assert.equal(traj.epoch.clockUtcMsAtT0, null);
  });

  it("returns a frozen pack so consumers cannot mutate shared meta", () => {
    const traj = loadPrecomputedTrajectory();
    assert.ok(Object.isFrozen(traj));
    assert.throws(() => {
      (traj as { durationS: number }).durationS = 0;
    });
  });

  it("samples and derives the corridor from the same pack", () => {
    const traj = loadPrecomputedTrajectory();
    const frame = sampleAtProgress(traj, 0);
    assert.equal(frame.t, traj.samples[0]!.t);
    const corridor = trajectoryCoastCorridor(traj);
    // Corridor derivation is pure: repeat calls agree.
    assert.deepEqual(corridor, trajectoryCoastCorridor(traj));
  });
});

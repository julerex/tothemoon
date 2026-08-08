/**
 * Unit tests for Earth-centric north-polar trajectory helpers.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { TrajectoryCache } from "../physics/trajectoryCache.ts";
import { setMoonPhase0 } from "../physics/bodies.ts";
import { setMissionLandingT } from "../physics/horizonsEpoch.ts";
import { A_EM, R_EARTH } from "../physics/constants.ts";
import { len } from "../physics/vec3.ts";
import type { Sample } from "../physics/missionTypes.ts";
import {
  buildPolarTrajectoryModel,
  craftEarthRel,
  livePolar,
  moonEarthRel,
  polarBasisLookingNorth,
  projectEarthCentricPolar,
  trailUpTo,
} from "./polarTrajectories.ts";

let samples: Sample[];

before(() => {
  const cache = TrajectoryCache.loadPrecomputed();
  setMoonPhase0(cache.moonPhase0);
  setMissionLandingT(cache.horizonsLandingT);
  samples = cache.samples;
});

describe("polarBasisLookingNorth", () => {
  it("is orthonormal with e2 = n × e1", () => {
    const b = polarBasisLookingNorth();
    assert.ok(Math.abs(len(b.n) - 1) < 1e-9);
    assert.ok(Math.abs(len(b.e1) - 1) < 1e-9);
    assert.ok(Math.abs(len(b.e2) - 1) < 1e-9);
    const n1 = b.n.x * b.e1.x + b.n.y * b.e1.y + b.n.z * b.e1.z;
    const n2 = b.n.x * b.e2.x + b.n.y * b.e2.y + b.n.z * b.e2.z;
    const e12 = b.e1.x * b.e2.x + b.e1.y * b.e2.y + b.e1.z * b.e2.z;
    assert.ok(Math.abs(n1) < 1e-9, `n·e1 ${n1}`);
    assert.ok(Math.abs(n2) < 1e-9, `n·e2 ${n2}`);
    assert.ok(Math.abs(e12) < 1e-9, `e1·e2 ${e12}`);
  });
});

describe("projectEarthCentricPolar", () => {
  it("maps pure north-pole vectors to the origin", () => {
    const b = polarBasisLookingNorth();
    const p = projectEarthCentricPolar(
      { x: b.n.x * 1000, y: b.n.y * 1000, z: b.n.z * 1000 },
      b,
    );
    assert.ok(Math.hypot(p.x, p.y) < 1e-6);
  });

  it("preserves length for equatorial vectors", () => {
    const b = polarBasisLookingNorth();
    const r = 5000;
    const p = projectEarthCentricPolar(
      { x: b.e1.x * r, y: b.e1.y * r, z: b.e1.z * r },
      b,
    );
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - r) < 1e-6);
    assert.ok(Math.abs(p.x - r) < 1e-6);
    assert.ok(Math.abs(p.y) < 1e-6);
  });
});

describe("buildPolarTrajectoryModel", () => {
  it("builds ship and moon trails spanning the mission", () => {
    const m = buildPolarTrajectoryModel(samples);
    assert.ok(m);
    assert.ok(m!.shipTrail.length > 50);
    assert.ok(m!.moonTrail.length > 50);
    assert.equal(m!.shipTrail[0]!.t, samples[0]!.t);
    assert.ok(
      m!.shipTrail[m!.shipTrail.length - 1]!.t >=
        samples[samples.length - 1]!.t - 1,
    );
  });

  it("frames beyond mean lunar distance", () => {
    const m = buildPolarTrajectoryModel(samples)!;
    assert.ok(m.bounds.xMax > A_EM * 0.9);
    assert.ok(m.rEarth === R_EARTH);
  });

  it("places liftoff near Earth's surface radius in projection", () => {
    const m = buildPolarTrajectoryModel(samples)!;
    const s0 = samples[0]!;
    craftEarthRel(s0);
    const p = projectEarthCentricPolar(craftEarthRel(s0), m.basis);
    // Equatorial projection of Starbase (~26°N) is R cos(lat) ≈ 0.9 R
    const r = Math.hypot(p.x, p.y);
    assert.ok(r > R_EARTH * 0.7 && r < R_EARTH * 1.05, `r ${r}`);
  });
});

describe("livePolar", () => {
  it("returns finite ship and moon radii", () => {
    const m = buildPolarTrajectoryModel(samples)!;
    const mid = samples[Math.floor(samples.length / 2)]!.t;
    const live = livePolar(m, samples, mid);
    assert.ok(live.ship);
    assert.ok(live.moon);
    assert.ok(live.shipR > R_EARTH * 0.5);
    assert.ok(live.moonR > A_EM * 0.7 && live.moonR < A_EM * 1.3);
  });
});

describe("trailUpTo", () => {
  it("clips to mission time", () => {
    const m = buildPolarTrajectoryModel(samples)!;
    const mid = m.shipTrail[Math.floor(m.shipTrail.length / 2)]!.t;
    const partial = trailUpTo(m.shipTrail, mid);
    assert.ok(partial.length >= 1);
    assert.ok(partial[partial.length - 1]!.t <= mid + 1e-9);
  });
});

describe("moonEarthRel", () => {
  it("is roughly lunar distance from Earth", () => {
    const r = moonEarthRel(0);
    const L = len(r);
    assert.ok(L > A_EM * 0.7 && L < A_EM * 1.3, `L ${L}`);
  });
});

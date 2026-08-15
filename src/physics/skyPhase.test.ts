/**
 * Unit tests for sky-phase / Moon illumination helpers.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { loadPrecomputedTrajectory, type Trajectory } from "./trajectoryCache.ts";
import type { EphemerisEpoch } from "./ephemerisEpoch.ts";
import {
  formatSkyPhaseLine,
  moonPhaseName,
  skyPhaseAt,
  wrapPi,
} from "./skyPhase.ts";

describe("wrapPi", () => {
  it("maps angles into (−π, π]", () => {
    assert.ok(Math.abs(wrapPi(0)) < 1e-12);
    assert.ok(Math.abs(wrapPi(Math.PI) - Math.PI) < 1e-12);
    assert.ok(Math.abs(wrapPi(-Math.PI) - Math.PI) < 1e-9 || Math.abs(wrapPi(-Math.PI) + Math.PI) < 1e-9);
    assert.ok(Math.abs(wrapPi(3 * Math.PI) - Math.PI) < 1e-9);
  });
});

describe("moonPhaseName", () => {
  it("labels new / full / quarters", () => {
    assert.equal(moonPhaseName(0.01, 0.01), "new");
    assert.equal(moonPhaseName(Math.PI, 0.99), "full");
    assert.equal(moonPhaseName(1.2, 0.5), "first quarter");
    assert.equal(moonPhaseName(-1.2, 0.5), "last quarter");
  });

  it("distinguishes waxing vs waning gibbous", () => {
    assert.equal(moonPhaseName(2.0, 0.8), "waxing gibbous");
    assert.equal(moonPhaseName(-2.0, 0.8), "waning gibbous");
  });
});

describe("skyPhaseAt (baked lunar pack)", () => {
  let epoch: EphemerisEpoch;
  let cache: Trajectory;

  before(() => {
    cache = loadPrecomputedTrajectory();
    epoch = cache.epoch;
  });

  it("reports waning gibbous near the July 2027 landing epoch", () => {
    // Landing is τ=0 on Horizons; mission t ≈ landingMissionT at touchdown
    const tLand = cache.horizonsLandingT;
    const p = skyPhaseAt(tLand, epoch);
    // July 2027 landing is ~2 days past full → waning gibbous, high illumination
    assert.ok(
      p.illumination > 0.75 && p.illumination < 0.99,
      `illum ${p.illumination}`,
    );
    assert.match(p.moonPhase, /waning gibbous|full/);
  });

  it("formatSkyPhaseLine is non-empty and mentions Moon", () => {
    const line = formatSkyPhaseLine(0, epoch);
    assert.match(line, /Moon/i);
    assert.match(line, /lit/);
    assert.match(line, /Sun/);
  });
});

/**
 * Visual V2: soft terminator remap + atmosphere helper contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  splashOceanCapCos,
  splashOceanWeight,
  softTerminatorNl,
  SPLASH_OCEAN_CAP_KM,
} from "./earthAtmosphere.ts";
import { R_EARTH } from "../physics/constants.ts";

describe("softTerminatorNl", () => {
  it("is 0 deep on the night side", () => {
    assert.equal(softTerminatorNl(-1), 0);
    assert.equal(softTerminatorNl(-0.5), 0);
  });

  it("is 1 in full daylight", () => {
    assert.equal(softTerminatorNl(1), 1);
    assert.equal(softTerminatorNl(0.5), 1);
  });

  it("wraps slightly past geometric night (softStart < 0)", () => {
    // Geometric night is nDotL < 0; soft map still has light near -0.05
    const justPast = softTerminatorNl(-0.05);
    assert.ok(justPast > 0 && justPast < 1);
  });

  it("is monotonic in the soft band", () => {
    let prev = softTerminatorNl(-0.18);
    for (let x = -0.17; x <= 0.42; x += 0.05) {
      const v = softTerminatorNl(x);
      assert.ok(v >= prev - 1e-12, `expected non-decreasing at ${x}`);
      prev = v;
    }
  });

  it("matches smoothstep endpoints", () => {
    assert.equal(softTerminatorNl(-0.18), 0);
    assert.equal(softTerminatorNl(0.42), 1);
  });
});

describe("splash ocean cap", () => {
  it("is full at the splash site and off well outside the cap", () => {
    const outer = splashOceanCapCos(SPLASH_OCEAN_CAP_KM);
    const inner = splashOceanCapCos(SPLASH_OCEAN_CAP_KM * 0.35);
    assert.ok(outer < 1 && outer > 0.99);
    assert.equal(splashOceanWeight(1, outer, inner), 1);
    assert.equal(splashOceanWeight(0, outer, inner), 0);
    assert.ok(inner > outer);
  });

  it("covers the recovery-drone horizon (~110 km)", () => {
    assert.ok(SPLASH_OCEAN_CAP_KM > 110);
    const outer = splashOceanCapCos(SPLASH_OCEAN_CAP_KM);
    const atHorizon = Math.cos(110 / R_EARTH);
    assert.ok(atHorizon > outer, `110 km still inside cap (${atHorizon} vs ${outer})`);
  });
});

describe("softTerminatorNl extra", () => {
  it("handles inverted range without NaN (hard step at softEnd)", () => {
    // softEnd ≤ softStart → binary step, never NaN
    assert.equal(softTerminatorNl(-0.5, 1, 0), 0);
    assert.equal(softTerminatorNl(0.5, 1, 0), 1);
    assert.ok(Number.isFinite(softTerminatorNl(0, 1, 0)));
  });
});

/**
 * Visual V2: soft terminator remap + atmosphere helper contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { softTerminatorNl } from "./earthAtmosphere.ts";

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

  it("handles inverted range without NaN (hard step at softEnd)", () => {
    // softEnd ≤ softStart → binary step, never NaN
    assert.equal(softTerminatorNl(-0.5, 1, 0), 0);
    assert.equal(softTerminatorNl(0.5, 1, 0), 1);
    assert.ok(Number.isFinite(softTerminatorNl(0, 1, 0)));
  });
});

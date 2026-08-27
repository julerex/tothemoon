/**
 * Visual V18 onboard post gate + strength band.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ONBOARD_BARREL_STRENGTH,
  ONBOARD_DIRT_STRENGTH,
  ONBOARD_GRAIN_STRENGTH,
  onboardBarrelStrength,
  onboardPostEnabled,
} from "./onboardPost.ts";

describe("onboardPostEnabled", () => {
  it("enables fin, gridfin, and engine-bay mounts", () => {
    assert.equal(onboardPostEnabled("fin"), true);
    assert.equal(onboardPostEnabled("gridfin"), true);
    assert.equal(onboardPostEnabled("engines"), true);
    assert.equal(onboardPostEnabled("enginesDown"), true);
  });

  it("stays off for hull and all non-onboard cams", () => {
    for (const mode of [
      "hull", "trench", "chase", "starbase", "aerial", "earth", "moon", "sun", "free",
    ]) {
      assert.equal(onboardPostEnabled(mode), false, mode);
    }
    assert.equal(onboardPostEnabled(undefined), false);
    assert.equal(onboardPostEnabled(""), false);
  });
});

describe("onboardBarrelStrength", () => {
  it("stays in a mild fisheye band (not a strong lens)", () => {
    const s = onboardBarrelStrength();
    assert.equal(s, ONBOARD_BARREL_STRENGTH);
    assert.ok(s >= 0.05 && s <= 0.22);
    assert.equal(ONBOARD_GRAIN_STRENGTH, 0);
    assert.equal(ONBOARD_DIRT_STRENGTH, 0);
  });
});

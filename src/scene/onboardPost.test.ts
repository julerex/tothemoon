/**
 * Visual V18 onboard post gate + strength band.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ONBOARD_BARREL_STRENGTH,
  ONBOARD_DIRT_STRENGTH,
  ONBOARD_GRAIN_STRENGTH,
  onboardBarrelSampleUv,
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
      "hull", "trench", "chase", "starbase", "aerial", "ground1", "tower1cam", "tower2cam", "earth", "moon", "sun", "free",
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

describe("onboardBarrelSampleUv", () => {
  const b = ONBOARD_BARREL_STRENGTH;

  it("keeps the unit square inside 0…1 so edges do not clamp-smear", () => {
    for (let iy = 0; iy <= 10; iy++) {
      for (let ix = 0; ix <= 10; ix++) {
        const u = ix / 10;
        const v = iy / 10;
        const [su, sv] = onboardBarrelSampleUv(u, v, b);
        assert.ok(su >= 0 && su <= 1, `u=${u} → ${su}`);
        assert.ok(sv >= 0 && sv <= 1, `v=${v} → ${sv}`);
      }
    }
  });

  it("maps corners onto the source corners after the fit", () => {
    const [u0, v0] = onboardBarrelSampleUv(0, 0, b);
    const [u1, v1] = onboardBarrelSampleUv(1, 1, b);
    assert.ok(Math.abs(u0) < 1e-12 && Math.abs(v0) < 1e-12);
    assert.ok(Math.abs(u1 - 1) < 1e-12 && Math.abs(v1 - 1) < 1e-12);
  });

  it("pulls the top mid-edge inside the source (unfitted barrel would exceed 1)", () => {
    const unfitted = 0.5 * (1 + b) + 0.5;
    assert.ok(unfitted > 1, "the old clamp path sampled past v=1");
    const [, top] = onboardBarrelSampleUv(0.5, 1, b);
    assert.ok(top > 0.9 && top <= 1, `top=${top}`);
    assert.ok(top < 1);
  });
});

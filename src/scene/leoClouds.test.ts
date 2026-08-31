/**
 * Visual V19: gated LEO cloud shell + glitter visibility contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEO_CLOUD_FADE_IN_KM,
  LEO_CLOUD_FADE_OUT_KM,
  LEO_CLOUD_FULL_HIGH_KM,
  LEO_CLOUD_FULL_LOW_KM,
  LEO_CLOUD_FOCUSES,
  LEO_CLOUD_MESH,
  LEO_CLOUDS_GROUP,
  LEO_CLOUD_RADIUS,
  LEO_GLITTER_MESH,
  LEO_GLITTER_RADIUS,
  LEO_GLITTER_SCALE,
  leoCloudOpacity,
  leoCloudsFocusEnabled,
  leoGlitterOpacity,
} from "./leoClouds.ts";
import { R_EARTH } from "../physics/constants.ts";

const LEO_ALT = 200;

describe("leoCloudsFocusEnabled", () => {
  it("allows hull / fin / gridfin / chase", () => {
    for (const mode of LEO_CLOUD_FOCUSES) {
      assert.equal(leoCloudsFocusEnabled(mode), true, mode);
    }
  });

  it("stays off for Earth-cam, pad, and system views", () => {
    for (const mode of ["earth", "starbase", "aerial", "tower", "trench", "sun", "moon", "free"]) {
      assert.equal(leoCloudsFocusEnabled(mode), false, mode);
    }
    assert.equal(leoCloudsFocusEnabled(undefined), false);
    assert.equal(leoCloudsFocusEnabled(""), false);
  });
});

describe("leoCloudOpacity", () => {
  it("is zero on Earth-cam even at LEO altitude", () => {
    assert.equal(leoCloudOpacity(LEO_ALT, "earth"), 0);
    assert.equal(leoCloudOpacity(LEO_ALT, "starbase"), 0);
    assert.equal(leoCloudOpacity(0.2, "hull"), 0);
  });

  it("is full for hull-cam in the LEO band", () => {
    const a = leoCloudOpacity(LEO_ALT, "hull");
    assert.ok(a > 0.95 && a <= 1);
    assert.ok(Math.abs(a - leoCloudOpacity(LEO_ALT, "fin")) < 1e-12);
    assert.ok(Math.abs(a - leoCloudOpacity(LEO_ALT, "chase")) < 1e-12);
  });

  it("fades in above the pad / inside-shell band", () => {
    const low = leoCloudOpacity(LEO_CLOUD_FADE_IN_KM, "hull");
    const mid = leoCloudOpacity(
      (LEO_CLOUD_FADE_IN_KM + LEO_CLOUD_FULL_LOW_KM) / 2,
      "hull",
    );
    const full = leoCloudOpacity(LEO_CLOUD_FULL_LOW_KM, "hull");
    assert.ok(low < 0.08);
    assert.ok(mid > 0.2 && mid < 0.8);
    assert.ok(full > 0.95);
  });

  it("fades out before Earth-cam globe distances", () => {
    const full = leoCloudOpacity(LEO_CLOUD_FULL_HIGH_KM, "hull");
    const mid = leoCloudOpacity(
      (LEO_CLOUD_FULL_HIGH_KM + LEO_CLOUD_FADE_OUT_KM) / 2,
      "hull",
    );
    const gone = leoCloudOpacity(LEO_CLOUD_FADE_OUT_KM, "hull");
    const far = leoCloudOpacity(20_000, "hull");
    assert.ok(full > 0.95);
    assert.ok(mid > 0.15 && mid < 0.85);
    assert.equal(gone, 0);
    assert.equal(far, 0);
  });

  it("treats non-finite altitude as hidden", () => {
    assert.equal(leoCloudOpacity(Number.NaN, "hull"), 0);
    assert.equal(leoCloudOpacity(Number.POSITIVE_INFINITY, "hull"), 0);
    assert.equal(leoCloudOpacity(-10, "hull"), 0);
  });
});

describe("leoGlitterOpacity", () => {
  it("shares the cloud gate and stays quieter", () => {
    const cloud = leoCloudOpacity(LEO_ALT, "hull");
    const glitter = leoGlitterOpacity(LEO_ALT, "hull");
    assert.ok(Math.abs(glitter - cloud * LEO_GLITTER_SCALE) < 1e-12);
    assert.ok(glitter > 0 && glitter < cloud);
    assert.equal(leoGlitterOpacity(LEO_ALT, "earth"), 0);
  });
});

describe("leo cloud shell radii", () => {
  it("sits outside Earth with glitter below the deck", () => {
    assert.ok(LEO_CLOUD_RADIUS > R_EARTH);
    assert.ok(LEO_GLITTER_RADIUS > R_EARTH);
    assert.ok(LEO_CLOUD_RADIUS > LEO_GLITTER_RADIUS);
    assert.equal(LEO_CLOUDS_GROUP, "leo-clouds");
    assert.equal(LEO_CLOUD_MESH, "leo-cloud-shell");
    assert.equal(LEO_GLITTER_MESH, "leo-ocean-glitter");
  });
});

/**
 * Zoom-label local scale (pure; no THREE / DOM).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createNameLabel,
  getZoomLabelsVisible,
  labelLocalScale,
  zoomLabelName,
} from "./zoomLabels.ts";

describe("zoom label chrome", () => {
  it("starts hidden so the theater boots without name plates", () => {
    assert.equal(getZoomLabelsVisible(), false);
  });
});

describe("zoomLabelName", () => {
  it("slugs mixed case, spaces, and punctuation", () => {
    assert.equal(zoomLabelName("OLM"), "label-olm");
    assert.equal(zoomLabelName("SUPER HEAVY"), "label-super-heavy");
    assert.equal(zoomLabelName("OLP-1 mount"), "label-olp-1-mount");
    assert.equal(zoomLabelName("SH 4"), "label-sh-4");
  });
});

describe("createNameLabel", () => {
  it("names the sprite from the slug and marks it as a zoom label", () => {
    const spr = createNameLabel("Main tanks", "#d4eaf6");
    assert.equal(spr.name, "label-main-tanks");
    assert.ok(spr.userData.zoomLabel);
  });
});

describe("labelLocalScale", () => {
  it("matches world size when the parent is unscaled", () => {
    const s = labelLocalScale(0.02, 4, 1);
    assert.equal(s.h, 0.02);
    assert.equal(s.w, 0.08);
  });

  it("undoes the craft mesh scale so a booster plate stays readable", () => {
    const s = labelLocalScale(0.02, 4, 0.04);
    assert.equal(s.h, 0.5);
    assert.equal(s.w, 2);
  });

  it("floors a collapsed parent scale instead of dividing by zero", () => {
    const s = labelLocalScale(0.02, 4, 0);
    assert.ok(s.h > 0);
    assert.ok(s.w > 0);
  });
});

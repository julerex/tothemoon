/**
 * Zoom-label local scale (pure; no THREE / DOM).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { labelLocalScale } from "./zoomLabels.ts";

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

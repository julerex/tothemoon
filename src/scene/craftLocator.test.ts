/**
 * Body / booster locator visibility policy (pure; no THREE / DOM).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCATOR_HIDE_ABOVE_PX, locatorShouldShow } from "./craft.ts";

describe("locatorShouldShow", () => {
  it("hides when a near-range floor is set and the camera is closer", () => {
    assert.equal(locatorShouldShow(9.99, 1, 10), false);
    assert.equal(locatorShouldShow(0.2, 0.5, 10), false);
  });

  it("allows the marker past the floor when the mesh is still sub-pixel", () => {
    assert.equal(locatorShouldShow(10, 1, 10), true);
    assert.equal(locatorShouldShow(250, 2, 10), true);
  });

  it("still hides once the real geometry subtends enough pixels", () => {
    assert.equal(locatorShouldShow(12, LOCATOR_HIDE_ABOVE_PX, 10), false);
    assert.equal(locatorShouldShow(12, LOCATOR_HIDE_ABOVE_PX - 0.01, 10), true);
  });

  it("keeps the pixel-only heuristic when no min distance is set", () => {
    assert.equal(locatorShouldShow(0.5, 1), true);
    assert.equal(locatorShouldShow(0.5, LOCATOR_HIDE_ABOVE_PX), false);
  });
});

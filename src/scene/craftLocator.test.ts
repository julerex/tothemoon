/**
 * Starship red-locator visibility policy (pure; no THREE / DOM).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CRAFT_LOCATOR_MIN_DIST_KM,
  LOCATOR_HIDE_ABOVE_PX,
  locatorShouldShow,
} from "./craft.ts";

describe("locatorShouldShow", () => {
  it("hides the Starship red dot when the camera is closer than 10 km", () => {
    assert.equal(CRAFT_LOCATOR_MIN_DIST_KM, 10);
    assert.equal(locatorShouldShow(9.99, 1, CRAFT_LOCATOR_MIN_DIST_KM), false);
    assert.equal(locatorShouldShow(0.2, 0.5, CRAFT_LOCATOR_MIN_DIST_KM), false);
  });

  it("allows the Starship red dot at 10 km when the mesh is still sub-pixel", () => {
    assert.equal(locatorShouldShow(10, 1, CRAFT_LOCATOR_MIN_DIST_KM), true);
    assert.equal(locatorShouldShow(250, 2, CRAFT_LOCATOR_MIN_DIST_KM), true);
  });

  it("still hides once the real geometry subtends enough pixels", () => {
    assert.equal(
      locatorShouldShow(12, LOCATOR_HIDE_ABOVE_PX, CRAFT_LOCATOR_MIN_DIST_KM),
      false,
    );
    assert.equal(
      locatorShouldShow(12, LOCATOR_HIDE_ABOVE_PX - 0.01, CRAFT_LOCATOR_MIN_DIST_KM),
      true,
    );
  });

  it("keeps the pixel-only heuristic when no min distance is set", () => {
    assert.equal(locatorShouldShow(0.5, 1), true);
    assert.equal(locatorShouldShow(0.5, LOCATOR_HIDE_ABOVE_PX), false);
  });
});

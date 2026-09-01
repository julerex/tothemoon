import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyUndergroundOverlay,
  UNDERGROUND_COPY,
} from "./undergroundOverlay.ts";

describe("applyUndergroundOverlay", () => {
  it("shows the overlay when underground and hides it otherwise", () => {
    const el = { hidden: true };
    applyUndergroundOverlay(el, true);
    assert.equal(el.hidden, false);
    applyUndergroundOverlay(el, false);
    assert.equal(el.hidden, true);
  });

  it("is a no-op when the node is missing", () => {
    applyUndergroundOverlay(null, true);
  });

  it("keeps the on-screen copy", () => {
    assert.equal(UNDERGROUND_COPY, "You are underground!");
  });
});

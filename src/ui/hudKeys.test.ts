import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPlayPauseCode } from "./hudKeys.ts";

describe("isPlayPauseCode", () => {
  it("treats P and Space as play/pause", () => {
    assert.equal(isPlayPauseCode("KeyP"), true);
    assert.equal(isPlayPauseCode("Space"), true);
  });

  it("leaves other keys alone", () => {
    assert.equal(isPlayPauseCode("KeyK"), false);
    assert.equal(isPlayPauseCode("KeyO"), false);
  });
});

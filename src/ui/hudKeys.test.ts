import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookmarkStepDir, isPlayPauseCode, speedNudgeDir } from "./hudKeys.ts";

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

describe("speedNudgeDir", () => {
  it("maps minus to slower and equals to faster", () => {
    assert.equal(speedNudgeDir("Minus"), -1);
    assert.equal(speedNudgeDir("Equal"), 1);
  });

  it("does not use comma or period for speed", () => {
    assert.equal(speedNudgeDir("Comma"), null);
    assert.equal(speedNudgeDir("Period"), null);
  });
});

describe("bookmarkStepDir", () => {
  it("maps comma to previous and period to next", () => {
    assert.equal(bookmarkStepDir("Comma"), -1);
    assert.equal(bookmarkStepDir("Period"), 1);
  });

  it("does not use minus or equals for bookmarks", () => {
    assert.equal(bookmarkStepDir("Minus"), null);
    assert.equal(bookmarkStepDir("Equal"), null);
  });
});

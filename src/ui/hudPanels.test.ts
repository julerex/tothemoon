import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextMenuPlayback } from "./hudPanels.ts";

describe("nextMenuPlayback", () => {
  it("pauses on open and remembers a playing theater", () => {
    assert.deepEqual(nextMenuPlayback(true, true, false), {
      resumeOnClose: true,
      playing: false,
    });
  });

  it("pauses on open without resuming a theater that was already paused", () => {
    assert.deepEqual(nextMenuPlayback(true, false, false), {
      resumeOnClose: false,
      playing: false,
    });
  });

  it("resumes on close only when the Menu paused a playing theater", () => {
    assert.deepEqual(nextMenuPlayback(false, false, true), {
      resumeOnClose: false,
      playing: true,
    });
    assert.deepEqual(nextMenuPlayback(false, true, false), {
      resumeOnClose: false,
      playing: null,
    });
  });
});

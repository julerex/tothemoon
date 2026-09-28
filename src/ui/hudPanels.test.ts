import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clockHeldByOverlay, nextOverlayPlayback, nextTheaterDashboard } from "./hudPanels.ts";

describe("nextTheaterDashboard", () => {
  it("cycles the dashboards and skips the KeyMap", () => {
    assert.equal(nextTheaterDashboard("main"), "graphs");
    assert.equal(nextTheaterDashboard("graphs"), "cross");
    assert.equal(nextTheaterDashboard("cross"), "earthGc");
    assert.equal(nextTheaterDashboard("earthGc"), "polar");
    assert.equal(nextTheaterDashboard("polar"), "main");
  });
});

describe("clockHeldByOverlay", () => {
  const closed = { metricsOpen: false, keymapOpen: false, helpOpen: false, graphsOpen: false };

  it("pauses on the flight graphs and leaves the other pictures running", () => {
    assert.equal(clockHeldByOverlay({ ...closed, graphsOpen: true }), true);
    assert.equal(clockHeldByOverlay({ ...closed, metricsOpen: true }), true);
    assert.equal(clockHeldByOverlay(closed), false);
  });
});

describe("nextOverlayPlayback", () => {
  it("pauses when the Menu or KeyMap opens and remembers a playing theater", () => {
    assert.deepEqual(nextOverlayPlayback(true, true, false), {
      resumeOnClose: true,
      playing: false,
    });
  });

  it("pauses on open without resuming a theater that was already paused", () => {
    assert.deepEqual(nextOverlayPlayback(true, false, false), {
      resumeOnClose: false,
      playing: false,
    });
  });

  it("resumes only when the last pause overlay closes a playing theater", () => {
    assert.deepEqual(nextOverlayPlayback(false, false, true), {
      resumeOnClose: false,
      playing: true,
    });
    assert.deepEqual(nextOverlayPlayback(false, true, false), {
      resumeOnClose: false,
      playing: null,
    });
  });
});

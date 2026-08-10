import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyLandingBeat,
  LANDING_BEAT_HOLD_S,
  LANDING_SITE_LABEL,
  landingBeatCameraMode,
  landingBeatCardReady,
  landingBeatCompleteSubtitle,
} from "./landingBeat.ts";

describe("classifyLandingBeat", () => {
  it("returns null while the mission is not complete", () => {
    assert.equal(classifyLandingBeat("descent", false), null);
    assert.equal(classifyLandingBeat("coast", false), null);
  });

  it("classifies soft land, impact, and flyby ends", () => {
    assert.equal(classifyLandingBeat("landed", true), "landed");
    assert.equal(classifyLandingBeat("descent", true), "landed");
    assert.equal(classifyLandingBeat("impact", true), "impact");
    assert.equal(classifyLandingBeat("coast", true), "flyby");
  });
});

describe("landingBeatCameraMode", () => {
  it("settles on Ship for land and Moon for impact/flyby", () => {
    assert.equal(landingBeatCameraMode("landed"), "chase");
    assert.equal(landingBeatCameraMode("impact"), "moon");
    assert.equal(landingBeatCameraMode("flyby"), "moon");
  });
});

describe("landingBeatCardReady", () => {
  it("holds the card until the wall-clock window elapses", () => {
    assert.equal(landingBeatCardReady(0), false);
    assert.equal(landingBeatCardReady(LANDING_BEAT_HOLD_S - 0.01), false);
    assert.equal(landingBeatCardReady(LANDING_BEAT_HOLD_S), true);
    assert.equal(landingBeatCardReady(LANDING_BEAT_HOLD_S + 1), true);
  });

  it("rejects invalid ages", () => {
    assert.equal(landingBeatCardReady(-1), false);
    assert.equal(landingBeatCardReady(Number.NaN), false);
  });
});

describe("landingBeatCompleteSubtitle", () => {
  it("names the theater site on soft land", () => {
    assert.match(landingBeatCompleteSubtitle("landed"), new RegExp(LANDING_SITE_LABEL));
  });

  it("distinguishes impact and flyby", () => {
    assert.match(landingBeatCompleteSubtitle("impact"), /impact/i);
    assert.match(landingBeatCompleteSubtitle("flyby"), /flyby/i);
  });

  it("names Indian Ocean splashdown for Flight 13", () => {
    assert.match(
      landingBeatCompleteSubtitle("landed", { splashdown: true }),
      /Indian Ocean/i,
    );
  });
});

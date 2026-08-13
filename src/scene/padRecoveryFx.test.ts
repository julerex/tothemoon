/**
 * Unit tests for pure recovery theater poses (`padRecoveryFx.ts`).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHOPSTICKS_SCHEDULE, GULF_SCHEDULE } from "../physics/boosterRecovery.ts";
import {
  chopstickCloseAmount,
  deriveChopstickPose,
  gulfLandingAltKm,
  gulfSiteVisible,
  gulfSprayPhase,
} from "./padRecoveryFx.ts";

describe("chopstickCloseAmount", () => {
  it("stays open for gulf and before the catch window", () => {
    assert.equal(chopstickCloseAmount(CHOPSTICKS_SCHEDULE.landingEndS, "gulf"), 0);
    assert.equal(chopstickCloseAmount(CHOPSTICKS_SCHEDULE.landingEndS - 20, "chopsticks"), 0);
  });

  it("closes through catch and holds after", () => {
    const mid = chopstickCloseAmount(CHOPSTICKS_SCHEDULE.landingEndS - 1, "chopsticks");
    const done = chopstickCloseAmount(CHOPSTICKS_SCHEDULE.landingEndS + 3, "chopsticks");
    assert.ok(mid > 0.3 && mid < 1);
    assert.equal(done, 1);
  });

  it("is scrub-stable", () => {
    const a = deriveChopstickPose({ age: 278, profile: "chopsticks" });
    assert.deepEqual(a, deriveChopstickPose({ age: 278, profile: "chopsticks" }));
    assert.ok(a.close > 0.5);
    assert.ok(a.carriageDy < 0);
  });
});

describe("gulf site gates", () => {
  it("shows the plate during landing / caught", () => {
    assert.equal(gulfSiteVisible("landing", 0), true);
    assert.equal(gulfSiteVisible("caught", 0), true);
    assert.equal(gulfSiteVisible("coast", GULF_SCHEDULE.landingStartS - 200), false);
    assert.equal(gulfSiteVisible("coast", GULF_SCHEDULE.landingStartS - 10), true);
  });

  it("lerps AGL through the landing burn", () => {
    assert.equal(gulfLandingAltKm(GULF_SCHEDULE.landingStartS), GULF_SCHEDULE.gateAltKm);
    assert.equal(gulfLandingAltKm(GULF_SCHEDULE.landingEndS), GULF_SCHEDULE.landAltKm);
    const mid = gulfLandingAltKm(
      (GULF_SCHEDULE.landingStartS + GULF_SCHEDULE.landingEndS) / 2,
    );
    assert.ok(mid < GULF_SCHEDULE.gateAltKm && mid > GULF_SCHEDULE.landAltKm);
  });

  it("maps recovery phase onto splash spray curves", () => {
    assert.equal(gulfSprayPhase("landing"), "descent");
    assert.equal(gulfSprayPhase("caught"), "splashdown");
    assert.equal(gulfSprayPhase("coast"), "entry");
  });
});

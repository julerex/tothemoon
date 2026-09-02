/**
 * Unit tests for pure recovery theater poses (`padRecoveryFx.ts`).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boosterVisibleS,
  CHOPSTICKS_SCHEDULE,
  GULF_SCHEDULE,
} from "../physics/boosterRecovery.ts";
import {
  chopstickCloseAmount,
  deriveChopstickPose,
  deriveGulfSpray,
  gulfLandingAltKm,
  gulfSiteVisible,
  gulfSprayActive,
  gulfSprayPhase,
  GULF_STEAM_HOLD_S,
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
    assert.ok(a.carriageDy < -0.02);
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

  it("hides the plate after the booster recovery window", () => {
    const vis = boosterVisibleS(GULF_SCHEDULE);
    assert.equal(gulfSiteVisible("caught", vis), true);
    assert.equal(gulfSiteVisible("done", vis + 1), false);
    assert.equal(gulfSiteVisible("coast", vis + 60), false);
    assert.equal(gulfSiteVisible("landing", vis + 1), false);
  });
});

describe("gulf hard-splash steam", () => {
  const landAge = GULF_SCHEDULE.landingEndS;
  const landT = 141 + landAge;

  function spray(
    recoveryPhase: string,
    age: number,
  ): ReturnType<typeof deriveGulfSpray> {
    return deriveGulfSpray({
      missionT: landT + (age - landAge),
      landT,
      recoveryPhase,
      age,
    });
  }

  it("is on for the landing burn and a short post-splash hold", () => {
    assert.equal(gulfSprayActive("coast", GULF_SCHEDULE.landingStartS - 10), false);
    assert.equal(gulfSprayActive("landing", GULF_SCHEDULE.landingStartS), true);
    assert.equal(gulfSprayActive("caught", landAge), true);
    assert.equal(gulfSprayActive("caught", landAge + GULF_STEAM_HOLD_S), true);
    assert.equal(gulfSprayActive("caught", landAge + GULF_STEAM_HOLD_S + 1), false);
    assert.equal(gulfSprayActive("done", landAge + 90), false);
  });

  it("stays local instead of the ship-splash Earth-cam bloom", () => {
    const atGate = spray("landing", GULF_SCHEDULE.landingStartS);
    const atSplash = spray("caught", landAge);
    const bloom = spray("caught", landAge + 5);
    assert.equal(atGate.active, true);
    assert.equal(atSplash.active, true);
    assert.ok(atGate.outer.expand < 3, `gate outer ${atGate.outer.expand}`);
    assert.ok(atSplash.outer.expand < 3, `splash outer ${atSplash.outer.expand}`);
    assert.ok(bloom.outer.expand < 3, `bloom outer ${bloom.outer.expand}`);
    assert.ok(bloom.inner.expand < 2, `bloom inner ${bloom.inner.expand}`);
    assert.ok(bloom.sheet.expand <= 1.4);
  });

  it("does not keep growing a white disc after splash", () => {
    const early = spray("caught", landAge);
    const later = spray("caught", landAge + 12);
    assert.ok(later.outer.expand < 3);
    assert.ok(later.outer.expand <= early.outer.expand + 1.2);
    const gone = spray("caught", landAge + 90);
    assert.equal(gone.active, false);
    assert.equal(gone.outer.visible, false);
    assert.equal(gone.siteVisible, false);
  });

  it("is scrub-stable", () => {
    const a = spray("caught", landAge + 3);
    assert.deepEqual(a, spray("caught", landAge + 3));
  });
});

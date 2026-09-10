import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOSTER_ENGINE_COUNT,
  BOOSTER_INNER_ENGINES,
  BOOSTER_LANDING_ENGINES,
  boosterEngineLit,
  boosterLandingBellLit,
  gulfLandingEngineCount,
  gulfLandingThrottlePeak,
} from "./boosterLandingEngines.ts";

const GULF = { landingStartS: 243, landingEndS: 272 };

describe("gulfLandingEngineCount", () => {
  it("is off outside the public landing-burn window", () => {
    assert.equal(gulfLandingEngineCount(GULF.landingStartS - 0.01, GULF), 0);
    assert.equal(gulfLandingEngineCount(GULF.landingEndS, GULF), 0);
  });

  it("follows the flown 10 → 8 → 5 inner-13 relight (NSF / Wikipedia)", () => {
    assert.equal(gulfLandingEngineCount(GULF.landingStartS, GULF), 10);
    assert.equal(gulfLandingEngineCount(GULF.landingStartS + 3.9, GULF), 10);
    assert.equal(gulfLandingEngineCount(GULF.landingStartS + 4, GULF), 8);
    assert.equal(gulfLandingEngineCount(GULF.landingStartS + 7.9, GULF), 8);
    assert.equal(gulfLandingEngineCount(GULF.landingStartS + 8, GULF), 5);
    assert.equal(gulfLandingEngineCount(GULF.landingEndS - 0.01, GULF), 5);
  });

  it("is scrub-stable", () => {
    assert.equal(
      gulfLandingEngineCount(GULF.landingStartS + 5, GULF),
      gulfLandingEngineCount(GULF.landingStartS + 5, GULF),
    );
  });
});

describe("gulfLandingThrottlePeak", () => {
  it("is lit-count / 13", () => {
    assert.equal(gulfLandingThrottlePeak(GULF.landingStartS + 1, GULF), 10 / 13);
    assert.equal(gulfLandingThrottlePeak(GULF.landingStartS + 5, GULF), 8 / 13);
    assert.equal(gulfLandingThrottlePeak(GULF.landingStartS + 10, GULF), 5 / 13);
    assert.equal(gulfLandingThrottlePeak(0, GULF), 0);
  });
});

describe("boosterLandingBellLit", () => {
  it("never lights the outer 20 on a landing burn", () => {
    for (let i = BOOSTER_LANDING_ENGINES; i < BOOSTER_ENGINE_COUNT; i++) {
      assert.equal(boosterLandingBellLit(i, 13), false, `outer ${i}`);
    }
  });

  it("keeps the inner 3 lit while the count stays ≥ 3", () => {
    for (let i = 0; i < BOOSTER_INNER_ENGINES; i++) {
      assert.equal(boosterLandingBellLit(i, 10), true);
      assert.equal(boosterLandingBellLit(i, 5), true);
    }
    assert.equal(boosterLandingBellLit(0, 2), true);
    assert.equal(boosterLandingBellLit(2, 2), false);
  });

  it("fills the mid ring after the inner 3", () => {
    assert.equal(boosterLandingBellLit(3, 10), true);
    assert.equal(boosterLandingBellLit(9, 10), true);
    assert.equal(boosterLandingBellLit(10, 10), false);
    assert.equal(boosterLandingBellLit(3, 5), true);
    assert.equal(boosterLandingBellLit(4, 5), true);
    assert.equal(boosterLandingBellLit(5, 5), false);
  });
});

describe("boosterEngineLit", () => {
  it("lights every bell on boostback (Flight 13 33-engine burn)", () => {
    for (let i = 0; i < BOOSTER_ENGINE_COUNT; i++) {
      assert.equal(
        boosterEngineLit(i, { burning: true, phase: "boostback", litCount: 10 }),
        true,
      );
    }
  });

  it("leaves bells full when not burning", () => {
    assert.equal(
      boosterEngineLit(20, { burning: false, phase: "landing", litCount: 5 }),
      true,
    );
  });

  it("dims failed landing engines", () => {
    assert.equal(
      boosterEngineLit(12, { burning: true, phase: "landing", litCount: 10 }),
      false,
    );
    assert.equal(
      boosterEngineLit(4, { burning: true, phase: "landing", litCount: 5 }),
      true,
    );
  });
});

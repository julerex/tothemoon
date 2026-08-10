/**
 * Unit tests for Flight 13 attitude / plasma / engine cadence helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  F13_ATT,
  entryPlasmaStrength,
  landingEngineCount,
  landingFlipBlend,
  shipAttitudeMode,
} from "./flight13Attitude.ts";

describe("shipAttitudeMode", () => {
  it("is prograde on ascent and early coast", () => {
    assert.equal(shipAttitudeMode(30, "ascent", 20, true), "prograde");
    assert.equal(shipAttitudeMode(1000, "coast", 400, false), "prograde");
  });

  it("belly-flops during entry", () => {
    assert.equal(shipAttitudeMode(F13_ATT.ENTRY, "entry", 80, false), "belly");
    assert.equal(shipAttitudeMode(3200, "entry", 40, false), "belly");
  });

  it("flips engines-first after the landing flip mark", () => {
    assert.equal(
      shipAttitudeMode(F13_ATT.LAND_BURN, "descent", 5, true),
      "belly",
    );
    assert.equal(
      shipAttitudeMode(F13_ATT.LAND_FLIP + 1, "descent", 3, true),
      "engines_first",
    );
  });

  it("settles radial-up at splashdown", () => {
    assert.equal(
      shipAttitudeMode(F13_ATT.SPLASH, "splashdown", 0.05, false),
      "radial_up",
    );
  });
});

describe("landingFlipBlend", () => {
  it("is 0 before flip and 1 after the blend window", () => {
    assert.equal(landingFlipBlend(F13_ATT.LAND_BURN), 0);
    assert.ok(landingFlipBlend(F13_ATT.LAND_FLIP + 0.5) > 0);
    assert.equal(landingFlipBlend(F13_ATT.LAND_FLIP + 3), 1);
  });
});

describe("landingEngineCount", () => {
  it("steps 3 → 2 → 1 during the landing burn", () => {
    assert.equal(landingEngineCount(F13_ATT.LAND_BURN + 1), 3);
    assert.equal(landingEngineCount(F13_ATT.LAND_3TO2 + 1), 2);
    assert.equal(landingEngineCount(F13_ATT.LAND_2TO1 + 1), 1);
    assert.equal(landingEngineCount(1000), 0);
  });
});

describe("entryPlasmaStrength", () => {
  it("peaks mid-entry hypersonic and is zero on pad", () => {
    assert.equal(entryPlasmaStrength(10, "launch", 5, 0.1), 0);
    const mid = entryPlasmaStrength(3000, "entry", 55, 6);
    assert.ok(mid > 0.3, `mid plasma ${mid}`);
    const late = entryPlasmaStrength(F13_ATT.TRANSONIC + 30, "entry", 20, 0.8);
    assert.ok(late < 0.15, `late plasma ${late}`);
  });
});

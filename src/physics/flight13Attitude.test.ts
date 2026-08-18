/**
 * Unit tests for Flight 13 attitude / plasma / engine cadence helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  F13_ATT,
  FWD_FLAP_REST_RAD,
  entryFlapDeflectionRad,
  entryPlasmaStrength,
  entryVisualBank,
  landingEngineCount,
  landingFlipBlend,
  plasmaBankOffset,
  shipAttitudeMode,
  splashFloatBob,
  splashFloatRadiusKm,
  splashLieBlend,
  SHIP_BARREL_RADIUS_KM,
  SPLASH_WATERLINE_ALT_KM,
} from "./flight13Attitude.ts";
import { EARTH_SURFACE_ALT_KM } from "./constants.ts";
import { FLIGHT13_SPLASH_LAT } from "./flight13Corridor.ts";
import { geocentricRadiusAt } from "./wgs84.ts";

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

  it("lies afloat after splashdown", () => {
    assert.equal(
      shipAttitudeMode(F13_ATT.SPLASH, "splashdown", 0.05, false),
      "afloat",
    );
  });

  it("stays engines-first through the last meters of descent", () => {
    assert.equal(
      shipAttitudeMode(F13_ATT.LAND_BURN - 10, "descent", 0.08, false),
      "engines_first",
    );
  });
});

describe("splashFloatBob", () => {
  it("is a small scrub-stable swell", () => {
    const a = splashFloatBob(4000);
    const b = splashFloatBob(4000);
    assert.deepEqual(a, b);
    assert.ok(Math.abs(a.pitchRad) < 0.06);
    assert.ok(Math.abs(a.rollRad) < 0.05);
    assert.notEqual(splashFloatBob(4004).pitchRad, a.pitchRad);
  });
});

describe("splashLieBlend / splashFloatRadiusKm", () => {
  it("is upright at splash and fully down after the tip-over", () => {
    assert.equal(splashLieBlend(F13_ATT.SPLASH), 0);
    assert.equal(splashLieBlend(F13_ATT.SPLASH + 3), 1);
    assert.ok(splashLieBlend(F13_ATT.SPLASH + 1) > 0.2);
    assert.ok(splashLieBlend(F13_ATT.SPLASH + 1) < 0.9);
  });

  it("seats engines at the waterline, then lifts the origin as the hull lies down", () => {
    const up = splashFloatRadiusKm(F13_ATT.SPLASH);
    const down = splashFloatRadiusKm(F13_ATT.SPLASH + 4);
    const water = geocentricRadiusAt(
      FLIGHT13_SPLASH_LAT,
      EARTH_SURFACE_ALT_KM + SPLASH_WATERLINE_ALT_KM,
    );
    assert.ok(Math.abs(up - water) < 1e-9);
    assert.ok(down > up);
    assert.ok(down - up < SHIP_BARREL_RADIUS_KM * 0.4);
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

describe("entryFlapDeflectionRad", () => {
  it("stays at rest outside the Flight 13 entry window", () => {
    const rest = entryFlapDeflectionRad(30, "ascent", 20, "prograde");
    assert.equal(rest.fwd, FWD_FLAP_REST_RAD);
    assert.equal(rest.aft, 0);
    const lunar = entryFlapDeflectionRad(400_000, "descent", 5, "belly");
    assert.equal(lunar.fwd, FWD_FLAP_REST_RAD);
    assert.equal(lunar.aft, 0);
  });

  it("throws fully in belly-flop then tapers through transonic", () => {
    const belly = entryFlapDeflectionRad(F13_ATT.ENTRY + 10, "entry", 80, "belly");
    assert.ok(belly.fwd > FWD_FLAP_REST_RAD + 0.4);
    assert.ok(belly.aft > 0.3);
    const late = entryFlapDeflectionRad(F13_ATT.TRANSONIC + 40, "entry", 20, "belly");
    assert.ok(late.fwd < belly.fwd);
    assert.ok(late.aft < belly.aft);
  });

  it("folds toward rest after the landing flip", () => {
    const after = entryFlapDeflectionRad(F13_ATT.LAND_FLIP + 3, "descent", 2, "engines_first");
    assert.ok(after.fwd <= FWD_FLAP_REST_RAD + 0.05);
    assert.ok(after.aft < 0.05);
  });
});

describe("entryVisualBank / plasmaBankOffset", () => {
  it("is +1 when starboard aligns with up × air", () => {
    const bank = entryVisualBank(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
    );
    assert.ok(Math.abs(bank - 1) < 1e-9);
  });

  it("offsets the trail with bank and is scrub-stable", () => {
    const a = plasmaBankOffset(0.5);
    const b = plasmaBankOffset(0.5);
    assert.deepEqual(a, b);
    assert.ok(a.trailX > 0);
    assert.ok(a.trailOpMul > 1);
    assert.equal(plasmaBankOffset(0).trailX, 0);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lowLunarOrbitPeriodS } from "./capture.ts";
import { LOW_LUNAR_ORBIT_ALTITUDE_KM, MU_MOON, R_MOON } from "./constants.ts";

describe("capture helpers", () => {
  it("lowLunarOrbitPeriodS matches two-body circular period", () => {
    const r = R_MOON + LOW_LUNAR_ORBIT_ALTITUDE_KM;
    const expected = 2 * Math.PI * Math.sqrt((r * r * r) / MU_MOON);
    assert.ok(Math.abs(lowLunarOrbitPeriodS(r) - expected) < 1e-9);
    // ~2 h class for ~120 km low lunar orbit
    assert.ok(lowLunarOrbitPeriodS(r) > 6000 && lowLunarOrbitPeriodS(r) < 8000);
  });

  it("lowLunarOrbitPeriodS clamps radius below surface + 50 km", () => {
    const floor = R_MOON + 50;
    const atFloor = lowLunarOrbitPeriodS(floor);
    const below = lowLunarOrbitPeriodS(R_MOON); // should clamp to floor
    assert.equal(below, atFloor);
  });
});

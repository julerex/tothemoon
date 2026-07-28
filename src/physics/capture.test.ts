import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lloPeriodS } from "./capture.ts";
import { LLO_ALT_KM, MU_MOON, R_MOON } from "./constants.ts";

describe("capture helpers", () => {
  it("lloPeriodS matches two-body circular period", () => {
    const r = R_MOON + LLO_ALT_KM;
    const expected = 2 * Math.PI * Math.sqrt((r * r * r) / MU_MOON);
    assert.ok(Math.abs(lloPeriodS(r) - expected) < 1e-9);
    // ~2 h class for ~120 km LLO
    assert.ok(lloPeriodS(r) > 6000 && lloPeriodS(r) < 8000);
  });

  it("lloPeriodS clamps radius below surface + 50 km", () => {
    const floor = R_MOON + 50;
    const atFloor = lloPeriodS(floor);
    const below = lloPeriodS(R_MOON); // should clamp to floor
    assert.equal(below, atFloor);
  });
});

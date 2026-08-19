/**
 * Raptor 3 fluting / soot contracts (engines-cam stills).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RAPTOR_FLUTE_COUNT,
  raptorBellBump,
  raptorBellRgb,
  raptorBellSoot,
  raptorFluteHeight,
} from "./craft/raptorBell.ts";

describe("raptor fluting", () => {
  it("uses enough cooling-channel ridges to read at engines-cam range", () => {
    assert.ok(RAPTOR_FLUTE_COUNT >= 20 && RAPTOR_FLUTE_COUNT <= 32);
  });

  it("is periodic in U and peaked on the ridges", () => {
    const a = raptorFluteHeight(0);
    assert.ok(Math.abs(raptorFluteHeight(1) - a) < 1e-12);
    assert.ok(Math.abs(raptorFluteHeight(0.5) - a) < 1e-12);
    let max = 0;
    let min = 1;
    for (let i = 0; i < RAPTOR_FLUTE_COUNT * 4; i++) {
      const h = raptorFluteHeight(i / (RAPTOR_FLUTE_COUNT * 4));
      max = Math.max(max, h);
      min = Math.min(min, h);
    }
    assert.ok(max > 0.9);
    assert.ok(min < 0.05);
  });
});

describe("raptor soot", () => {
  it("darkens toward the exit (V=0) and stays clean at the throat", () => {
    assert.ok(raptorBellSoot(0) > raptorBellSoot(0.5));
    assert.ok(raptorBellSoot(1) < 0.02);
    assert.equal(raptorBellSoot(Number.NaN), 0);
  });
});

describe("raptor albedo", () => {
  it("is deterministic gunmetal, brighter on ridges than in the valleys", () => {
    const ridge = raptorBellRgb(0.5 / RAPTOR_FLUTE_COUNT, 0.6);
    const valley = raptorBellRgb(0, 0.6);
    assert.ok(ridge.r > valley.r);
    assert.equal(raptorBellRgb(0, 0.6).r, valley.r);
    assert.ok(ridge.r > 40 && ridge.r < 180);
  });

  it("keeps bump higher on a ridge than in a valley", () => {
    const ridge = raptorBellBump(0.5 / RAPTOR_FLUTE_COUNT, 0.5);
    const valley = raptorBellBump(0, 0.5);
    assert.ok(ridge > valley);
  });
});

/**
 * Unit tests for Super Heavy cryo frost + ice-shed helpers (`craftFrost.ts`).
 *
 * Scrub-stable, no THREE — V14.2 launch-scene frost.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FROST_PATCHES,
  frostPatchOpacity,
  frostStrength,
  ICE_FLAKES,
  iceFlakePose,
  iceShedStrength,
  type FrostFxState,
} from "./craftFrost.ts";

const hold: FrostFxState = {
  missionT: -40,
  phase: "launch",
  burning: false,
  altEarth: 0.05,
};

const liftoff: FrostFxState = {
  missionT: 2,
  phase: "launch",
  burning: true,
  altEarth: 0.12,
};

const maxQ: FrostFxState = {
  missionT: 16,
  phase: "ascent",
  burning: true,
  altEarth: 8,
};

describe("frostStrength", () => {
  it("is strong on the T− hold", () => {
    assert.ok(frostStrength(hold) > 0.75);
  });

  it("is still visible at liftoff and fades toward vacuum", () => {
    const t0 = frostStrength(liftoff);
    const late = frostStrength({ ...maxQ, missionT: 80, altEarth: 30 });
    assert.ok(t0 > 0.7);
    assert.ok(late < t0);
    assert.equal(frostStrength({ ...liftoff, altEarth: 55 }), 0);
    assert.equal(frostStrength({ ...liftoff, phase: "coast", missionT: 200 }), 0);
  });

  it("is scrub-stable", () => {
    assert.deepEqual(frostStrength(liftoff), frostStrength(liftoff));
  });
});

describe("iceShedStrength", () => {
  it("is zero on hold and before light", () => {
    assert.equal(iceShedStrength(hold), 0);
    assert.equal(iceShedStrength({ ...liftoff, missionT: 0, burning: true }), 0);
  });

  it("peaks during early ascent (T+16 class)", () => {
    const peak = iceShedStrength(maxQ);
    const early = iceShedStrength(liftoff);
    const late = iceShedStrength({ ...maxQ, missionT: 70, altEarth: 25 });
    assert.ok(peak > 0.5);
    assert.ok(peak > early);
    assert.ok(peak > late);
  });

  it("is zero when engines are out", () => {
    assert.equal(iceShedStrength({ ...maxQ, burning: false }), 0);
  });

  it("is scrub-stable", () => {
    assert.deepEqual(iceShedStrength(maxQ), iceShedStrength(maxQ));
  });
});

describe("frost / ice poses", () => {
  it("keeps frost patches translucent", () => {
    const a = frostPatchOpacity(1, 0.2, 2);
    const b = frostPatchOpacity(1, 0.2, 2);
    assert.equal(a, b);
    assert.ok(a > 0.55 && a < 0.98);
    assert.equal(FROST_PATCHES.length, 6);
  });

  it("drifts ice flakes outward as shed rises", () => {
    const spec = ICE_FLAKES[0]!;
    const low = iceFlakePose(spec, 0.2, 16);
    const high = iceFlakePose(spec, 1, 16);
    const r = (p: { position: { x: number; y: number } }) =>
      Math.hypot(p.position.x, p.position.y);
    assert.ok(r(high) > r(low));
    assert.ok(high.opacity > low.opacity);
    assert.deepEqual(iceFlakePose(spec, 1, 16), iceFlakePose(spec, 1, 16));
    assert.equal(ICE_FLAKES.length, 10);
  });
});

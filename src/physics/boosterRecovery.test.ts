import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bodyPositions } from "./bodies.ts";
import {
  BOOSTBACK_END_S,
  BOOSTBACK_START_S,
  BOOSTER_VISIBLE_S,
  buildBoosterKeyframes,
  boosterPhaseAt,
  CATCH_ALT_KM,
  LANDING_END_S,
  LANDING_START_S,
  sampleBoosterRecovery,
  type StageState,
} from "./boosterRecovery.ts";
import { R_EARTH } from "./constants.ts";
import { starbasePadState } from "./earthFrame.ts";
import { v3 } from "./vec3.ts";

/** Synthetic stage-out ~100 km above Starbase with eastward Earth-relative velocity. */
function syntheticStage(t = 140): StageState {
  const pad = starbasePadState(t);
  const b = bodyPositions(t);
  // 100 km AGL along pad up
  const pos = v3(
    pad.pos.x + pad.up.x * 100,
    pad.pos.y + pad.up.y * 100,
    pad.pos.z + pad.up.z * 100,
  );
  // ~2.2 km/s downrange (east) + small climb, plus Earth velocity
  const vel = v3(
    b.earthVel.x + pad.east.x * 2.2 + pad.up.x * 0.3,
    b.earthVel.y + pad.east.y * 2.2 + pad.up.y * 0.3,
    b.earthVel.z + pad.east.z * 2.2 + pad.up.z * 0.3,
  );
  return { t, pos, vel };
}

function earthAlt(t: number, pos: { x: number; y: number; z: number }): number {
  const b = bodyPositions(t);
  return (
    Math.hypot(pos.x - b.earth.x, pos.y - b.earth.y, pos.z - b.earth.z) -
    R_EARTH
  );
}

function distToPad(t: number, pos: { x: number; y: number; z: number }): number {
  const pad = starbasePadState(t);
  return Math.hypot(pos.x - pad.pos.x, pos.y - pad.pos.y, pos.z - pad.pos.z);
}

describe("boosterPhaseAt", () => {
  it("walks sep → flip → boostback → coast → landing → caught → done", () => {
    assert.equal(boosterPhaseAt(-1), "done");
    assert.equal(boosterPhaseAt(0), "sep");
    assert.equal(boosterPhaseAt(3), "flip");
    assert.equal(boosterPhaseAt(BOOSTBACK_START_S + 1), "boostback");
    assert.equal(boosterPhaseAt(BOOSTBACK_END_S + 1), "coast");
    assert.equal(boosterPhaseAt(LANDING_START_S + 1), "landing");
    assert.equal(boosterPhaseAt(LANDING_END_S + 1), "caught");
    assert.equal(boosterPhaseAt(BOOSTER_VISIBLE_S + 1), "done");
  });
});

describe("buildBoosterKeyframes", () => {
  it("returns increasing ages and Earth-relative altitudes", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    assert.ok(kfs.length >= 5);
    for (let i = 1; i < kfs.length; i++) {
      assert.ok(kfs[i]!.age > kfs[i - 1]!.age);
    }
    for (const k of kfs) {
      const alt = Math.hypot(k.p.x, k.p.y, k.p.z) - R_EARTH;
      assert.ok(alt > -1, `alt ${alt} at age ${k.age}`);
      assert.ok(Number.isFinite(k.v.x) && Number.isFinite(k.v.y));
    }
  });
});

describe("sampleBoosterRecovery", () => {
  it("is finite and stays above the surface for the full window", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    for (let age = 0; age <= BOOSTER_VISIBLE_S; age += 5) {
      const s = sampleBoosterRecovery(stage, age, kfs);
      assert.ok(Number.isFinite(s.pos.x), `pos at ${age}`);
      assert.ok(Number.isFinite(s.vel.x), `vel at ${age}`);
      if (s.fade > 0.02) {
        const alt = earthAlt(stage.t + age, s.pos);
        assert.ok(alt > -0.5, `below surface alt=${alt} age=${age}`);
      }
    }
  });

  it("burns during boostback and landing windows", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    const midBB = sampleBoosterRecovery(
      stage,
      (BOOSTBACK_START_S + BOOSTBACK_END_S) / 2,
      kfs,
    );
    assert.equal(midBB.phase, "boostback");
    assert.ok(midBB.burning);
    assert.ok(midBB.throttle > 0.3);

    const midLand = sampleBoosterRecovery(
      stage,
      (LANDING_START_S + LANDING_END_S) / 2,
      kfs,
    );
    assert.equal(midLand.phase, "landing");
    assert.ok(midLand.burning);
    assert.ok(midLand.throttle > 0.3);

    const coast = sampleBoosterRecovery(stage, 100, kfs);
    assert.equal(coast.phase, "coast");
    assert.equal(coast.burning, false);
  });

  it("ends near the Starbase chopsticks after the landing burn", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    const caught = sampleBoosterRecovery(stage, LANDING_END_S, kfs);
    assert.equal(caught.phase, "caught");
    const d = distToPad(stage.t + LANDING_END_S, caught.pos);
    // Catch is CATCH_ALT_KM above pad; allow a few hundred meters of theater slop
    assert.ok(
      d < CATCH_ALT_KM + 0.15,
      `catch dist to pad ${d} km (want ~${CATCH_ALT_KM})`,
    );
    const alt = earthAlt(stage.t + LANDING_END_S, caught.pos);
    assert.ok(alt > 0 && alt < 0.5, `catch alt ${alt}`);
  });

  it("fades out after the catch hold", () => {
    const stage = syntheticStage();
    const mid = sampleBoosterRecovery(stage, LANDING_END_S + 10);
    assert.ok(mid.fade > 0.99);
    const end = sampleBoosterRecovery(stage, BOOSTER_VISIBLE_S);
    assert.ok(end.fade < 0.05);
    const after = sampleBoosterRecovery(stage, BOOSTER_VISIBLE_S + 10);
    assert.equal(after.phase, "done");
    assert.equal(after.fade, 0);
  });

  it("is scrub-stable: same age ⇒ same sample", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    const a = sampleBoosterRecovery(stage, 200, kfs);
    const b = sampleBoosterRecovery(stage, 200, kfs);
    assert.equal(a.pos.x, b.pos.x);
    assert.equal(a.pos.y, b.pos.y);
    assert.equal(a.throttle, b.throttle);
    assert.equal(a.phase, b.phase);
  });
});

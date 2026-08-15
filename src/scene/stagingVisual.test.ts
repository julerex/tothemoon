/**
 * Unit tests for pure detached-booster poses (`stagingVisual.ts`).
 *
 * Covers the separation flash envelope, boostback / landing contact flashes,
 * locator gating, plume target, and the look-at up-axis swap. No THREE / DOM.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOSTBACK_START_S,
  boosterVisibleS,
  recoverySchedule,
} from "../physics/boosterRecovery.ts";
import {
  boosterFadeScale,
  boosterLocatorOpacity,
  boosterMeshVisible,
  boosterUpAxis,
  deriveStagingVisual,
  legacyPlumePose,
  LOCATOR_OPACITY,
  recoveryAge,
  recoveryLightPose,
  recoveryPlumeTarget,
  stageFlashPose,
  STAGE_FLASH_S,
} from "./stagingVisual.ts";
import { plumeLook } from "./plumeRegime.ts";

describe("stageFlashPose", () => {
  it("hides before separation and after the flash lifetime", () => {
    assert.equal(stageFlashPose(-0.1).visible, false);
    assert.equal(stageFlashPose(STAGE_FLASH_S + 0.01).visible, false);
  });

  it("pins to the craft only for the first frames", () => {
    assert.equal(stageFlashPose(0).atCraft, true);
    assert.equal(stageFlashPose(0.049).atCraft, true);
    assert.equal(stageFlashPose(0.05).atCraft, false);
  });

  it("expands while fading out", () => {
    const early = stageFlashPose(0.2);
    const late = stageFlashPose(3.0);
    assert.ok(late.scale > early.scale, "flash should expand");
    assert.ok(late.opacity < early.opacity, "flash should fade");
    assert.ok(stageFlashPose(STAGE_FLASH_S).opacity < 1e-12);
  });

  it("keeps opacity a valid fraction across the lifetime", () => {
    for (let age = 0; age <= STAGE_FLASH_S; age += STAGE_FLASH_S / 32) {
      const p = stageFlashPose(age);
      assert.ok(p.opacity >= 0 && p.opacity <= 0.9, `opacity ${p.opacity}`);
    }
  });
});

describe("deriveStagingVisual", () => {
  it("is scrub-stable for the same age", () => {
    assert.deepEqual(
      deriveStagingVisual(5, "chopsticks"),
      deriveStagingVisual(5, "chopsticks"),
    );
  });

  it("lights the boostback flash just after ignition, offset off the engines", () => {
    // Strength rises over ~0.25 s, so ignition itself is still dark.
    assert.equal(
      deriveStagingVisual(BOOSTBACK_START_S, "chopsticks").boostbackFlash.visible,
      false,
    );
    const lit = deriveStagingVisual(BOOSTBACK_START_S + 0.5, "chopsticks").boostbackFlash;
    assert.equal(lit.visible, true);
    assert.ok(lit.noseOffset > 0);
    assert.ok(lit.opacity > 0);
  });

  it("keeps the landing flash dark mid-coast", () => {
    assert.equal(deriveStagingVisual(120, "chopsticks").landingFlash.visible, false);
  });

  it("fires the landing flash at the profile's touchdown", () => {
    for (const profile of ["chopsticks", "gulf"] as const) {
      const sched = recoverySchedule(profile);
      const pose = deriveStagingVisual(sched.landingEndS, profile).landingFlash;
      assert.equal(pose.visible, true, `${profile} contact flash`);
      assert.ok(pose.opacity > 0);
    }
  });

  it("fades the locator out well before the recovery ends", () => {
    assert.ok(deriveStagingVisual(1, "chopsticks").locatorOpacity > 0);
    assert.equal(deriveStagingVisual(600, "chopsticks").locatorOpacity, 0);
  });
});

describe("boosterLocatorOpacity", () => {
  it("never exceeds the dim locator ceiling", () => {
    for (let age = 0; age < 60; age += 0.5) {
      const o = boosterLocatorOpacity(age);
      assert.ok(o >= 0 && o <= LOCATOR_OPACITY, `opacity ${o} at age ${age}`);
    }
  });
});

describe("recoveryAge", () => {
  it("is null before stage-out", () => {
    assert.equal(recoveryAge(90, 100, "chopsticks"), null);
  });

  it("counts up from stage-out", () => {
    assert.equal(recoveryAge(130, 100, "chopsticks"), 30);
  });

  it("is null once the booster has left the theater", () => {
    const window = boosterVisibleS(recoverySchedule("chopsticks"));
    assert.equal(recoveryAge(100 + window, 100, "chopsticks"), window);
    assert.equal(recoveryAge(100 + window + 1, 100, "chopsticks"), null);
  });
});

describe("boosterMeshVisible / boosterFadeScale", () => {
  it("drops the mesh once faded or done", () => {
    assert.equal(boosterMeshVisible({ fade: 1, phase: "coast" }), true);
    assert.equal(boosterMeshVisible({ fade: 0.01, phase: "coast" }), false);
    assert.equal(boosterMeshVisible({ fade: 1, phase: "done" }), false);
  });

  it("never scales the mesh to exactly zero", () => {
    assert.ok(boosterFadeScale(0) > 0);
    assert.equal(boosterFadeScale(0.5), 0.5);
  });
});

describe("boosterUpAxis", () => {
  it("uses +Y for a nose across the equator", () => {
    assert.deepEqual(boosterUpAxis({ x: 1, y: 0, z: 0 }), { x: 0, y: 1, z: 0 });
  });

  it("swaps to +X when the nose is nearly parallel to +Y", () => {
    assert.deepEqual(boosterUpAxis({ x: 0, y: 1, z: 0 }), { x: 1, y: 0, z: 0 });
    assert.deepEqual(boosterUpAxis({ x: 0, y: -0.99, z: 0 }), { x: 1, y: 0, z: 0 });
  });
});

describe("recoveryPlumeTarget", () => {
  it("is zero at cutoff and one at full throttle", () => {
    assert.equal(recoveryPlumeTarget(0), 0);
    assert.equal(recoveryPlumeTarget(1), 1);
  });

  it("rises monotonically and clamps above full throttle", () => {
    assert.ok(recoveryPlumeTarget(0.8) > recoveryPlumeTarget(0.4));
    assert.equal(recoveryPlumeTarget(1.5), 1.5);
  });
});

describe("recoveryLightPose / legacyPlumePose", () => {
  const look = plumeLook("boostback", "booster");

  it("brightens and widens the exhaust light with fill", () => {
    const low = recoveryLightPose(0, look, 1);
    const high = recoveryLightPose(1, look, 1);
    assert.ok(high.intensity > low.intensity);
    assert.ok(high.distance > low.distance);
  });

  it("scales the legacy sprite along the plume axis", () => {
    const pose = legacyPlumePose(1, look, 1);
    assert.ok(pose.scaleY > pose.scaleX, "plume is longer than wide");
    assert.ok(pose.opacity > 0);
    assert.ok(pose.z < 0, "sprite sits aft of the engines");
  });
});

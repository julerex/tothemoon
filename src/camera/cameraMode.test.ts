import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FIXED_CAMERAS,
  FREE_LOOK_CAMERAS,
  isBoosterMountFocus,
  isFixedCamera,
  isFreeLookCamera,
  isPadFocus,
  type CameraMode,
} from "./cameraMode.ts";

const ALL_MODES: readonly CameraMode[] = [
  "free",
  "sun",
  "earth",
  "chase",
  "moon",
  "starbase",
  "aerial",
  "fin",
  "gridfin",
  "trench",
  "hull",
  "drone",
  "engines",
  "enginesDown",
  "booster",
  "tower",
];

describe("free vs fixed cameras", () => {
  it("puts sun, earth, moon, launch tower, booster, and Starship on the free rail", () => {
    assert.deepEqual(FREE_LOOK_CAMERAS, [
      "sun",
      "earth",
      "moon",
      "booster",
      "tower",
      "chase",
    ]);
  });

  it("puts livestream analogs on the fixed rail", () => {
    assert.ok(FIXED_CAMERAS.includes("aerial"));
    assert.ok(FIXED_CAMERAS.includes("fin"));
    assert.ok(FIXED_CAMERAS.includes("drone"));
    assert.ok(!FIXED_CAMERAS.includes("tower"));
    assert.ok(!FIXED_CAMERAS.includes("chase"));
  });

  it("locks the flame-trench look and both booster engine-bay mounts", () => {
    for (const mode of ["trench", "engines", "enginesDown"] as const) {
      assert.equal(isFixedCamera(mode), true, mode);
      assert.ok(FIXED_CAMERAS.includes(mode), mode);
    }
  });

  it("classifies every CameraMode as exactly one of free-look or fixed", () => {
    for (const mode of ALL_MODES) {
      assert.equal(
        isFreeLookCamera(mode),
        !isFixedCamera(mode),
        `${mode} should be free or fixed, not both or neither`,
      );
    }
    assert.equal(isFreeLookCamera("free"), true);
    assert.equal(isFixedCamera("free"), false);
  });

  it("rail lists omit internal free and cover the rest", () => {
    const rail = new Set([...FREE_LOOK_CAMERAS, ...FIXED_CAMERAS]);
    assert.equal(rail.size, FREE_LOOK_CAMERAS.length + FIXED_CAMERAS.length);
    for (const mode of ALL_MODES) {
      if (mode === "free") {
        assert.equal(rail.has(mode), false);
        continue;
      }
      assert.equal(rail.has(mode), true, `${mode} missing from a rail`);
    }
  });
});

describe("isPadFocus", () => {
  it("is true for Starbase, the pad flying drone, and the launch tower", () => {
    assert.equal(isPadFocus("starbase"), true);
    assert.equal(isPadFocus("aerial"), true);
    assert.equal(isPadFocus("tower"), true);
  });

  it("is false for recovery drone and other rails", () => {
    assert.equal(isPadFocus("drone"), false);
    assert.equal(isPadFocus("chase"), false);
    assert.equal(isPadFocus("trench"), false);
    assert.equal(isPadFocus("booster"), false);
  });
});

describe("isBoosterMountFocus", () => {
  it("is true for Super Heavy onboard mounts", () => {
    assert.equal(isBoosterMountFocus("gridfin"), true);
    assert.equal(isBoosterMountFocus("engines"), true);
    assert.equal(isBoosterMountFocus("enginesDown"), true);
  });

  it("is false for ship, pad, and body cameras", () => {
    assert.equal(isBoosterMountFocus("hull"), false);
    assert.equal(isBoosterMountFocus("fin"), false);
    assert.equal(isBoosterMountFocus("trench"), false);
    assert.equal(isBoosterMountFocus("chase"), false);
  });
});

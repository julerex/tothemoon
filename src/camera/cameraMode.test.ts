import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBoosterMountFocus, isPadFocus } from "./cameraMode.ts";

describe("isPadFocus", () => {
  it("is true for Starbase and the pad flying drone", () => {
    assert.equal(isPadFocus("starbase"), true);
    assert.equal(isPadFocus("aerial"), true);
  });

  it("is false for recovery drone and other rails", () => {
    assert.equal(isPadFocus("drone"), false);
    assert.equal(isPadFocus("chase"), false);
    assert.equal(isPadFocus("trench"), false);
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

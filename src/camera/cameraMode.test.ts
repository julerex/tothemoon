import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPadFocus } from "./cameraMode.ts";

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

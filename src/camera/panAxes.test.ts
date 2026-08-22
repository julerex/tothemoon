import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { panAxesFromHeld } from "./panAxes.ts";

const none = {
  w: false,
  a: false,
  s: false,
  d: false,
  t: false,
  b: false,
};

describe("panAxesFromHeld", () => {
  it("is idle when no pan keys are held", () => {
    assert.deepEqual(panAxesFromHeld(none), { fwd: 0, right: 0, up: 0 });
  });

  it("W pans forward and S pans back", () => {
    assert.deepEqual(panAxesFromHeld({ ...none, w: true }), {
      fwd: 1,
      right: 0,
      up: 0,
    });
    assert.deepEqual(panAxesFromHeld({ ...none, s: true }), {
      fwd: -1,
      right: 0,
      up: 0,
    });
  });

  it("A pans screen-right and D pans screen-left", () => {
    assert.deepEqual(panAxesFromHeld({ ...none, a: true }), {
      fwd: 0,
      right: 1,
      up: 0,
    });
    assert.deepEqual(panAxesFromHeld({ ...none, d: true }), {
      fwd: 0,
      right: -1,
      up: 0,
    });
  });

  it("T pans up and B pans down", () => {
    assert.deepEqual(panAxesFromHeld({ ...none, t: true }), {
      fwd: 0,
      right: 0,
      up: 1,
    });
    assert.deepEqual(panAxesFromHeld({ ...none, b: true }), {
      fwd: 0,
      right: 0,
      up: -1,
    });
  });

  it("cancels opposite keys on the same axis", () => {
    assert.deepEqual(panAxesFromHeld({ ...none, w: true, s: true }), {
      fwd: 0,
      right: 0,
      up: 0,
    });
    assert.deepEqual(panAxesFromHeld({ ...none, a: true, d: true }), {
      fwd: 0,
      right: 0,
      up: 0,
    });
    assert.deepEqual(panAxesFromHeld({ ...none, t: true, b: true }), {
      fwd: 0,
      right: 0,
      up: 0,
    });
  });
});


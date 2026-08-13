import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { earthNorthPole, starbasePadState } from "../physics/earthFrame.ts";
import { v3 } from "../physics/vec3.ts";
import { ECLIPTIC_NORTH_AXIS, yawAxisForMode } from "./yawAxis.ts";

describe("yawAxisForMode", () => {
  it("sun yaws about ecliptic north (perp to Earth's orbital ellipse)", () => {
    const out = v3(1, 1, 1);
    const axis = yawAxisForMode("sun", 0, out);
    assert.ok(axis);
    assert.equal(axis.x, ECLIPTIC_NORTH_AXIS.x);
    assert.equal(axis.y, ECLIPTIC_NORTH_AXIS.y);
    assert.equal(axis.z, ECLIPTIC_NORTH_AXIS.z);
    assert.equal(axis, out);
  });

  it("earth yaws about the geographic north–south pole", () => {
    const out = v3();
    const axis = yawAxisForMode("earth", 0, out);
    const pole = earthNorthPole();
    assert.ok(axis);
    assert.equal(axis.x, pole.x);
    assert.equal(axis.y, pole.y);
    assert.equal(axis.z, pole.z);
  });

  it("starbase yaws about pad local up, not Earth's pole", () => {
    const t = 3600;
    const out = v3();
    const axis = yawAxisForMode("starbase", t, out);
    const pad = starbasePadState(t);
    const pole = earthNorthPole();
    assert.ok(axis);
    assert.equal(axis.x, pad.up.x);
    assert.equal(axis.y, pad.up.y);
    assert.equal(axis.z, pad.up.z);
    const sameAsPole =
      Math.abs(axis.x - pole.x) < 1e-9 &&
      Math.abs(axis.y - pole.y) < 1e-9 &&
      Math.abs(axis.z - pole.z) < 1e-9;
    assert.equal(sameAsPole, false);
  });

  it("other modes have no dedicated yaw axis", () => {
    assert.equal(yawAxisForMode("moon", 0, v3()), null);
    assert.equal(yawAxisForMode("chase", 0, v3()), null);
    assert.equal(yawAxisForMode("free", 0, v3()), null);
    assert.equal(yawAxisForMode("trench", 0, v3()), null);
  });
});

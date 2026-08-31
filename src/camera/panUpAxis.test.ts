import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { earthNorthPole, starbasePadState } from "../physics/earthFrame.ts";
import { v3 } from "../physics/vec3.ts";
import { panUpAxisForMode } from "./panUpAxis.ts";

describe("panUpAxisForMode", () => {
  it("starbase, aerial, Ground Camera One, and tower climb along pad local up, not Earth's pole", () => {
    const t = 3600;
    const out = v3();
    const axis = panUpAxisForMode("starbase", t, out);
    const pad = starbasePadState(t);
    const pole = earthNorthPole();
    assert.ok(axis);
    assert.equal(axis.x, pad.up.x);
    assert.equal(axis.y, pad.up.y);
    assert.equal(axis.z, pad.up.z);
    assert.equal(axis, out);
    const sameAsPole =
      Math.abs(axis.x - pole.x) < 1e-9 &&
      Math.abs(axis.y - pole.y) < 1e-9 &&
      Math.abs(axis.z - pole.z) < 1e-9;
    assert.equal(sameAsPole, false);
    assert.equal(panUpAxisForMode("aerial", t, v3())?.x, pad.up.x);
    assert.equal(panUpAxisForMode("ground1", t, v3())?.x, pad.up.x);
    assert.equal(panUpAxisForMode("tower", t, v3())?.x, pad.up.x);
  });

  it("other modes have no dedicated vertical pan axis", () => {
    assert.equal(panUpAxisForMode("moon", 0, v3()), null);
    assert.equal(panUpAxisForMode("chase", 0, v3()), null);
    assert.equal(panUpAxisForMode("booster", 0, v3()), null);
    assert.equal(panUpAxisForMode("earth", 0, v3()), null);
    assert.equal(panUpAxisForMode("free", 0, v3()), null);
    assert.equal(panUpAxisForMode("trench", 0, v3()), null);
  });
});

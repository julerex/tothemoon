/**
 * Unit tests for pushSample (shared trajectory sampler).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CraftState } from "./integrator.ts";
import { pushSample } from "./missionSample.ts";
import type { Sample } from "./missionTypes.ts";
import { createPropState, fuelShipFrac } from "./propellant.ts";
import { v3 } from "./vec3.ts";

const R_PLACE = 6500;

function craft(t: number): CraftState {
  return {
    t,
    pos: v3(R_PLACE, 0, 0),
    vel: v3(0, 7.5, 0),
  };
}

describe("pushSample", () => {
  it("appends a sample and advances lastT", () => {
    const out: Sample[] = [];
    const lastT = { t: -Infinity };
    pushSample(out, craft(10), "coast", false, true, 0, lastT);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.t, 10);
    assert.equal(out[0]!.phase, "coast");
    assert.equal(out[0]!.burning, false);
    assert.equal(lastT.t, 10);
  });

  it("respects minDt unless force is true", () => {
    const out: Sample[] = [];
    const lastT = { t: 0 };
    pushSample(out, craft(0.5), "ascent", true, false, 1, lastT);
    assert.equal(out.length, 0);
    pushSample(out, craft(0.5), "ascent", true, true, 1, lastT);
    assert.equal(out.length, 1);
  });

  it("coasts propellant when a is tiny", () => {
    const prop = createPropState(0);
    const ship0 = prop.shipPropKg;
    const out: Sample[] = [];
    const lastT = { t: -Infinity };
    pushSample(out, craft(1), "coast", false, true, 0, lastT, prop, 1e-6);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.thrustN, 0);
    assert.equal(prop.shipPropKg, ship0);
    assert.equal(out[0]!.fuelShip, fuelShipFrac(prop));
  });

  it("burns propellant when a is significant and consumeFuel is true", () => {
    const prop = createPropState(0);
    const ship0 = prop.shipPropKg;
    const out: Sample[] = [];
    const lastT = { t: -Infinity };
    pushSample(
      out,
      craft(2),
      "ascent",
      true,
      true,
      0,
      lastT,
      prop,
      0.02,
      "ship",
      true,
    );
    assert.equal(out.length, 1);
    assert.ok(out[0]!.thrustN > 0);
    assert.ok(prop.shipPropKg < ship0);
  });

  it("reports thrust without draining when consumeFuel is false", () => {
    const prop = createPropState(0);
    const ship0 = prop.shipPropKg;
    const out: Sample[] = [];
    const lastT = { t: -Infinity };
    pushSample(
      out,
      craft(3),
      "approach",
      true,
      true,
      0,
      lastT,
      prop,
      0.015,
      "ship",
      false,
    );
    assert.equal(out.length, 1);
    assert.ok(out[0]!.thrustN > 0);
    assert.equal(prop.shipPropKg, ship0);
  });

  it("defaults fuel when prop is null", () => {
    const out: Sample[] = [];
    const lastT = { t: -Infinity };
    pushSample(out, craft(0), "launch", true, true, 0, lastT, null);
    assert.equal(out[0]!.fuelBooster, 0);
    assert.equal(out[0]!.fuelShip, 1);
    assert.equal(out[0]!.staged, false);
  });

  it("clones position so later craft motion does not mutate samples", () => {
    const out: Sample[] = [];
    const lastT = { t: -Infinity };
    const state = craft(5);
    pushSample(out, state, "coast", false, true, 0, lastT);
    state.pos.x = 9999;
    assert.equal(out[0]!.pos.x, R_PLACE);
  });
});

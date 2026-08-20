/**
 * Mechazilla vs Super Heavy / Starship stack: published pad dimensions.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { craftLengthKm } from "./craft.ts";
import {
  CHOPSTICK_CATCH_M,
  CHOPSTICK_LEN_M,
  CHOPSTICK_REST_M,
  OLT_HEIGHT_M,
  OLT_TRUSS_M,
  TOWER_BEACON_Y,
  TOWER_H,
} from "./earthTheater/mechazillaTower.ts";

const STACK_H_M = craftLengthKm(false) * 1000;

describe("Mechazilla vs stacked Starship", () => {
  it("uses the 146 m OLT and 36 m chopsticks", () => {
    assert.equal(OLT_HEIGHT_M, 146);
    assert.equal(CHOPSTICK_LEN_M, 36);
  });

  it("keeps the main truss just above the 123 m stack", () => {
    assert.equal(STACK_H_M, 123);
    assert.ok(OLT_TRUSS_M > STACK_H_M);
    assert.ok(OLT_TRUSS_M < OLT_HEIGHT_M);
    assert.ok(STACK_H_M / OLT_TRUSS_M > 0.9);
    assert.ok(STACK_H_M / OLT_TRUSS_M < 0.98);
  });

  it("places the pad beacon at the lightning-rod height", () => {
    assert.equal(TOWER_H, OLT_TRUSS_M / 1000);
    assert.equal(TOWER_BEACON_Y, OLT_HEIGHT_M / 1000);
  });

  it("parks chopsticks at the ship nose for launch and drops to grid fins for catch", () => {
    assert.equal(CHOPSTICK_REST_M, 122);
    assert.equal(CHOPSTICK_CATCH_M, 72);
    assert.ok(Math.abs(CHOPSTICK_REST_M - STACK_H_M) < 8);
    assert.ok(CHOPSTICK_REST_M < OLT_TRUSS_M);
    assert.ok(CHOPSTICK_CATCH_M < 75 && CHOPSTICK_CATCH_M > 65);
  });
});

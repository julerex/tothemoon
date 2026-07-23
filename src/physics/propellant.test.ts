import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASCENT_ACCEL,
  BOOSTER_PROP_KG,
  BOOSTER_THRUST_N,
  SHIP_PROP_KG,
} from "./constants.ts";
import {
  applyImpulsiveShipDv,
  burnForce,
  burnProp,
  coastProp,
  createPropState,
  fuelBoosterFrac,
  fuelShipFrac,
  hasPropellant,
  limitAccelByThrust,
  stageBooster,
  thrustForceN,
  wetMassKg,
} from "./propellant.ts";

describe("propellant bookkeeping", () => {
  it("starts full and reports unit fractions", () => {
    const p = createPropState(0);
    assert.equal(fuelBoosterFrac(p), 1);
    assert.equal(fuelShipFrac(p), 1);
    assert.equal(p.staged, false);
    assert.ok(wetMassKg(p) > BOOSTER_PROP_KG);
  });

  it("burnProp drains the selected tank and never goes negative", () => {
    const p = createPropState(0);
    const F = burnProp(p, 60, ASCENT_ACCEL, "booster");
    assert.ok(F > 0);
    assert.ok(p.boosterPropKg < BOOSTER_PROP_KG);
    assert.equal(p.shipPropKg, SHIP_PROP_KG);
    assert.ok(fuelBoosterFrac(p) < 1);
    assert.ok(fuelBoosterFrac(p) > 0);

    // Long burn should clamp at zero, not NaN
    burnProp(p, 1e6, ASCENT_ACCEL, "booster");
    assert.equal(p.boosterPropKg, 0);
    assert.equal(fuelBoosterFrac(p), 0);
    assert.equal(hasPropellant(p, "booster"), false);
  });

  it("mass-coupled limitAccelByThrust respects peak thrust and empty tank", () => {
    const p = createPropState(0);
    const lim = limitAccelByThrust(p, ASCENT_ACCEL * 10, "booster");
    assert.ok(lim.forceN <= BOOSTER_THRUST_N + 1e-6);
    assert.ok(lim.aKmS2 > 0);
    // Empty → no thrust
    p.boosterPropKg = 0;
    const empty = limitAccelByThrust(p, ASCENT_ACCEL, "booster");
    assert.equal(empty.forceN, 0);
    assert.equal(empty.aKmS2, 0);
  });

  it("burnForce uses pure rocket equation and hard-stops when dry", () => {
    const p = createPropState(0);
    const m0 = wetMassKg(p);
    const F = BOOSTER_THRUST_N * 0.5;
    burnForce(p, 10, F, "booster");
    assert.ok(p.boosterPropKg < BOOSTER_PROP_KG);
    assert.ok(wetMassKg(p) < m0);
    // Drain completely
    burnForce(p, 1e9, F, "booster");
    assert.equal(p.boosterPropKg, 0);
    assert.equal(burnForce(p, 1e9 + 1, F, "booster"), 0);
  });

  it("coastProp advances the clock without draining", () => {
    const p = createPropState(0);
    const b0 = p.boosterPropKg;
    const s0 = p.shipPropKg;
    coastProp(p, 100);
    assert.equal(p.lastT, 100);
    assert.equal(p.boosterPropKg, b0);
    assert.equal(p.shipPropKg, s0);
  });

  it("zero accel reports zero thrust and does not drain", () => {
    const p = createPropState(0);
    const F = burnProp(p, 10, 0, "booster");
    assert.equal(F, 0);
    assert.equal(p.boosterPropKg, BOOSTER_PROP_KG);
  });

  it("stageBooster zeros booster and drops stack mass", () => {
    const p = createPropState(0);
    burnProp(p, 30, ASCENT_ACCEL, "booster");
    const before = wetMassKg(p);
    stageBooster(p, 30);
    assert.equal(p.staged, true);
    assert.equal(p.boosterPropKg, 0);
    assert.equal(fuelBoosterFrac(p), 0);
    assert.ok(wetMassKg(p) < before);
    // After stage, ship burns still work
    const F = burnProp(p, 60, 0.01, "ship");
    assert.ok(F > 0);
    assert.ok(p.shipPropKg < SHIP_PROP_KG);
  });

  it("thrustForceN matches wet mass × accel (SI)", () => {
    const p = createPropState(0);
    const a = 0.02; // km/s²
    const expected = wetMassKg(p) * a * 1000;
    assert.ok(Math.abs(thrustForceN(p, a) - expected) < 1e-6);
    assert.equal(thrustForceN(p, 0), 0);
  });

  it("applyImpulsiveShipDv reduces ship prop via pure rocket equation", () => {
    const p = createPropState(0);
    stageBooster(p, 0);
    const F = applyImpulsiveShipDv(p, 0, 3.1, 180);
    assert.ok(F > 0);
    assert.ok(p.shipPropKg < SHIP_PROP_KG);
    // Pure RE for 3.1 km/s at Isp 380 leaves a meaningful fraction
    assert.ok(fuelShipFrac(p) > 0.2);
    assert.ok(fuelShipFrac(p) < 0.95);
  });
});

/**
 * US76-ish piecewise atmosphere and altitude-varying entry aero.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATM_H_MAX_KM,
  ATM_RHO0_KG_KM3,
  ATM_SCALE_HEIGHT_KM,
  DRAG_CD_A_OVER_M,
} from "./constants.ts";
import {
  atmDensity,
  ENTRY_BELLY_CD_A_OVER_M,
  entryCdAOverM,
  entryLiftToDrag,
} from "./atmosphere.ts";

describe("atmDensity (US76-ish)", () => {
  it("is ρ0 at the surface and zero above cutoff", () => {
    assert.equal(atmDensity(0), ATM_RHO0_KG_KM3);
    assert.equal(atmDensity(ATM_H_MAX_KM + 1), 0);
    assert.ok(atmDensity(ATM_H_MAX_KM) > 0);
  });

  it("decreases with altitude inside the sensible atmosphere", () => {
    assert.ok(atmDensity(50) < atmDensity(10));
    assert.ok(atmDensity(80) < atmDensity(50));
    assert.ok(atmDensity(120) < atmDensity(80));
  });

  it("is continuous at published knots", () => {
    for (const h of [10, 25, 50, 80, 100, 120]) {
      const mid = atmDensity(h);
      const lo = atmDensity(h - 0.05);
      const hi = atmDensity(h + 0.05);
      assert.ok(Math.abs(lo / mid - 1) < 0.02, `left jump at ${h} km`);
      assert.ok(Math.abs(hi / mid - 1) < 0.02, `right jump at ${h} km`);
    }
  });

  it("matches US76 order of magnitude at key altitudes", () => {
    // kg/km³; 1 kg/m³ = 1e9 kg/km³
    assert.ok(atmDensity(25) > 3e7 && atmDensity(25) < 5e7);
    assert.ok(atmDensity(50) > 8e5 && atmDensity(50) < 1.3e6);
    assert.ok(atmDensity(80) > 1.5e4 && atmDensity(80) < 2.2e4);
    assert.ok(atmDensity(100) > 4e2 && atmDensity(100) < 7e2);
  });

  it("is denser than a 7.5 km single scale height in the troposphere", () => {
    const single = ATM_RHO0_KG_KM3 * Math.exp(-10 / ATM_SCALE_HEIGHT_KM);
    assert.ok(atmDensity(10) > single * 1.15);
  });

  it("is thinner than a 7.5 km single scale height in the mesosphere", () => {
    const single = ATM_RHO0_KG_KM3 * Math.exp(-80 / ATM_SCALE_HEIGHT_KM);
    assert.ok(atmDensity(80) < single * 0.8);
  });
});

describe("entry aero tables", () => {
  it("varies CdA with altitude and stays well above the stack factor", () => {
    assert.ok(entryCdAOverM(110) > DRAG_CD_A_OVER_M * 5);
    assert.ok(entryCdAOverM(50) > DRAG_CD_A_OVER_M * 5);
    assert.ok(entryCdAOverM(20) >= ENTRY_BELLY_CD_A_OVER_M * 0.7);
    assert.ok(entryCdAOverM(110) > entryCdAOverM(40));
  });

  it("keeps L/D theater-bounded with a hypersonic peak", () => {
    const peak = entryLiftToDrag(50);
    assert.ok(peak > entryLiftToDrag(95));
    assert.ok(peak > entryLiftToDrag(15));
    assert.ok(peak < 0.5);
    assert.ok(entryLiftToDrag(100) >= 0.05);
  });
});

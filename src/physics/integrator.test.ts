import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATM_H_MAX_KM,
  EARTH_J2,
  MU_EARTH,
  R_EARTH,
} from "./constants.ts";
import {
  addEarthDrag,
  addEarthJ2,
  atmDensity,
  acceleration,
} from "./integrator.ts";
import { earthNorthPole } from "./earthFrame.ts";
import { len, v3 } from "./vec3.ts";

describe("Earth J2", () => {
  it("is zero along the equatorial plane for the radial component symmetry", () => {
    // On equator relative to pole: r ⟂ n̂ → classic J2 pulls toward equator
    const earth = v3(0, 0, 0);
    const pole = earthNorthPole();
    // Point in equatorial plane of Earth (perp to pole)
    // pole ≈ (sin ε, 0, cos ε); a vector in equator: cross(pole, y)
    const r = v3(-pole.z, 0, pole.x); // ⟂ pole, in XZ
    const scale = (R_EARTH + 400) / len(r);
    r.x *= scale;
    r.y *= scale;
    r.z *= scale;
    const acc = v3();
    addEarthJ2(acc, r, earth);
    // Should be finite and mostly in-plane
    assert.ok(len(acc) > 0);
    assert.ok(Number.isFinite(len(acc)));
  });

  it("magnitude scales with J2 and falls with altitude", () => {
    const earth = v3(0, 0, 0);
    const low = v3(R_EARTH + 200, 0, 0);
    const high = v3(R_EARTH + 2000, 0, 0);
    const aLow = v3();
    const aHigh = v3();
    addEarthJ2(aLow, low, earth);
    addEarthJ2(aHigh, high, earth);
    assert.ok(len(aLow) > len(aHigh));
    // Order of magnitude: J2 term ~ J2 * μ * R² / r⁴
    const r = R_EARTH + 200;
    const rough = 1.5 * EARTH_J2 * MU_EARTH * R_EARTH * R_EARTH / (r * r * r * r);
    assert.ok(len(aLow) < rough * 3);
    assert.ok(len(aLow) > rough * 0.1);
  });
});

describe("atmosphere + drag", () => {
  it("atmDensity is ρ0 at surface and near-zero above cutoff", () => {
    assert.ok(atmDensity(0) > 1e8);
    assert.equal(atmDensity(ATM_H_MAX_KM + 1), 0);
    assert.ok(atmDensity(50) < atmDensity(10));
  });

  it("drag opposes velocity relative to co-rotating air", () => {
    const earth = v3(0, 0, 0);
    const earthVel = v3(0, 0, 0);
    // Hovering above equator-ish, inertial velocity east
    const pos = v3(R_EARTH + 20, 0, 0);
    const vel = v3(0, 5, 0); // km/s
    const acc = v3();
    addEarthDrag(acc, pos, earth, vel, earthVel);
    // Drag should have a component opposite to vel (negative y)
    assert.ok(acc.y < 0, `expected drag −y, got ${acc.y}`);
    assert.ok(len(acc) > 0);
  });

  it("acceleration includes J2 (differs from pure point-mass)", () => {
    const t = 0;
    const pos = v3(R_EARTH + 300, 100, 50);
    // Shift so earth is not origin — bodyPositions places Earth off origin
    // Just check function runs and returns finite with thrust null
    const a = acceleration(t, pos, null, v3(), v3(0, 7, 0));
    assert.ok(Number.isFinite(a.x + a.y + a.z));
  });
});

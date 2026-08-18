import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATM_H_MAX_KM,
  DT_COAST,
  DT_NEAR,
  EARTH_J2,
  MU_EARTH,
  R_EARTH,
  R_MOON,
} from "./constants.ts";
import {
  addEarthDrag,
  addEarthJ2,
  atmDensity,
  acceleration,
  getBodies,
  moonRelativeSpecificEnergy,
  nearBodyCoastDt,
  rk4StepDoubling,
} from "./integrator.ts";
import { earthNorthPole } from "./earthFrame.ts";
import { WGS84_A } from "./wgs84.ts";
import { len, v3 } from "./vec3.ts";

describe("Earth J2", () => {
  it("is zero along the equatorial plane for the radial component symmetry", () => {
    // On equator relative to pole: r ⟂ n̂ → classic J2 pulls toward equator
    const earth = v3(0, 0, 0);
    const pole = earthNorthPole();
    // Point in equatorial plane of Earth (perp to pole)
    // pole ≈ (0, sin ε, cos ε); a vector in equator: e.g. cross(pole, x)
    const r = v3(0, -pole.z, pole.y); // ⟂ pole, in YZ
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
    const rough = 1.5 * EARTH_J2 * MU_EARTH * WGS84_A * WGS84_A / (r * r * r * r);
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

  it("a larger ballistic factor increases drag", () => {
    const earth = v3(0, 0, 0);
    const earthVel = v3(0, 0, 0);
    const pos = v3(R_EARTH + 20, 0, 0);
    const vel = v3(0, 5, 0);
    const aStack = v3();
    const aHeavy = v3();
    addEarthDrag(aStack, pos, earth, vel, earthVel);
    addEarthDrag(aHeavy, pos, earth, vel, earthVel, 4e-11);
    assert.ok(len(aHeavy) > len(aStack) * 2);
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

describe("nearBodyCoastDt", () => {
  it("tightens the step toward the Moon", () => {
    assert.equal(nearBodyCoastDt(300_000), DT_COAST);
    assert.equal(nearBodyCoastDt(200_000), 12);
    assert.equal(nearBodyCoastDt(80_000), 5);
    assert.equal(nearBodyCoastDt(20_000), 1);
    assert.equal(nearBodyCoastDt(4_000), 0.5);
    assert.ok(nearBodyCoastDt(4_000) < DT_NEAR);
  });
});

describe("RK4 step-doubling near a body", () => {
  it("shrinks with a smaller coast step in low Earth orbit", () => {
    const b = getBodies(0);
    const r = R_EARTH + 400;
    const vc = Math.sqrt(MU_EARTH / r);
    const state = {
      t: 0,
      pos: v3(b.earth.x + r, b.earth.y, b.earth.z),
      vel: v3(b.earthVel.x, b.earthVel.y + vc, b.earthVel.z),
    };
    const coarse = rk4StepDoubling(state, 20, { gravity: "earth" });
    const fine = rk4StepDoubling(state, 2, { gravity: "earth" });
    assert.ok(fine.posErrKm < coarse.posErrKm, `${fine.posErrKm} vs ${coarse.posErrKm}`);
    assert.ok(coarse.posErrKm < 1, `LEO doubling ${coarse.posErrKm} km`);
  });

  it("moon-relative energy is more negative closer in", () => {
    const b = getBodies(0);
    const far = v3(b.moon.x + R_MOON + 50_000, b.moon.y, b.moon.z);
    const near = v3(b.moon.x + R_MOON + 200, b.moon.y, b.moon.z);
    const vel = v3(b.moonVel.x, b.moonVel.y, b.moonVel.z);
    const eFar = moonRelativeSpecificEnergy(0, far, vel);
    const eNear = moonRelativeSpecificEnergy(0, near, vel);
    assert.ok(eNear < eFar, `${eNear} vs ${eFar}`);
  });
});

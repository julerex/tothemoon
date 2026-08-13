/**
 * H1 dogleg: integrated RK4 out-of-plane burn at the booked Δv class.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bodyPositions } from "./bodies.ts";
import {
  DOGLEG_DV_CAP_KM_S,
  LOW_EARTH_ORBIT_RADIUS,
  MU_EARTH,
} from "./constants.ts";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch.ts";
import type { CraftState } from "./integrator.ts";
import {
  getLastDoglegDvKmS,
  runLunarPlaneLowEarthOrbitCoast,
} from "./lowEarthOrbitCoast.ts";
import type { Sample } from "./missionTypes.ts";
import { createPropState, fuelShipFrac } from "./propellant.ts";
import { cross, normalize, v3 } from "./vec3.ts";

function circularLeoState(): CraftState {
  const t = 0;
  const b = bodyPositions(t, DEFAULT_EPHEMERIS);
  const rHat = v3(1, 0, 0);
  const n = v3(0, 0, 1);
  const tangent = v3();
  cross(tangent, n, rHat);
  normalize(tangent, tangent);
  const vCirc = Math.sqrt(MU_EARTH / LOW_EARTH_ORBIT_RADIUS);
  return {
    t,
    pos: v3(
      b.earth.x + rHat.x * LOW_EARTH_ORBIT_RADIUS,
      b.earth.y + rHat.y * LOW_EARTH_ORBIT_RADIUS,
      b.earth.z + rHat.z * LOW_EARTH_ORBIT_RADIUS,
    ),
    vel: v3(
      b.earthVel.x + tangent.x * vCirc,
      b.earthVel.y + tangent.y * vCirc,
      b.earthVel.z + tangent.z * vCirc,
    ),
  };
}

describe("integrated LEO dogleg", () => {
  it("drains ship propellant through burnForce and stays under the booked Δv cap", () => {
    const state = circularLeoState();
    const prop = createPropState(state.t);
    prop.staged = true;
    const fuel0 = fuelShipFrac(prop);
    const samples: Sample[] = [];
    const lastT = { t: -Infinity };
    runLunarPlaneLowEarthOrbitCoast(state, samples, lastT, prop, DEFAULT_EPHEMERIS);
    const dv = getLastDoglegDvKmS();
    assert.ok(dv > 0.05, `dogleg Δv ${dv} km/s`);
    assert.ok(dv <= DOGLEG_DV_CAP_KM_S + 1e-6, `dogleg Δv ${dv} above cap ${DOGLEG_DV_CAP_KM_S}`);
    assert.ok(
      fuelShipFrac(prop) < fuel0 - 0.01,
      `ship fuel ${fuelShipFrac(prop)} should drop from ${fuel0}`,
    );
    const burning = samples.filter((s) => s.burning && s.phase === "lowEarthOrbit");
    assert.ok(burning.length > 5, `expected burning dogleg samples, got ${burning.length}`);
  });

  it("does not teleport between consecutive low Earth orbit samples", () => {
    const state = circularLeoState();
    const samples: Sample[] = [];
    const lastT = { t: -Infinity };
    runLunarPlaneLowEarthOrbitCoast(state, samples, lastT, null, DEFAULT_EPHEMERIS);
    assert.ok(samples.length > 20, `sparse samples ${samples.length}`);
    let maxStep = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      const step = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y, b.pos.z - a.pos.z);
      maxStep = Math.max(maxStep, step);
    }
    assert.ok(maxStep < 500, `max sample step ${maxStep} km — expected orbital, not a snap`);
    const last = samples[samples.length - 1]!;
    const bEnd = bodyPositions(last.t, DEFAULT_EPHEMERIS);
    const rEnd = Math.hypot(
      last.pos.x - bEnd.earth.x,
      last.pos.y - bEnd.earth.y,
      last.pos.z - bEnd.earth.z,
    );
    assert.ok(
      Math.abs(rEnd - LOW_EARTH_ORBIT_RADIUS) < 80,
      `LEO end radius ${rEnd} km — circular hold should keep parking altitude`,
    );
  });
});

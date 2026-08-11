/**
 * Earth-only vs restricted n-body Flight 13 agreement tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceleration,
  type AccelOptions,
} from "./integrator.ts";
import { bodyPositions } from "./bodies.ts";
import { MU_MOON, R_EARTH } from "./constants.ts";
import { len, sub, v3 } from "./vec3.ts";
import {
  compareFlight13ForceModels,
  FLIGHT13_FORCE_AGREE,
  sampleAtTime,
} from "./flight13ForceCompare.ts";
import { runFlight13Mission } from "./flight13Mission.ts";

describe("acceleration gravity models", () => {
  it("earth model omits Moon / solar tide relative to nbody", () => {
    const t = 0;
    const b = bodyPositions(t);
    // LEO-ish geocentric offset
    const pos = v3(
      b.earth.x + R_EARTH + 300,
      b.earth.y,
      b.earth.z,
    );
    const vel = v3(b.earthVel.x, b.earthVel.y + 7.5, b.earthVel.z);
    const aN = v3();
    const aE = v3();
    acceleration(t, pos, null, aN, vel, { gravity: "nbody" });
    acceleration(t, pos, null, aE, vel, { gravity: "earth" });
    const d = sub(v3(), aN, aE);
    const dLen = len(d);
    // Moon + solar tide residual should be tiny vs Earth g (~0.009 km/s²)
    assert.ok(dLen > 0, "models should differ by third-body terms");
    assert.ok(dLen < 5e-5, `third-body residual too large ${dLen}`);
    // Order of magnitude: lunar accel ~ μ_moon / r_em² ≈ 3e-6 km/s²
    const rEm = len(sub(v3(), b.moon, b.earth));
    const moonG = MU_MOON / (rEm * rEm);
    assert.ok(dLen < moonG * 5, `dLen ${dLen} vs moonG ${moonG}`);
  });

  it("earth and nbody agree when opts default to nbody", () => {
    const opts: AccelOptions = {};
    assert.equal(opts.gravity, undefined);
    const t = 0;
    const b = bodyPositions(t);
    const pos = v3(b.earth.x + R_EARTH + 400, b.earth.y, b.earth.z);
    const a0 = acceleration(t, pos, null, v3(), null);
    const a1 = acceleration(t, pos, null, v3(), null, { gravity: "nbody" });
    assert.ok(Math.abs(a0.x - a1.x) < 1e-15);
    assert.ok(Math.abs(a0.y - a1.y) < 1e-15);
    assert.ok(Math.abs(a0.z - a1.z) < 1e-15);
  });
});

describe("sampleAtTime", () => {
  it("interpolates between samples", () => {
    const samples = [
      {
        t: 0,
        pos: { x: 0, y: 0, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        phase: "launch" as const,
        burning: true,
        fuelBooster: 1,
        fuelShip: 1,
        thrustN: 0,
        staged: false,
      },
      {
        t: 10,
        pos: { x: 10, y: 0, z: 0 },
        vel: { x: 1, y: 0, z: 0 },
        phase: "ascent" as const,
        burning: true,
        fuelBooster: 0.9,
        fuelShip: 1,
        thrustN: 0,
        staged: false,
      },
    ];
    const mid = sampleAtTime(samples, 5);
    assert.equal(mid.t, 5);
    assert.ok(Math.abs(mid.pos.x - 5) < 1e-9);
  });
});

describe("compareFlight13ForceModels", () => {
  // Two full integrations — keep suite-scoped so both tests share the run.
  const cmp = compareFlight13ForceModels();

  it("keeps n-body and Earth-only paths close over the suborbital arc", () => {
    assert.ok(cmp.nPairs > 50, `pairs ${cmp.nPairs}`);
    assert.ok(
      cmp.maxPosDevKm < FLIGHT13_FORCE_AGREE.maxPosDevKm,
      `max |Δr| ${cmp.maxPosDevKm.toFixed(2)} km exceeds ${FLIGHT13_FORCE_AGREE.maxPosDevKm}`,
    );
    assert.ok(
      cmp.maxVelDevKmS < FLIGHT13_FORCE_AGREE.maxVelDevKmS,
      `max |Δv| ${cmp.maxVelDevKmS.toFixed(4)} km/s exceeds ${FLIGHT13_FORCE_AGREE.maxVelDevKmS}`,
    );
    assert.ok(
      cmp.maxAltDevKm < FLIGHT13_FORCE_AGREE.maxAltDevKm,
      `max |Δalt| ${cmp.maxAltDevKm.toFixed(2)} km exceeds ${FLIGHT13_FORCE_AGREE.maxAltDevKm}`,
    );
    // Log summary for CI visibility
    console.info(
      `[flight13 force] full max|Δr|=${cmp.maxPosDevKm.toFixed(2)} km · ` +
        `rms=${cmp.rmsPosDevKm.toFixed(2)} km · max|Δv|=${cmp.maxVelDevKmS.toFixed(4)} km/s · ` +
        `coast max|Δr|=${cmp.coastMaxPosDevKm.toFixed(2)} km · ` +
        `peakAlt nbody/earth=${cmp.peakAltNbodyKm.toFixed(0)}/${cmp.peakAltEarthKm.toFixed(0)} km`,
    );
  });

  it("agrees tightly on free coast (ballistic third-body check)", () => {
    assert.ok(cmp.coastNPairs > 20, `coast pairs ${cmp.coastNPairs}`);
    assert.ok(
      cmp.coastMaxPosDevKm < FLIGHT13_FORCE_AGREE.coastMaxPosDevKm,
      `coast max |Δr| ${cmp.coastMaxPosDevKm.toFixed(3)} km exceeds ${FLIGHT13_FORCE_AGREE.coastMaxPosDevKm}`,
    );
    assert.ok(
      cmp.coastMaxVelDevKmS < FLIGHT13_FORCE_AGREE.coastMaxVelDevKmS,
      `coast max |Δv| ${cmp.coastMaxVelDevKmS.toFixed(5)} km/s exceeds ${FLIGHT13_FORCE_AGREE.coastMaxVelDevKmS}`,
    );
  });

  it("stages at the same hot-stage epoch under both force models", () => {
    assert.ok(cmp.stageTNbody != null && cmp.stageTEarth != null);
    assert.ok(
      Math.abs((cmp.stageTNbody as number) - (cmp.stageTEarth as number)) <
        FLIGHT13_FORCE_AGREE.stageTDiffS,
      `stageT nbody=${cmp.stageTNbody} earth=${cmp.stageTEarth}`,
    );
    assert.ok(
      Math.abs((cmp.stageTNbody as number) - FLIGHT13_FORCE_AGREE.hotStageS) <
        FLIGHT13_FORCE_AGREE.stageNearHotStageS,
    );
  });

  it("Earth-only mission still completes with splashdown", () => {
    const earth = runFlight13Mission({ gravity: "earth" });
    assert.equal(earth.ok, true);
    assert.equal(earth.samples[earth.samples.length - 1]!.phase, "splashdown");
    assert.ok(earth.durationS > 35 * 60);
  });
});

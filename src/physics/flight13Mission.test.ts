/**
 * Unit tests for Flight 13 mission integration.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EARTH_SPIN_RATE,
  earthNorthPole,
  enuAtPosition,
  inertialRelToMeshLocal,
} from "./earthFrame.ts";
import { makeFlight13Epoch } from "./flight13Epoch.ts";
import { altitudeEarth, getBodies } from "./integrator.ts";
import { F13, runFlight13Mission } from "./flight13Mission.ts";
import { cross, dot, len, set, sub, v3 } from "./vec3.ts";

/** Geodetic longitude (deg, east-positive) from an inertial sample position. */
function sampleLonDeg(
  t: number,
  pos: { x: number; y: number; z: number },
  epoch: ReturnType<typeof makeFlight13Epoch>,
): number {
  const b = getBodies(t, epoch);
  const local = v3();
  inertialRelToMeshLocal(
    v3(pos.x - b.earth.x, pos.y - b.earth.y, pos.z - b.earth.z),
    t,
    local,
    epoch,
  );
  const theta = Math.atan2(local.z, -local.x);
  let lon = ((theta - Math.PI) * 180) / Math.PI;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

describe("runFlight13Mission", () => {
  const epoch = makeFlight13Epoch(0, 0);
  const result = runFlight13Mission({ epoch });
  const _tmp = v3();

  it("completes successfully with splashdown", () => {
    assert.equal(result.ok, true);
    assert.ok(result.samples.length > 100);
    assert.equal(result.samples[result.samples.length - 1]!.phase, "splashdown");
    // Natural early splash is OK (dynamics-driven); still a full suborbital flight
    assert.ok(result.durationS > 35 * 60, `duration ${result.durationS}s too short`);
    assert.ok(result.durationS < F13.SPLASH + 60, `duration ${result.durationS}s too long`);
  });

  it("stages near the public hot-stage mark", () => {
    assert.ok(result.stageT != null);
    assert.ok(
      Math.abs((result.stageT as number) - F13.HOT_STAGE) < 15,
      `stageT ${result.stageT}`,
    );
  });

  it("follows launch → ascent → coast → entry → descent → splashdown", () => {
    const phases: string[] = [];
    for (const s of result.samples) {
      if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    }
    assert.deepEqual(phases, [
      "launch",
      "ascent",
      "coast",
      "entry",
      "descent",
      "splashdown",
    ]);
  });

  it("stays suborbital (peak altitude tens–hundreds of km, not escape)", () => {
    let maxAlt = 0;
    for (const s of result.samples) {
      const a = altitudeEarth(s.t, s.pos, epoch);
      if (a > maxAlt) maxAlt = a;
    }
    assert.ok(maxAlt > 80, `maxAlt too low ${maxAlt}`);
    assert.ok(maxAlt < 2000, `maxAlt too high ${maxAlt}`);
    assert.ok(
      Number.isFinite(result.peakSpeedKmS) && (result.peakSpeedKmS ?? 0) > 20,
      `heliocentric peak ${result.peakSpeedKmS}`,
    );
  });

  it("burns on ascent and is coasting after SECO", () => {
    const early = result.samples.find((s) => s.t > 30 && s.t < 100);
    assert.ok(early?.burning);
    const coast = result.samples.find((s) => s.phase === "coast");
    assert.ok(coast);
    assert.equal(coast!.burning, false);
  });

  it("coasts at high altitude through mid-mission (not surface hover)", () => {
    const mid = result.samples.reduce((best, cur) =>
      Math.abs(cur.t - 1200) < Math.abs(best.t - 1200) ? cur : best,
    );
    const a = altitudeEarth(mid.t, mid.pos, epoch);
    assert.ok(a > 120, `mid-coast alt ${a} km — expected lofted suborbital`);
  });

  it("has a lofted free coast (no multi-minute surface skid before entry)", () => {
    // Count consecutive samples with alt < 3 km during coast — should be none
    let maxIdle = 0;
    let cur = 0;
    for (const s of result.samples) {
      if (s.phase !== "coast" && s.phase !== "entry") {
        maxIdle = Math.max(maxIdle, cur);
        cur = 0;
        continue;
      }
      const a = altitudeEarth(s.t, s.pos, epoch);
      const b = getBodies(s.t, epoch);
      sub(_tmp, s.vel, b.earthVel);
      if (a < 3 && len(_tmp) < 0.3) cur += 1;
      else {
        maxIdle = Math.max(maxIdle, cur);
        cur = 0;
      }
    }
    maxIdle = Math.max(maxIdle, cur);
    assert.ok(
      maxIdle < 40,
      `surface-idle streak ${maxIdle} samples — approach glide / hover regress`,
    );
  });

  it("fires a retrograde relight deorbit near the public mark", () => {
    const relight = result.samples.filter(
      (s) =>
        s.burning &&
        s.t >= F13.RELIGHT - 1 &&
        s.t <= F13.RELIGHT_END + 2 &&
        s.thrustN > 1e3,
    );
    assert.ok(relight.length > 5, "expected relight burn samples");
  });

  it("fires a landing burn before splashdown", () => {
    const land = result.samples.find(
      (s) => s.phase === "descent" && s.burning && s.thrustN > 1e3,
    );
    assert.ok(land, "expected descent burn sample");
    // May light earlier than public T+65 once aero has bled speed
    assert.ok(land!.t >= F13.ENTRY - 120, `land burn t=${land!.t}`);
  });

  it("SECO is near-circular at insert altitude (low radial rate)", () => {
    let seco = result.samples[0]!;
    for (const s of result.samples) {
      if (s.phase === "ascent" && s.burning) seco = s;
    }
    const a = altitudeEarth(seco.t, seco.pos, epoch);
    const b = getBodies(seco.t, epoch);
    sub(_tmp, seco.vel, b.earthVel);
    const v = len(_tmp);
    // Radial rate from pos·vel
    const rx = seco.pos.x - b.earth.x;
    const ry = seco.pos.y - b.earth.y;
    const rz = seco.pos.z - b.earth.z;
    const r = Math.hypot(rx, ry, rz) || 1;
    const vr = (seco.vel.x - b.earthVel.x) * (rx / r) +
      (seco.vel.y - b.earthVel.y) * (ry / r) +
      (seco.vel.z - b.earthVel.z) * (rz / r);
    assert.ok(a > 120, `SECO alt ${a}`);
    assert.ok(v > 7.0 && v < 8.2, `SECO v ${v}`);
    assert.ok(Math.abs(vr) < 0.45, `SECO vr ${vr}`);
  });

  it("ascends eastward along the Flight 13 corridor (not west across the Pacific)", () => {
    // Regression: short geodetic path Starbase → 95°E splash is westward; steering
    // must follow the Earth GC plane (Starbase → Gauteng → Indian Ocean) instead.
    const padLonDeg = -97.156;
    const s = result.samples.reduce((best, cur) =>
      Math.abs(cur.t - 120) < Math.abs(best.t - 120) ? cur : best,
    );
    const lonAt120 = sampleLonDeg(s.t, s.pos, epoch);
    assert.ok(
      lonAt120 > padLonDeg + 0.15,
      `lon@~120s ${lonAt120}° — expected east of Starbase (Gulf), not Pacific`,
    );
    const s300 = result.samples.reduce((best, cur) =>
      Math.abs(cur.t - 300) < Math.abs(best.t - 300) ? cur : best,
    );
    const lonAt300 = sampleLonDeg(s300.t, s300.pos, epoch);
    assert.ok(
      lonAt300 > padLonDeg + 2,
      `lon@~300s ${lonAt300}° — expected further east over the Gulf`,
    );
    assert.ok(lonAt300 < 0, `lon@~300s ${lonAt300}° — still western hemisphere`);
  });

  it("liftoff stays near-vertical (no pad-frame west kick from surface clamp)", () => {
    // Regression: surfaceClamp used to damp vs Earth COM and strip ω×r,
    // injecting ~17 m/s ground-relative west and curving the pad trail sideways.
    const up = v3(), east = v3(), north = v3();
    const omega = v3(), rRel = v3(), vAtm = v3(), vRel = v3();
    earthNorthPole(omega);
    set(omega, omega.x * EARTH_SPIN_RATE, omega.y * EARTH_SPIN_RATE, omega.z * EARTH_SPIN_RATE);
    let maxAbsEast = 0;
    for (const s of result.samples) {
      if (s.t > 20) break;
      const b = getBodies(s.t, epoch);
      set(rRel, s.pos.x - b.earth.x, s.pos.y - b.earth.y, s.pos.z - b.earth.z);
      cross(vAtm, omega, rRel);
      set(
        vRel,
        s.vel.x - b.earthVel.x - vAtm.x,
        s.vel.y - b.earthVel.y - vAtm.y,
        s.vel.z - b.earthVel.z - vAtm.z,
      );
      enuAtPosition(s.t, s.pos, b.earth, up, east, north);
      maxAbsEast = Math.max(maxAbsEast, Math.abs(dot(vRel, east)));
    }
    assert.ok(
      maxAbsEast < 0.005,
      `early |v_east| ${maxAbsEast} km/s — expected near-zero before gravity turn`,
    );
  });
});

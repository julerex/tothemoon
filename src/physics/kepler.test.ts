import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MU_EARTH, R_EARTH } from "./constants.ts";
import {
  keplerRvAt,
  rvToKepler,
  sampleKeplerArc,
  solveEccentricAnomaly,
} from "./kepler.ts";
import { dist, len, v3 } from "./vec3.ts";

describe("solveEccentricAnomaly", () => {
  it("solves circular (e=0) as E = M", () => {
    for (const M of [0, 0.5, Math.PI, 4.2, -0.3]) {
      const E = solveEccentricAnomaly(M, 0);
      const m =
        ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      assert.ok(Math.abs(E - m) < 1e-12);
    }
  });

  it("satisfies Kepler’s equation for elliptical e", () => {
    const cases: [number, number][] = [
      [0.1, 0.2],
      [1.2, 0.5],
      [Math.PI, 0.8],
      [-1.0, 0.3],
      [5.5, 0.05],
    ];
    for (const [M, e] of cases) {
      const E = solveEccentricAnomaly(M, e);
      const m =
        ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const residual = E - e * Math.sin(E) - m;
      assert.ok(
        Math.abs(residual) < 1e-12,
        `M=${M} e=${e} residual=${residual}`,
      );
    }
  });
});

describe("rvToKepler / keplerRvAt", () => {
  it("round-trips a circular LEO-ish state", () => {
    const r = R_EARTH + 200;
    const v = Math.sqrt(MU_EARTH / r);
    const pos = v3(r, 0, 0);
    const vel = v3(0, v, 0);
    const orb = rvToKepler(pos, vel, MU_EARTH, 0);

    assert.ok(Math.abs(orb.a - r) / r < 1e-6);
    assert.ok(orb.e < 1e-6);
    assert.ok(Math.abs(orb.i) < 1e-6);

    const { r: r2, v: v2 } = keplerRvAt(orb, 0);
    assert.ok(dist(pos, r2) < 1e-4);
    assert.ok(dist(vel, v2) < 1e-6);
  });

  it("conserves specific energy along an elliptical arc", () => {
    // Elliptical: perigee LEO, apogee ~ lunar-ish distance fraction
    const rp = R_EARTH + 300;
    const ra = 50_000;
    const a = 0.5 * (rp + ra);
    const e = (ra - rp) / (ra + rp);
    const vp = Math.sqrt(MU_EARTH * (2 / rp - 1 / a));
    const pos = v3(rp, 0, 0);
    const vel = v3(0, vp, 0);
    const orb = rvToKepler(pos, vel, MU_EARTH, 0);

    assert.ok(Math.abs(orb.a - a) / a < 1e-5);
    assert.ok(Math.abs(orb.e - e) < 1e-5);

    const energy = (r: ReturnType<typeof v3>, v: ReturnType<typeof v3>) =>
      0.5 * len(v) ** 2 - MU_EARTH / len(r);

    const e0 = energy(pos, vel);
    const period = 2 * Math.PI * Math.sqrt((a * a * a) / MU_EARTH);
    for (const frac of [0.1, 0.25, 0.5, 0.75, 0.99]) {
      const { r, v } = keplerRvAt(orb, frac * period);
      const e1 = energy(r, v);
      assert.ok(
        Math.abs(e1 - e0) / Math.abs(e0) < 1e-6,
        `energy drift at ${frac}P`,
      );
    }
  });

  it("sampleKeplerArc returns inclusive endpoints", () => {
    const r = R_EARTH + 400;
    const v = Math.sqrt(MU_EARTH / r);
    const orb = rvToKepler(v3(r, 0, 0), v3(0, v, 0), MU_EARTH, 0);
    const arc = sampleKeplerArc(orb, 0, 600, 5);
    assert.equal(arc.length, 5);
    assert.equal(arc[0]!.t, 0);
    assert.equal(arc[4]!.t, 600);
  });
});

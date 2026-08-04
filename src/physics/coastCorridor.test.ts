import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setMoonPhase0 } from "./bodies.ts";
import {
  buildCoastCorridor,
  computeKeplerRefMaxDevKm,
  findTliInjectSample,
  orbitFromSample,
} from "./coastCorridor.ts";
import { setMissionLandingT } from "./horizonsEpoch.ts";
import type { Sample } from "./missionTypes.ts";
import packed from "../data/trajectory.json" with { type: "json" };
import { unpackPackedForInvariants } from "./trajectoryInvariants.ts";

function sample(
  t: number,
  phase: Sample["phase"],
  pos: { x: number; y: number; z: number },
  vel = { x: 0, y: 8, z: 0 },
): Sample {
  return {
    t,
    pos,
    vel,
    phase,
    burning: phase === "tli",
    fuelBooster: 0,
    fuelShip: 0.5,
    thrustN: phase === "tli" ? 1e6 : 0,
    staged: true,
  };
}

describe("findTliInjectSample", () => {
  it("prefers the last TLI sample", () => {
    const s = findTliInjectSample([
      sample(0, "leo", { x: 7000, y: 0, z: 0 }),
      sample(100, "tli", { x: 7100, y: 0, z: 0 }),
      sample(200, "tli", { x: 7200, y: 0, z: 0 }),
      sample(300, "coast", { x: 8000, y: 0, z: 0 }),
    ]);
    assert.equal(s?.t, 200);
  });

  it("falls back to first coast when no TLI phase", () => {
    const s = findTliInjectSample([
      sample(0, "leo", { x: 7000, y: 0, z: 0 }),
      sample(300, "coast", { x: 8000, y: 0, z: 0 }),
    ]);
    assert.equal(s?.t, 300);
  });
});

describe("buildCoastCorridor (synthetic)", () => {
  it("returns null without coast samples", () => {
    assert.equal(
      buildCoastCorridor([sample(0, "leo", { x: 7000, y: 0, z: 0 })]),
      null,
    );
  });
});

describe("buildCoastCorridor (baked pack)", () => {
  const pack = packed as {
    moonPhase0: number;
    horizonsLandingT?: number;
    keplerRefMaxDevKm?: number;
    samples: unknown;
  };
  // Match bake ephemeris so Earth-relative Kepler is well-defined
  setMoonPhase0(pack.moonPhase0);
  setMissionLandingT(pack.horizonsLandingT ?? 0);

  const traj = unpackPackedForInvariants(
    packed as unknown as Parameters<typeof unpackPackedForInvariants>[0],
  );
  const samples = traj.samples as Sample[];

  it("builds a Kepler path with finite max |Δr|", () => {
    const c = buildCoastCorridor(samples);
    assert.ok(c, "expected coast corridor on ballistic pack");
    assert.ok(c!.keplerPts.length >= 2);
    assert.equal(c!.keplerPts.length, c!.nbodyPts.length);
    assert.ok(c!.maxDevKm > 0, "n-body should diverge from 2-body");
    // Post-lunar free-coast can peel far from the inject ellipse
    assert.ok(c!.maxDevKm < 5_000_000, `maxDev ${c!.maxDevKm} looks unbounded`);
    assert.ok(c!.t1 > c!.t0);
  });

  it("orbitFromSample at inject is elliptical", () => {
    const inj = findTliInjectSample(samples);
    assert.ok(inj);
    const orb = orbitFromSample(inj!);
    assert.ok(orb.a > 0 && orb.e < 1, `a=${orb.a} e=${orb.e}`);
  });

  it("computeKeplerRefMaxDevKm matches corridor maxDev", () => {
    const c = buildCoastCorridor(samples, 800);
    const d = computeKeplerRefMaxDevKm(samples);
    assert.ok(c);
    assert.ok(Math.abs(d - c!.maxDevKm) < 1e-3);
  });

  it("pack keplerRefMaxDevKm is positive when present", () => {
    if (pack.keplerRefMaxDevKm != null) {
      assert.ok(pack.keplerRefMaxDevKm > 0);
      assert.ok(pack.keplerRefMaxDevKm < 5_000_000);
    }
  });
});

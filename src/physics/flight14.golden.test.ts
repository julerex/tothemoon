/**
 * Golden bands for the baked Flight 14 trajectory pack.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import packed from "../data/flight14-trajectory.json";
import { F14 } from "./flight14Mission.ts";
import { makeFlight14Epoch } from "./flight14Epoch.ts";
import { altitudeEarth } from "./integrator.ts";
import type { PhaseId } from "./missionTypes.ts";

const GOLDEN = {
  durationS: F14.END,
  durationTolS: 8,
  samplesMin: 2_000,
  samplesMax: 10_000,
  stageT: 142,
  stageTTol: 20,
  splashT: F14.SPLASH,
  splashTTol: 180,
  floatHoldMinS: 200,
} as const;

type PackedV2 = typeof packed & {
  version?: number;
  stageT?: number | null;
  peakSpeedKmS?: number;
  horizonsLandingT?: number;
};

const pack = packed as PackedV2;

function phaseSequence(samples: Array<{ phase: string }>): PhaseId[] {
  const out: PhaseId[] = [];
  let prev: string | null = null;
  for (const s of samples) {
    if (s.phase !== prev) {
      out.push(s.phase as PhaseId);
      prev = s.phase;
    }
  }
  return out;
}

function firstSplashT(samples: Array<{ phase: string; t: number }>): number | null {
  for (const s of samples) {
    if (s.phase === "splashdown") return s.t;
  }
  return null;
}

describe("flight14 golden bands (baked pack)", () => {
  it("matches duration / sample count bands", () => {
    assert.equal(pack.ok, true);
    assert.ok(
      Math.abs(pack.durationS - GOLDEN.durationS) <= GOLDEN.durationTolS,
      `durationS ${pack.durationS} outside ±${GOLDEN.durationTolS}s of ${GOLDEN.durationS}`,
    );
    assert.ok(
      pack.samples.length >= GOLDEN.samplesMin &&
        pack.samples.length <= GOLDEN.samplesMax,
      `samples ${pack.samples.length} outside [${GOLDEN.samplesMin}, ${GOLDEN.samplesMax}]`,
    );
  });

  it("has Flight 14 orbital phase order and splash float hold", () => {
    const seq = phaseSequence(pack.samples);
    assert.ok(seq.includes("launch"));
    assert.ok(seq.includes("ascent"));
    assert.ok(seq.includes("coast"));
    assert.ok(seq.includes("lowEarthOrbit"));
    assert.ok(seq.includes("entry"));
    assert.ok(seq.includes("splashdown"));
    assert.equal(seq[seq.length - 1], "splashdown");
    assert.equal(
      seq.filter((p) => p === "translunarInjection" || p === "approach").length,
      0,
    );

    const splash0 = firstSplashT(pack.samples);
    assert.ok(splash0 != null);
    assert.ok(
      Math.abs(splash0! - GOLDEN.splashT) <= GOLDEN.splashTTol,
      `splashT ${splash0} far from public ${GOLDEN.splashT}`,
    );
    const last = pack.samples[pack.samples.length - 1]!;
    assert.ok(last.t - splash0! >= GOLDEN.floatHoldMinS);
  });

  it("message reports Flight 14 Pacific splashdown", () => {
    const m = pack.message.toLowerCase();
    assert.ok(m.includes("flight 14") && m.includes("splash"), pack.message);
    assert.equal(m.includes("gauteng"), false);
  });

  it("inserts near 275 km, not a Gauteng-style suborbital hop", () => {
    const epoch = makeFlight14Epoch(pack.moonPhase0, pack.horizonsLandingT ?? 0);
    const onOrbit = pack.samples.find(
      (s) => s.phase === "lowEarthOrbit" && s.t > F14.INSERT_END + 30 && !s.burning,
    );
    assert.ok(onOrbit, "expected on-orbit sample after insertion");
    const alt = altitudeEarth(
      onOrbit.t,
      { x: onOrbit.p[0]!, y: onOrbit.p[1]!, z: onOrbit.p[2]! },
      epoch,
    );
    assert.ok(
      alt > 180 && alt < 400,
      `insertion alt ${alt} km (want ~275)`,
    );

    let min = Infinity;
    let max = -Infinity;
    for (const s of pack.samples) {
      if (s.t < F14.INSERT_END + 120 || s.t > F14.DEORBIT - 60) continue;
      const coastAlt = altitudeEarth(
        s.t,
        { x: s.p[0]!, y: s.p[1]!, z: s.p[2]! },
        epoch,
      );
      if (coastAlt < min) min = coastAlt;
      if (coastAlt > max) max = coastAlt;
    }
    assert.ok(
      max - min < 30,
      `LEO altitude ${min.toFixed(1)}..${max.toFixed(1)} km (want a near-circle near 275)`,
    );
  });
});

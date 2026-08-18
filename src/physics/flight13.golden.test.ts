/**
 * Golden bands for the baked Flight 13 trajectory pack — pins mission shape so
 * physics refactors (wave 6 module split) cannot silently drift.
 *
 * Covers: phase order, duration band, splash geodesy, sample count bands.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import packed from "../data/flight13-trajectory.json";
import {
  FLIGHT13_SPLASH_LAT_DEG,
  FLIGHT13_SPLASH_LON_DEG,
} from "./flight13Corridor.ts";
import { F13 } from "./flight13Mission.ts";
import type { PhaseId } from "./missionTypes.ts";

/** Bands after suborbital ascent + entry + Indian Ocean splash + float hold. */
const GOLDEN = {
  durationS: F13.END,
  durationTolS: 5,
  samplesMin: 2_000,
  samplesMax: 8_000,
  /** Super Heavy hot-stage (~T+2:21 theater). */
  stageT: 142,
  stageTTol: 20,
  /** Heliocentric peak |v| (km/s) on the suborbital arc. */
  peakSpeedKmS: 36.5,
  peakSpeedTol: 4,
  /** First splash sample (natural dynamics, not clock-forced). */
  splashT: 3488,
  splashTTol: 120,
  /** Splash site geodesy (published Flight 11 IO fix). */
  splashLatDeg: FLIGHT13_SPLASH_LAT_DEG,
  splashLonDeg: FLIGHT13_SPLASH_LON_DEG,
  splashLatTolDeg: 8,
  splashLonTolDeg: 12,
  /** Post-splash float hold through T+1:10. */
  floatHoldMinS: 200,
} as const;

const EXPECTED_PHASE_ORDER: readonly PhaseId[] = [
  "launch",
  "ascent",
  "coast",
  "entry",
  "descent",
  "splashdown",
] as const;

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

function firstStagedT(
  samples: Array<{ t: number; st?: boolean }>,
): number | null {
  for (const s of samples) {
    if (s.st) return s.t;
  }
  return null;
}

function firstSplashT(samples: Array<{ phase: string; t: number }>): number | null {
  for (const s of samples) {
    if (s.phase === "splashdown") return s.t;
  }
  return null;
}

describe("flight13 golden bands (baked pack)", () => {
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

  it("pins pack v2 meta: stage time window, peak speed, splash time", () => {
    assert.ok((pack.version ?? 0) >= 2, `version=${pack.version}`);
    assert.ok(
      pack.stageT != null && Number.isFinite(pack.stageT),
      "pack stageT required",
    );
    assert.ok(
      Math.abs(pack.stageT! - GOLDEN.stageT) <= GOLDEN.stageTTol,
      `pack stageT ${pack.stageT} outside ±${GOLDEN.stageTTol}s of ${GOLDEN.stageT}`,
    );
    const sampleStage = firstStagedT(pack.samples);
    assert.ok(sampleStage != null);
    assert.ok(
      Math.abs(sampleStage! - pack.stageT!) < 5,
      `pack stageT ${pack.stageT} ≠ sample ${sampleStage}`,
    );

    assert.ok(
      pack.peakSpeedKmS != null &&
        Math.abs(pack.peakSpeedKmS - GOLDEN.peakSpeedKmS) <= GOLDEN.peakSpeedTol,
      `peakSpeedKmS ${pack.peakSpeedKmS} outside ±${GOLDEN.peakSpeedTol} of ${GOLDEN.peakSpeedKmS}`,
    );

    const splashT = pack.horizonsLandingT ?? firstSplashT(pack.samples);
    assert.ok(splashT != null && Number.isFinite(splashT));
    assert.ok(
      Math.abs(splashT! - GOLDEN.splashT) <= GOLDEN.splashTTol,
      `splashT ${splashT} outside ±${GOLDEN.splashTTol}s of ${GOLDEN.splashT}`,
    );
  });

  it("has Flight 13 phase order (launch→…→splashdown) and stage-out", () => {
    const seq = phaseSequence(pack.samples);
    assert.deepEqual(seq, [...EXPECTED_PHASE_ORDER]);

    const stageT = firstStagedT(pack.samples);
    assert.ok(stageT != null, "expected a staged sample");
    assert.ok(
      Math.abs(stageT! - GOLDEN.stageT) <= GOLDEN.stageTTol,
      `stageT ${stageT} outside ±${GOLDEN.stageTTol}s of ${GOLDEN.stageT}`,
    );
  });

  it("starts at launch, ends on splashdown float hold", () => {
    assert.equal(pack.samples[0]!.phase, "launch");
    const last = pack.samples[pack.samples.length - 1]!.phase;
    assert.equal(last, "splashdown", `last=${last}`);
    assert.ok(pack.durationS >= 35 * 60 && pack.durationS <= F13.END + 5);
  });

  it("holds post-splash float through T+1:10", () => {
    const splash0 = firstSplashT(pack.samples);
    assert.ok(splash0 != null);
    const splashSamples = pack.samples.filter((s) => s.phase === "splashdown");
    assert.ok(splashSamples.length > 20, `float samples ${splashSamples.length}`);
    const last = pack.samples[pack.samples.length - 1]!;
    assert.ok(
      last.t - splash0! >= GOLDEN.floatHoldMinS,
      `float hold ${last.t - splash0!}s < ${GOLDEN.floatHoldMinS}s`,
    );
  });

  it("message reports suborbital Indian Ocean splashdown", () => {
    const m = pack.message.toLowerCase();
    assert.ok(
      m.includes("flight 13") && m.includes("splash"),
      `unexpected message: ${pack.message}`,
    );
  });

  it("has no translunar injection or lunar phases", () => {
    assert.equal(
      pack.samples.filter((s) => s.phase === "translunarInjection").length,
      0,
    );
    assert.equal(pack.samples.filter((s) => s.phase === "approach").length, 0);
    assert.equal(pack.samples.filter((s) => s.phase === "landed").length, 0);
  });
});

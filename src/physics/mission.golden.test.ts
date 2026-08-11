/**
 * Golden bands for the baked trajectory pack — pins mission shape so physics
 * refactors (P3.12 module split) cannot silently drift.
 *
 * Covers: phase order, duration band, stage-out window, Translunar injection Δv band, pack meta.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import packed from "../data/trajectory.json";
import {
  EXPECTED_END_PHASES,
  EXPECTED_PHASE_ORDER,
} from "./trajectoryInvariants.ts";
import type { PhaseId } from "./missionTypes.ts";

/** Bands after staged ascent + hot translunar injection + LOI + LLO + land. */
const GOLDEN = {
  durationS: 220_000, // ~60 h class with LOI + LLO + land
  durationTolFrac: 0.55,
  translunarInjectionDeltaV: 3.154,
  translunarInjectionDeltaVTol: 0.2,
  samplesMin: 2_000,
  samplesMax: 25_000,
  /** Super Heavy main engine cutoff / hot-stage (~2.5 min theater). */
  stageT: 150,
  stageTTol: 90,
  /** Heliocentric peak |v| (km/s) — Earth orbit + low Earth orbit/ translunar injection. */
  peakSpeedKmS: 37,
  peakSpeedTol: 8,
  /** Soft land → min lunar alt ~0 (surface). */
  minMoonAltKm: 0,
  minMoonAltTol: 500,
} as const;

type PackedV2 = typeof packed & {
  version?: number;
  stageT?: number | null;
  peakSpeedKmS?: number;
  minMoonAlt?: number;
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

describe("mission golden bands (baked pack)", () => {
  it("matches duration / Translunar injection Δv / sample count bands", () => {
    assert.equal(pack.ok, true);
    assert.ok(
      Math.abs(pack.durationS - GOLDEN.durationS) <=
        GOLDEN.durationS * GOLDEN.durationTolFrac,
      `durationS ${pack.durationS} outside ±${GOLDEN.durationTolFrac * 100}% of ${GOLDEN.durationS}`,
    );
    assert.ok(
      Math.abs(pack.translunarInjectionDeltaV - GOLDEN.translunarInjectionDeltaV) <= GOLDEN.translunarInjectionDeltaVTol,
      `translunarInjectionDeltaV ${pack.translunarInjectionDeltaV} outside ±${GOLDEN.translunarInjectionDeltaVTol} of ${GOLDEN.translunarInjectionDeltaV}`,
    );
    assert.ok(
      pack.samples.length >= GOLDEN.samplesMin &&
        pack.samples.length <= GOLDEN.samplesMax,
      `samples ${pack.samples.length} outside [${GOLDEN.samplesMin}, ${GOLDEN.samplesMax}]`,
    );
  });

  it("pins pack v2 meta: stage time window, peak speed, min lunar alt", () => {
    assert.ok((pack.version ?? 0) >= 2, `version=${pack.version}`);
    assert.ok(
      pack.stageT != null && Number.isFinite(pack.stageT),
      "pack stageT required",
    );
    assert.ok(
      Math.abs(pack.stageT! - GOLDEN.stageT) <= GOLDEN.stageTTol,
      `pack stageT ${pack.stageT} outside ±${GOLDEN.stageTTol}s of ${GOLDEN.stageT}`,
    );
    // Meta stageT must match first staged sample (no silent re-derive drift)
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
    assert.ok(
      pack.minMoonAlt != null &&
        Math.abs(pack.minMoonAlt - GOLDEN.minMoonAltKm) <= GOLDEN.minMoonAltTol,
      `minMoonAlt ${pack.minMoonAlt} outside ±${GOLDEN.minMoonAltTol} of ${GOLDEN.minMoonAltKm}`,
    );
  });

  it("has capture phase order (launch→…→landed) and stage-out", () => {
    const seq = phaseSequence(pack.samples);
    assert.deepEqual(seq, [...EXPECTED_PHASE_ORDER]);
    assert.ok(
      EXPECTED_END_PHASES.includes(seq[seq.length - 1]!),
      `end phase ${seq[seq.length - 1]}`,
    );

    const stageT = firstStagedT(pack.samples);
    assert.ok(stageT != null, "expected a staged sample");
    assert.ok(
      Math.abs(stageT! - GOLDEN.stageT) <= GOLDEN.stageTTol,
      `stageT ${stageT} outside ±${GOLDEN.stageTTol}s of ${GOLDEN.stageT}`,
    );
  });

  it("starts at launch, ends landed, with finite translunar injection", () => {
    assert.equal(pack.samples[0]!.phase, "launch");
    const last = pack.samples[pack.samples.length - 1]!.phase;
    assert.equal(last, "landed", `last=${last}`);
    assert.ok(pack.translunarInjectionDeltaV > 2.5 && pack.translunarInjectionDeltaV < 4.0);
    assert.ok(pack.durationS > 24 * 3600 && pack.durationS < 14 * 24 * 3600);
  });

  it("has low Earth orbit dogleg burns and ship fuel drops by translunar injection", () => {
    const lowEarthOrbitSamples = pack.samples.filter(
      (s) => s.phase === "lowEarthOrbit",
    );
    assert.ok(
      lowEarthOrbitSamples.length > 10,
      "expected dense low Earth orbit samples",
    );
    const burning = lowEarthOrbitSamples.filter((s) => s.burning);
    assert.ok(
      burning.length > 5,
      `expected low Earth orbit burning samples for dogleg, got ${burning.length}`,
    );
    const injectSample = pack.samples.find(
      (s) => s.phase === "translunarInjection",
    );
    assert.ok(injectSample);
    const fuelAtLowEarthOrbit = lowEarthOrbitSamples[0]!.fs ?? 1;
    const fuelAtInject = injectSample!.fs ?? 1;
    assert.ok(
      fuelAtInject < fuelAtLowEarthOrbit - 0.01,
      `ship fuel should fall by translunar injection (leo=${fuelAtLowEarthOrbit}, inject=${fuelAtInject})`,
    );
  });

  it("has a finite translunar injection burn lasting ~2–4 minutes", () => {
    const injectSamples = pack.samples.filter(
      (s) => s.phase === "translunarInjection",
    );
    assert.ok(
      injectSamples.length >= 2,
      "expected multiple translunar injection samples",
    );
    const burnS =
      injectSamples[injectSamples.length - 1]!.t - injectSamples[0]!.t;
    assert.ok(
      burnS >= 100 && burnS <= 360,
      `translunar injection duration ${burnS.toFixed(1)}s outside ~2–6 min theater band`,
    );
    const burning = injectSamples.filter((s) => s.burning);
    assert.ok(
      burning.length > 5,
      "expected dense translunar injection burn samples",
    );
  });

  it("message reports soft landing at the lunar south pole", () => {
    const m = pack.message.toLowerCase();
    assert.ok(
      m.includes("landed") && m.includes("south pole"),
      `unexpected message: ${pack.message}`,
    );
  });

  it("coasts ballistically then captures (LOI / LLO / descent / land)", () => {
    const coast = pack.samples.filter((s) => s.phase === "coast");
    assert.ok(coast.length > 50);
    const coastBurning = coast.filter((s) => s.burning && (s.th ?? 0) > 0);
    assert.ok(
      coastBurning.length === 0,
      `translunar coast should be ballistic, got ${coastBurning.length} burns`,
    );
    const approach = pack.samples.filter((s) => s.phase === "approach");
    const braking = pack.samples.filter((s) => s.phase === "braking");
    const descent = pack.samples.filter((s) => s.phase === "descent");
    const landed = pack.samples.filter((s) => s.phase === "landed");
    assert.ok(approach.length > 5, "expected LOI samples");
    assert.ok(braking.length > 5, "expected low lunar orbit samples");
    assert.ok(descent.length > 5, "expected descent samples");
    assert.ok(landed.length > 5, "expected landed samples");
    const loiBurn = approach.filter((s) => s.burning);
    assert.ok(loiBurn.length > 0, "expected LOI burn samples");
  });
});

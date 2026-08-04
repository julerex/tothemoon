/**
 * Golden bands for the baked trajectory pack — pins mission shape so physics
 * refactors (P3.12 module split) cannot silently drift.
 *
 * Covers: phase order, duration band, stage-out window, TLI Δv band, pack meta.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import packed from "../data/trajectory.json";
import {
  EXPECTED_END_PHASES,
  EXPECTED_PHASE_ORDER,
} from "./trajectoryInvariants.ts";
import type { PhaseId } from "./missionTypes.ts";

/** Bands after A5 staged ascent + hot TLI + pure n-body free coast. */
const GOLDEN = {
  durationS: 640_000,
  durationTolFrac: 0.45,
  tliDv: 3.154,
  tliDvTol: 0.2,
  samplesMin: 2_000,
  samplesMax: 25_000,
  /** Super Heavy MECO / hot-stage (~2.5 min theater). */
  stageT: 150,
  stageTTol: 90,
  /** Heliocentric peak |v| (km/s) — Earth orbit + LEO/TLI. */
  peakSpeedKmS: 37,
  peakSpeedTol: 8,
  minMoonAltKm: 7_000,
  minMoonAltTol: 20_000,
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
  it("matches duration / TLI Δv / sample count bands", () => {
    assert.equal(pack.ok, true);
    assert.ok(
      Math.abs(pack.durationS - GOLDEN.durationS) <=
        GOLDEN.durationS * GOLDEN.durationTolFrac,
      `durationS ${pack.durationS} outside ±${GOLDEN.durationTolFrac * 100}% of ${GOLDEN.durationS}`,
    );
    assert.ok(
      Math.abs(pack.tliDv - GOLDEN.tliDv) <= GOLDEN.tliDvTol,
      `tliDv ${pack.tliDv} outside ±${GOLDEN.tliDvTol} of ${GOLDEN.tliDv}`,
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

  it("has ballistic phase order (launch→…→coast or impact) and stage-out", () => {
    const seq = phaseSequence(pack.samples);
    const core = seq.filter((p) => p !== "impact");
    assert.deepEqual(core, [...EXPECTED_PHASE_ORDER]);
    assert.ok(
      EXPECTED_END_PHASES.includes(seq[seq.length - 1]!),
      `end phase ${seq[seq.length - 1]} not in coast|impact`,
    );

    const stageT = firstStagedT(pack.samples);
    assert.ok(stageT != null, "expected a staged sample");
    assert.ok(
      Math.abs(stageT! - GOLDEN.stageT) <= GOLDEN.stageTTol,
      `stageT ${stageT} outside ±${GOLDEN.stageTTol}s of ${GOLDEN.stageT}`,
    );
  });

  it("starts at launch, ends coast or impact, with finite TLI", () => {
    assert.equal(pack.samples[0]!.phase, "launch");
    const last = pack.samples[pack.samples.length - 1]!.phase;
    assert.ok(last === "coast" || last === "impact", `last=${last}`);
    assert.ok(pack.tliDv > 2.5 && pack.tliDv < 4.0);
    assert.ok(pack.durationS > 24 * 3600 && pack.durationS < 14 * 24 * 3600);
  });

  it("has LEO dogleg burns and ship fuel drops by TLI", () => {
    const leo = pack.samples.filter((s) => s.phase === "leo");
    assert.ok(leo.length > 10, "expected dense LEO samples");
    const burning = leo.filter((s) => s.burning);
    assert.ok(
      burning.length > 5,
      `expected LEO burning samples for dogleg, got ${burning.length}`,
    );
    const tli = pack.samples.find((s) => s.phase === "tli");
    assert.ok(tli);
    const fsLeo = leo[0]!.fs ?? 1;
    const fsTli = tli!.fs ?? 1;
    assert.ok(
      fsTli < fsLeo - 0.01,
      `ship fuel should fall by TLI (leo0=${fsLeo}, tli=${fsTli})`,
    );
  });

  it("has a finite TLI burn lasting ~2–4 minutes", () => {
    const tli = pack.samples.filter((s) => s.phase === "tli");
    assert.ok(tli.length >= 2, "expected multiple TLI samples");
    const burnS = tli[tli.length - 1]!.t - tli[0]!.t;
    assert.ok(
      burnS >= 100 && burnS <= 360,
      `TLI duration ${burnS.toFixed(1)}s outside ~2–6 min theater band`,
    );
    const burning = tli.filter((s) => s.burning);
    assert.ok(burning.length > 5, "expected dense TLI burn samples");
  });

  it("message reports ballistic impact or flyby (no powered landing)", () => {
    const m = pack.message.toLowerCase();
    assert.ok(
      m.includes("impact") || m.includes("flyby") || m.includes("skim") || m.includes("ballistic"),
      `unexpected message: ${pack.message}`,
    );
    assert.ok(
      !m.includes("landed · lunar south pole"),
      "should not claim powered south-pole landing",
    );
  });

  it("has a pure ballistic coast (no post-TLI burns)", () => {
    const coast = pack.samples.filter((s) => s.phase === "coast");
    assert.ok(coast.length > 50);
    const burning = coast.filter((s) => s.burning && (s.th ?? 0) > 0);
    assert.ok(
      burning.length === 0,
      `ballistic coast should have zero burns, got ${burning.length}`,
    );
    // No LOI/PDI phases
    const powered = pack.samples.filter(
      (s) =>
        s.phase === "approach" ||
        s.phase === "braking" ||
        s.phase === "descent" ||
        s.phase === "landed",
    );
    assert.equal(powered.length, 0, "no LOI/PDI/landed samples expected");
  });
});

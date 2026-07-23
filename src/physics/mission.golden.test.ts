/**
 * Golden bands for the baked trajectory pack — pins mission shape so D1
 * refactors and later physics slices cannot silently drift.
 *
 * These assert against `trajectory.json` (build-time bake), not a live
 * `runMission()` recompute (too slow for the unit suite).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import packed from "../data/trajectory.json";
import { EXPECTED_PHASE_ORDER } from "./trajectoryInvariants.ts";
import type { PhaseId } from "./missionTypes.ts";

/** Bands locked from bake at D1 (2026-07-23). Widen only with intentional physics changes. */
const GOLDEN = {
  durationS: 425_523.455_752_903_25,
  durationTolFrac: 0.02, // ±2%
  tliDv: 3.133_144_768_957_019_5,
  tliDvTol: 0.05, // km/s
  moonPhase0: 0.627_879_299_412_343_4,
  moonPhaseTol: 0.05,
  samplesMin: 4_000,
  samplesMax: 12_000,
  stageT: 497.7,
  stageTTol: 30, // s
  // minMoonAlt is computed at load from samples; band from typical bake
  minMoonAltMax: 50_000, // km
} as const;

function phaseSequence(
  samples: Array<{ phase: string }>,
): PhaseId[] {
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
  samples: Array<{ t: number; st?: boolean; phase: string }>,
): number | null {
  for (const s of samples) {
    if (s.st === true) return s.t;
    // Packed may use st; infer for older packs
    if (
      s.phase !== "launch" &&
      s.phase !== "ascent" &&
      s.st === undefined
    ) {
      // fall through
    }
  }
  for (const s of samples) {
    if (s.st) return s.t;
  }
  return null;
}

describe("mission golden bands (baked pack)", () => {
  it("matches duration / TLI Δv / sample count bands", () => {
    assert.equal(packed.ok, true);
    assert.ok(
      Math.abs(packed.durationS - GOLDEN.durationS) <=
        GOLDEN.durationS * GOLDEN.durationTolFrac,
      `durationS ${packed.durationS} outside ±${GOLDEN.durationTolFrac * 100}% of ${GOLDEN.durationS}`,
    );
    assert.ok(
      Math.abs(packed.tliDv - GOLDEN.tliDv) <= GOLDEN.tliDvTol,
      `tliDv ${packed.tliDv} outside ±${GOLDEN.tliDvTol} of ${GOLDEN.tliDv}`,
    );
    assert.ok(
      Math.abs(packed.moonPhase0 - GOLDEN.moonPhase0) <= GOLDEN.moonPhaseTol,
      `moonPhase0 ${packed.moonPhase0} outside ±${GOLDEN.moonPhaseTol}`,
    );
    assert.ok(
      packed.samples.length >= GOLDEN.samplesMin &&
        packed.samples.length <= GOLDEN.samplesMax,
      `samples ${packed.samples.length} outside [${GOLDEN.samplesMin}, ${GOLDEN.samplesMax}]`,
    );
  });

  it("has expected phase order and stage-out window", () => {
    const seq = phaseSequence(packed.samples);
    assert.deepEqual(seq, [...EXPECTED_PHASE_ORDER]);

    const stageT = firstStagedT(packed.samples);
    assert.ok(stageT != null, "expected a staged sample");
    assert.ok(
      Math.abs(stageT! - GOLDEN.stageT) <= GOLDEN.stageTTol,
      `stageT ${stageT} outside ±${GOLDEN.stageTTol}s of ${GOLDEN.stageT}`,
    );
  });

  it("starts at launch and ends landed with finite TLI", () => {
    assert.equal(packed.samples[0]!.phase, "launch");
    assert.equal(packed.samples[packed.samples.length - 1]!.phase, "landed");
    assert.ok(packed.tliDv > 2.5 && packed.tliDv < 4.0);
    assert.ok(packed.durationS > 24 * 3600 && packed.durationS < 14 * 24 * 3600);
  });

  it("has LEO dogleg burns (paid plane change) and ship fuel draw", () => {
    const leo = packed.samples.filter((s) => s.phase === "leo");
    assert.ok(leo.length > 10, "expected dense LEO samples");
    const burning = leo.filter((s) => s.burning);
    assert.ok(
      burning.length > 5,
      `expected LEO burning samples for dogleg, got ${burning.length}`,
    );
    // Ship fuel should drop over LEO (dogleg spends propellant)
    const fs0 = leo[0]!.fs ?? 1;
    const fs1 = leo[leo.length - 1]!.fs ?? 1;
    assert.ok(
      fs1 < fs0 - 1e-4,
      `ship fuel should fall during dogleg (start=${fs0}, end=${fs1})`,
    );
  });
});

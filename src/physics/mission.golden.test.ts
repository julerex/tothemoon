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
import { bodyPositions, moonSouthUnit, setMoonPhase0 } from "./bodies.ts";
import { R_MOON } from "./constants.ts";
import { EXPECTED_PHASE_ORDER } from "./trajectoryInvariants.ts";
import type { PhaseId } from "./missionTypes.ts";

/** Bands locked after A1 finite TLI + south-pole land (2026-07-23). */
const GOLDEN = {
  durationS: 522_915.959_354_636_3,
  durationTolFrac: 0.05, // ±5% (finite TLI / polar taxi length can shift)
  tliDv: 3.133_144_768_957_019_5,
  tliDvTol: 0.08, // km/s
  moonPhase0: 0.058, // retuned by probe after finite TLI
  moonPhaseTol: 0.2,
  samplesMin: 4_000,
  samplesMax: 20_000,
  stageT: 497.7,
  stageTTol: 30, // s
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

  it("has a finite TLI burn lasting ~2–4 minutes", () => {
    const tli = packed.samples.filter((s) => s.phase === "tli");
    assert.ok(tli.length >= 2, "expected multiple TLI samples");
    const t0 = tli[0]!.t;
    const t1 = tli[tli.length - 1]!.t;
    const burnS = t1 - t0;
    assert.ok(
      burnS >= 100 && burnS <= 360,
      `TLI duration ${burnS.toFixed(1)}s outside ~2–6 min theater band`,
    );
    const burning = tli.filter((s) => s.burning);
    assert.ok(burning.length > 5, "expected dense TLI burn samples");
  });

  it("lands near the lunar south pole", () => {
    setMoonPhase0(packed.moonPhase0);
    const landed = packed.samples.filter((s) => s.phase === "landed");
    assert.ok(landed.length > 0);
    const s0 = landed[0]!;
    const b = bodyPositions(s0.t);
    const dx = s0.p[0]! - b.moon.x;
    const dy = s0.p[1]! - b.moon.y;
    const dz = s0.p[2]! - b.moon.z;
    const r = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / r;
    const uy = dy / r;
    const uz = dz / r;
    const south = moonSouthUnit();
    const align = ux * south.x + uy * south.y + uz * south.z;
    assert.ok(
      align > 0.7,
      `landing radial·south=${align.toFixed(3)} (want >0.7 near pole)`,
    );
    assert.ok(Math.abs(r - R_MOON) < 5, `surface radius ${r} vs R_MOON`);
  });

  it("has discrete TCM burns during coast (not continuous midcourse)", () => {
    const coast = packed.samples.filter((s) => s.phase === "coast");
    assert.ok(coast.length > 50);
    const burning = coast.filter((s) => s.burning && (s.th ?? 0) > 0);
    // Discrete TCMs: some burns, but not the majority of coast samples
    assert.ok(
      burning.length >= 5,
      `expected TCM burn samples, got ${burning.length}`,
    );
    assert.ok(
      burning.length < coast.length * 0.25,
      `too many coast burns (${burning.length}/${coast.length}) — continuous track?`,
    );
    // Cluster count ≈ TCM events (gaps between burns)
    let clusters = 0;
    let inB = false;
    for (const s of coast) {
      const b = !!(s.burning && (s.th ?? 0) > 0);
      if (b && !inB) {
        clusters += 1;
        inB = true;
      } else if (!b) inB = false;
    }
    assert.ok(
      clusters >= 1 && clusters <= 5,
      `expected 1–5 TCM clusters, got ${clusters}`,
    );
  });
});

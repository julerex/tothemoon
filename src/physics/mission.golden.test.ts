/**
 * Golden bands for the baked trajectory pack — pins mission shape so physics
 * slices cannot silently drift.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import packed from "../data/trajectory.json";
import { bodyPositions, moonSouthUnit, setMoonPhase0 } from "./bodies.ts";
import { R_MOON } from "./constants.ts";
import { EXPECTED_PHASE_ORDER } from "./trajectoryInvariants.ts";
import type { PhaseId } from "./missionTypes.ts";

/** Bands after LRO free coast + south-pole LOI/PDI (2026-07-23). */
const GOLDEN = {
  durationS: 386_500,
  durationTolFrac: 0.15,
  tliDv: 3.133_1,
  tliDvTol: 0.2,
  moonPhaseTol: 0.5,
  samplesMin: 4_000,
  samplesMax: 30_000,
  stageT: 140,
  stageTTol: 90, // mass-coupled dry booster stages earlier
} as const;

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

  it("has LEO dogleg burns and ship fuel drops by TLI", () => {
    const leo = packed.samples.filter((s) => s.phase === "leo");
    assert.ok(leo.length > 10, "expected dense LEO samples");
    const burning = leo.filter((s) => s.burning);
    assert.ok(
      burning.length > 5,
      `expected LEO burning samples for dogleg, got ${burning.length}`,
    );
    // Dogleg books prop at end of LEO; fuel drop visible by first TLI sample
    const tli = packed.samples.find((s) => s.phase === "tli");
    assert.ok(tli);
    const fsLeo = leo[0]!.fs ?? 1;
    const fsTli = tli!.fs ?? 1;
    assert.ok(
      fsTli < fsLeo - 0.01,
      `ship fuel should fall by TLI (leo0=${fsLeo}, tli=${fsTli})`,
    );
  });

  it("has a finite TLI burn lasting ~2–4 minutes", () => {
    const tli = packed.samples.filter((s) => s.phase === "tli");
    assert.ok(tli.length >= 2, "expected multiple TLI samples");
    const burnS = tli[tli.length - 1]!.t - tli[0]!.t;
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
    // Use last landed sample (after polar taxi)
    const s0 = landed[landed.length - 1]!;
    const b = bodyPositions(s0.t);
    const dx = s0.p[0]! - b.moon.x;
    const dy = s0.p[1]! - b.moon.y;
    const dz = s0.p[2]! - b.moon.z;
    const r = Math.hypot(dx, dy, dz) || 1;
    const south = moonSouthUnit();
    const align = (dx * south.x + dy * south.y + dz * south.z) / r;
    assert.ok(
      align > 0.7,
      `landing radial·south=${align.toFixed(3)} (want >0.7 near pole)`,
    );
    assert.ok(Math.abs(r - R_MOON) < 5, `surface radius ${r} vs R_MOON`);
  });

  it("has a pure ballistic coast (no midcourse TCM burns)", () => {
    const coast = packed.samples.filter((s) => s.phase === "coast");
    assert.ok(coast.length > 50);
    const burning = coast.filter((s) => s.burning && (s.th ?? 0) > 0);
    assert.ok(
      burning.length === 0,
      `LRO-style coast should be ballistic, got ${burning.length} burn samples`,
    );
  });
});

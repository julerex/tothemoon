/**
 * Build-time mission integration → static JSON for instant page load.
 *
 *   npx tsx scripts/precompute-trajectory.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMission } from "../src/physics/mission.ts";
import type { MissionResult, Sample } from "../src/physics/mission.ts";

export type PackedSample = {
  t: number;
  p: [number, number, number];
  v: [number, number, number];
  phase: Sample["phase"];
  burning: boolean;
  /** Booster fuel remaining 0–1 */
  fb: number;
  /** Ship fuel remaining 0–1 */
  fs: number;
  /** Thrust force (kN) — packed smaller than raw newtons */
  th: number;
  /** Booster staged off */
  st: boolean;
};

export type PackedTrajectory = {
  version: 1;
  generatedAt: string;
  moonPhase0: number;
  tliDv: number;
  durationS: number;
  ok: boolean;
  message: string;
  minMoonAlt: number;
  samples: PackedSample[];
};

function pack(result: MissionResult): PackedTrajectory {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    moonPhase0: result.moonPhase0,
    tliDv: result.tliDv,
    durationS: result.durationS,
    ok: result.ok,
    message: result.message,
    minMoonAlt: result.minMoonAlt,
    samples: result.samples.map((s) => ({
      t: round(s.t, 3),
      p: [round(s.pos.x, 4), round(s.pos.y, 4), round(s.pos.z, 4)],
      v: [round(s.vel.x, 6), round(s.vel.y, 6), round(s.vel.z, 6)],
      phase: s.phase,
      burning: s.burning,
      fb: round(s.fuelBooster, 4),
      fs: round(s.fuelShip, 4),
      th: round(s.thrustN / 1000, 2), // store kN
      st: s.staged,
    })),
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

const t0 = performance.now();
const result = runMission();
const packed = pack(result);
const ms = performance.now() - t0;

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../src/data/trajectory.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(packed));

console.info(
  `[precompute] ${packed.message} · ${packed.samples.length} samples · ${(packed.durationS / 3600).toFixed(2)} h · ${ms.toFixed(0)} ms`,
);
console.info(`[precompute] wrote ${outPath}`);

if (!packed.ok) {
  console.warn("[precompute] warning: mission not marked ok — shipping anyway");
}

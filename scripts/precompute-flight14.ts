/**
 * Build-time Flight 14 integration → static JSON for instant page load.
 *
 *   npx tsx scripts/precompute-flight14.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyFlight14Epoch } from "../src/physics/flight14Epoch.ts";
import { runFlight14Mission } from "../src/physics/flight14Mission.ts";
import type { Sample } from "../src/physics/missionTypes.ts";
import { TRAJECTORY_PACK_VERSION } from "../src/physics/trajectoryMeta.ts";
import { deriveTrajectoryMeta } from "../src/physics/trajectoryMeta.ts";

type PackedSample = {
  t: number;
  p: [number, number, number];
  v: [number, number, number];
  phase: Sample["phase"];
  burning: boolean;
  fb: number;
  fs: number;
  th: number;
  st: boolean;
};

function packSample(s: Sample): PackedSample {
  return {
    t: s.t, p: [s.pos.x, s.pos.y, s.pos.z], v: [s.vel.x, s.vel.y, s.vel.z],
    phase: s.phase, burning: s.burning, fb: s.fuelBooster, fs: s.fuelShip,
    th: s.thrustN / 1000, st: s.staged,
  };
}

function packCore(result: ReturnType<typeof runFlight14Mission>) {
  return {
    version: TRAJECTORY_PACK_VERSION, missionId: "flight-14" as const,
    generatedAt: new Date().toISOString(), moonPhase0: result.moonPhase0,
    translunarInjectionDeltaV: 0, durationS: result.durationS,
    horizonsLandingT: result.horizonsLandingT ?? result.durationS,
    ok: result.ok, message: result.message,
  };
}

function packMeta(result: ReturnType<typeof runFlight14Mission>) {
  const meta = deriveTrajectoryMeta(result.samples);
  return {
    minMoonAlt: Number.isFinite(result.minMoonAlt) ? result.minMoonAlt : 1e9,
    peakSpeedKmS: result.peakSpeedKmS ?? meta.peakSpeedKmS,
    stageT: result.stageT ?? meta.stageT,
  };
}

function pack(result: ReturnType<typeof runFlight14Mission>) {
  return { ...packCore(result), ...packMeta(result), samples: result.samples.map(packSample) };
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "src/data/flight14-trajectory.json");

console.info("[precompute-flight14] Integrating Flight 14…");
const t0 = performance.now();
const { epoch } = applyFlight14Epoch(0, 0);
const result = runFlight14Mission({ epoch });
const packed = pack(result);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(packed));
const mb = (Buffer.byteLength(JSON.stringify(packed)) / 1e6).toFixed(2);
console.info(
  `[precompute-flight14] Wrote ${outPath} · ${packed.samples.length} samples · ${mb} MB · ${((performance.now() - t0) / 1000).toFixed(1)}s`,
);
if (!result.ok) {
  console.error("[precompute-flight14] Mission reported not ok:", result.message);
  process.exit(1);
}

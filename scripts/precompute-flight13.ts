/**
 * Build-time Flight 13 integration → static JSON for instant page load.
 *
 *   npx tsx scripts/precompute-flight13.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyFlight13Epoch } from "../src/physics/flight13Epoch.ts";
import { runFlight13Mission } from "../src/physics/flight13Mission.ts";
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

function packCore(result: ReturnType<typeof runFlight13Mission>) {
  return {
    version: TRAJECTORY_PACK_VERSION, missionId: "flight-13" as const,
    generatedAt: new Date().toISOString(), moonPhase0: result.moonPhase0,
    translunarInjectionDeltaV: 0, durationS: result.durationS,
    horizonsLandingT: result.horizonsLandingT ?? result.durationS,
    ok: result.ok, message: result.message,
  };
}

function packMeta(result: ReturnType<typeof runFlight13Mission>) {
  const meta = deriveTrajectoryMeta(result.samples);
  return {
    minMoonAlt: Number.isFinite(result.minMoonAlt) ? result.minMoonAlt : 1e9,
    peakSpeedKmS: result.peakSpeedKmS ?? meta.peakSpeedKmS,
    stageT: result.stageT ?? meta.stageT,
  };
}

function pack(result: ReturnType<typeof runFlight13Mission>) {
  return { ...packCore(result), ...packMeta(result), samples: result.samples.map(packSample) };
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "src/data/flight13-trajectory.json");

console.info("[precompute-flight13] Integrating Flight 13…");
const t0 = performance.now();
// Daytime Starbase launch epoch (must match runtime flight13Theater)
const { epoch } = applyFlight13Epoch(0, 0);
const result = runFlight13Mission({ epoch });
const packed = pack(result);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(packed));
const mb = (Buffer.byteLength(JSON.stringify(packed)) / 1e6).toFixed(2);
console.info(
  `[precompute-flight13] Wrote ${outPath} · ${packed.samples.length} samples · ${mb} MB · ${((performance.now() - t0) / 1000).toFixed(1)}s`,
);
if (!result.ok) {
  console.error("[precompute-flight13] Mission reported not ok:", result.message);
  process.exit(1);
}

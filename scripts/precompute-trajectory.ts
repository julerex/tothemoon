/**
 * Build-time mission integration → static JSON for instant page load.
 *
 *   npx tsx scripts/precompute-trajectory.ts
 *
 * Pack version 2 persists mission summary meta (minMoonAlt, peakSpeedKmS,
 * stageT) so the runtime HUD never re-scans samples at load.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMission } from "../src/physics/mission.ts";
import type { MissionResult, Sample } from "../src/physics/mission.ts";
import {
  assertTrajectoryInvariants,
  unpackPackedForInvariants,
} from "../src/physics/trajectoryInvariants.ts";
import {
  deriveTrajectoryMeta,
  TRAJECTORY_PACK_VERSION,
} from "../src/physics/trajectoryMeta.ts";

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
  version: typeof TRAJECTORY_PACK_VERSION;
  generatedAt: string;
  moonPhase0: number;
  translunarInjectionDeltaV: number;
  durationS: number;
  /** Mission t at Horizons τ=0 during bake (must match runtime EphemerisEpoch.horizonsLandingT). */
  horizonsLandingT?: number;
  ok: boolean;
  message: string;
  /** Minimum altitude above mean lunar radius (km) */
  minMoonAlt: number;
  /** Peak inertial |v| (km/s) */
  peakSpeedKmS: number;
  /** Mission time of first staged sample (s), or null */
  stageT: number | null;
  /** Peak |r_nbody − r_kepler| on Translunar injection coast (km); corridor meta */
  keplerRefMaxDevKm?: number;
  samples: PackedSample[];
};

function pack(result: MissionResult): PackedTrajectory {
  const meta = deriveTrajectoryMeta(result.samples);
  // Prefer integration minMoonAlt when finite (full-rate coast); fall back to scan
  const minMoonAlt =
    result.minMoonAlt != null && Number.isFinite(result.minMoonAlt)
      ? result.minMoonAlt
      : meta.minMoonAlt;
  const peakSpeedKmS =
    result.peakSpeedKmS != null && Number.isFinite(result.peakSpeedKmS)
      ? result.peakSpeedKmS
      : meta.peakSpeedKmS;
  const stageT =
    result.stageT !== undefined ? result.stageT : meta.stageT;
  const keplerRefMaxDevKm =
    result.keplerRefMaxDevKm != null && Number.isFinite(result.keplerRefMaxDevKm)
      ? result.keplerRefMaxDevKm
      : undefined;

  return {
    version: TRAJECTORY_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    moonPhase0: result.moonPhase0,
    translunarInjectionDeltaV: result.translunarInjectionDeltaV,
    durationS: result.durationS,
    horizonsLandingT: result.horizonsLandingT,
    ok: result.ok,
    message: result.message,
    minMoonAlt,
    peakSpeedKmS: round(peakSpeedKmS, 6),
    stageT: stageT == null ? null : round(stageT, 3),
    keplerRefMaxDevKm:
      keplerRefMaxDevKm != null ? round(keplerRefMaxDevKm, 1) : undefined,
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
console.info(
  `[precompute] meta v${packed.version}: minMoonAlt=${packed.minMoonAlt.toFixed(1)} km · peak|v|=${packed.peakSpeedKmS.toFixed(3)} km/s · stageT=${packed.stageT == null ? "—" : `${packed.stageT.toFixed(1)} s`}` +
    (packed.keplerRefMaxDevKm != null
      ? ` · Kepler max|Δr|=${packed.keplerRefMaxDevKm.toFixed(0)} km`
      : ""),
);
console.info(`[precompute] wrote ${outPath}`);

// Fail the build if the packed trajectory is structurally broken
assertTrajectoryInvariants(unpackPackedForInvariants(packed));
console.info("[precompute] trajectory invariants OK");

if (!packed.ok) {
  console.warn("[precompute] warning: mission not marked ok — shipping anyway");
}

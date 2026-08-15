/**
 * Packed trajectory metadata helpers.
 *
 * Precompute persists min lunar altitude, peak inertial speed, and stage-out
 * time so the HUD complete card / metrics never re-scan samples at load.
 * Scene unit = km. Pure + scrub-free.
 */

import { R_MOON } from "./constants";
import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import type { PhaseId } from "./missionTypes";
import type { V3 } from "./vec3";

/**
 * Current pack schema version.
 * v1: samples + minMoonAlt + core fields
 * v2: + peakSpeedKmS + stageT (load must not re-scan when present)
 */
export const TRAJECTORY_PACK_VERSION = 2 as const;

/** Mission-summary stats stored beside samples in trajectory.json. */
export type TrajectoryPackMeta = Readonly<{
  /** Minimum altitude above mean lunar radius (km); ≤0 on impact/land */
  minMoonAlt: number;
  /** Peak |v| over samples (km/s, inertial / heliocentric theater frame) */
  peakSpeedKmS: number;
  /** Mission time (s) of first staged sample, or null if never staged */
  stageT: number | null;
}>;

export type SampleLikeForMeta = {
  t: number;
  pos: V3;
  vel: V3;
  phase: string | PhaseId;
  staged: boolean;
};

/**
 * Scan lunar-relevant phases for lowest altitude above mean lunar radius.
 * Matches the pre-v2 load-time path so fallbacks stay consistent.
 */
const MIN_ALT_PHASES = new Set(["approach", "braking", "descent", "landed", "impact", "coast"]);

function moonAltAt(s: SampleLikeForMeta, epoch: EphemerisEpoch): number | null {
  if (!MIN_ALT_PHASES.has(s.phase as string)) return null;
  const b = bodyPositions(s.t, epoch);
  const d = Math.hypot(s.pos.x - b.moon.x, s.pos.y - b.moon.y, s.pos.z - b.moon.z);
  if (s.phase === "coast" && d > 80_000) return null;
  return d - R_MOON;
}

export function computeMinMoonAlt(
  samples: SampleLikeForMeta[], epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  const minAlt = samples.reduce((lowest, s) => {
    const alt = moonAltAt(s, epoch);
    return alt == null ? lowest : Math.min(lowest, alt);
  }, Infinity);
  return Number.isFinite(minAlt) ? minAlt : 0;
}

/** Peak inertial speed (km/s) over the sample series. */
export function computePeakSpeedKmS(samples: SampleLikeForMeta[]): number {
  return samples.reduce((peak, s) => {
    const speed = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
    return Number.isFinite(speed) && speed > peak ? speed : peak;
  }, 0);
}

/**
 * Mission time of first sample with `staged === true`.
 * Returns null when the stack never stages.
 */
export function computeStageT(samples: SampleLikeForMeta[]): number | null {
  return samples.find((s) => s.staged && Number.isFinite(s.t))?.t ?? null;
}

/** Derive all pack meta fields from samples (precompute + v1 fallback). */
export function deriveTrajectoryMeta(
  samples: SampleLikeForMeta[],
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): TrajectoryPackMeta {
  return {
    minMoonAlt: computeMinMoonAlt(samples, epoch),
    peakSpeedKmS: computePeakSpeedKmS(samples),
    stageT: computeStageT(samples),
  };
}

/**
 * Prefer packed meta when finite; otherwise derive from samples.
 * Accepts partial v1 packs (missing peak/stage) without throwing.
 */
function resolveMinAlt(packed: Partial<TrajectoryPackMeta> | null | undefined, derived: TrajectoryPackMeta): number {
  return packed?.minMoonAlt != null && Number.isFinite(packed.minMoonAlt) ? packed.minMoonAlt : derived.minMoonAlt;
}

function resolvePeak(packed: Partial<TrajectoryPackMeta> | null | undefined, derived: TrajectoryPackMeta): number {
  return packed?.peakSpeedKmS != null && Number.isFinite(packed.peakSpeedKmS) && packed.peakSpeedKmS >= 0
    ? packed.peakSpeedKmS : derived.peakSpeedKmS;
}

function resolveStageT(packed: Partial<TrajectoryPackMeta> | null | undefined, derived: TrajectoryPackMeta): number | null {
  if (!packed || !("stageT" in packed)) return derived.stageT;
  if (packed.stageT == null) return null;
  return Number.isFinite(packed.stageT) ? packed.stageT : derived.stageT;
}

export function resolveTrajectoryMeta(
  packed: Partial<TrajectoryPackMeta> | null | undefined,
  samples: SampleLikeForMeta[], epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): TrajectoryPackMeta {
  const derived = deriveTrajectoryMeta(samples, epoch);
  return {
    minMoonAlt: resolveMinAlt(packed, derived),
    peakSpeedKmS: resolvePeak(packed, derived),
    stageT: resolveStageT(packed, derived),
  };
}

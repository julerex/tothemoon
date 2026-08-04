/**
 * Packed trajectory metadata helpers.
 *
 * Precompute persists min lunar altitude, peak inertial speed, and stage-out
 * time so the HUD complete card / metrics never re-scan samples at load.
 * Scene unit = km. Pure + scrub-free.
 */

import { R_MOON } from "./constants";
import { bodyPositions } from "./bodies";
import type { PhaseId } from "./missionTypes";
import type { V3 } from "./vec3";

/**
 * Current pack schema version.
 * v1: samples + minMoonAlt + core fields
 * v2: + peakSpeedKmS + stageT (load must not re-scan when present)
 */
export const TRAJECTORY_PACK_VERSION = 2 as const;

/** Mission-summary stats stored beside samples in trajectory.json. */
export type TrajectoryPackMeta = {
  /** Minimum altitude above mean lunar radius (km); ≤0 on impact/land */
  minMoonAlt: number;
  /** Peak |v| over samples (km/s, inertial / heliocentric theater frame) */
  peakSpeedKmS: number;
  /** Mission time (s) of first staged sample, or null if never staged */
  stageT: number | null;
};

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
export function computeMinMoonAlt(samples: SampleLikeForMeta[]): number {
  let minAlt = Infinity;
  for (const s of samples) {
    if (
      s.phase !== "approach" &&
      s.phase !== "braking" &&
      s.phase !== "descent" &&
      s.phase !== "landed" &&
      s.phase !== "impact" &&
      s.phase !== "coast"
    ) {
      continue;
    }
    const b = bodyPositions(s.t);
    const d = Math.hypot(
      s.pos.x - b.moon.x,
      s.pos.y - b.moon.y,
      s.pos.z - b.moon.z,
    );
    // Coast: only late coast near the Moon (skip early cislunar)
    if (s.phase === "coast" && d > 80_000) continue;
    minAlt = Math.min(minAlt, d - R_MOON);
  }
  return Number.isFinite(minAlt) ? minAlt : 0;
}

/** Peak inertial speed (km/s) over the sample series. */
export function computePeakSpeedKmS(samples: SampleLikeForMeta[]): number {
  let peak = 0;
  for (const s of samples) {
    const sp = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
    if (Number.isFinite(sp) && sp > peak) peak = sp;
  }
  return peak;
}

/**
 * Mission time of first sample with `staged === true`.
 * Returns null when the stack never stages.
 */
export function computeStageT(samples: SampleLikeForMeta[]): number | null {
  for (const s of samples) {
    if (s.staged && Number.isFinite(s.t)) return s.t;
  }
  return null;
}

/** Derive all pack meta fields from samples (precompute + v1 fallback). */
export function deriveTrajectoryMeta(
  samples: SampleLikeForMeta[],
): TrajectoryPackMeta {
  return {
    minMoonAlt: computeMinMoonAlt(samples),
    peakSpeedKmS: computePeakSpeedKmS(samples),
    stageT: computeStageT(samples),
  };
}

/**
 * Prefer packed meta when finite; otherwise derive from samples.
 * Accepts partial v1 packs (missing peak/stage) without throwing.
 */
export function resolveTrajectoryMeta(
  packed: Partial<TrajectoryPackMeta> | null | undefined,
  samples: SampleLikeForMeta[],
): TrajectoryPackMeta {
  const derived = deriveTrajectoryMeta(samples);
  const minMoonAlt =
    packed?.minMoonAlt != null && Number.isFinite(packed.minMoonAlt)
      ? packed.minMoonAlt
      : derived.minMoonAlt;
  const peakSpeedKmS =
    packed?.peakSpeedKmS != null &&
    Number.isFinite(packed.peakSpeedKmS) &&
    packed.peakSpeedKmS >= 0
      ? packed.peakSpeedKmS
      : derived.peakSpeedKmS;
  let stageT: number | null = derived.stageT;
  if (packed && "stageT" in packed) {
    if (packed.stageT == null) stageT = null;
    else if (Number.isFinite(packed.stageT)) stageT = packed.stageT;
  }
  return { minMoonAlt, peakSpeedKmS, stageT };
}

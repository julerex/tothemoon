/**
 * Cross-check Flight 13 restricted n-body dynamics against Earth-only mechanics.
 *
 * Re-integrates the same theater profile with `{ gravity: "earth" }` (Earth μ +
 * J₂ + atmosphere/drag, no Moon / solar tide) and compares sample paths at
 * matched mission times. On a ~1 h suborbital arc third-body accelerations are
 * tiny, so large deviations flag a bug in the shared force model or integrator
 * rather than expected physics.
 *
 * Pure + deterministic (no I/O beyond the mission logger).
 */

import {
  F13,
  runFlight13Mission,
  type Flight13MissionOptions,
} from "./flight13Mission";
import { altitudeEarth } from "./integrator";
import type { Sample } from "./missionTypes";
import { len, sub, v3 } from "./vec3";

const _d = v3();

/** Summary of n-body vs Earth-only Flight 13 paths. */
export type Flight13ForceCompare = {
  /** Peak |r_nbody − r_earth| over matched samples (km). */
  maxPosDevKm: number;
  /** Peak |v_nbody − v_earth| (km/s). */
  maxVelDevKmS: number;
  /** Peak |alt_nbody − alt_earth| (km). */
  maxAltDevKm: number;
  /** RMS position deviation (km). */
  rmsPosDevKm: number;
  /** Number of time-matched sample pairs. */
  nPairs: number;
  /**
   * Free-coast window only (SECO → relight): pure ballistic third-body check
   * without state-triggered burn amplification.
   */
  coastMaxPosDevKm: number;
  coastMaxVelDevKmS: number;
  coastRmsPosDevKm: number;
  coastNPairs: number;
  peakAltNbodyKm: number;
  peakAltEarthKm: number;
  durationNbodyS: number;
  durationEarthS: number;
  stageTNbody: number | null;
  stageTEarth: number | null;
};

/**
 * Interpolate sample trail at mission time t (linear in pos/vel).
 * Clamps to first/last sample.
 */
export function sampleAtTime(samples: Sample[], t: number): Sample {
  if (samples.length === 0) {
    throw new Error("sampleAtTime: empty samples");
  }
  if (t <= samples[0]!.t) return samples[0]!;
  const last = samples[samples.length - 1]!;
  if (t >= last.t) return last;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo]!;
  const b = samples[hi]!;
  const dt = b.t - a.t;
  const u = dt > 1e-12 ? (t - a.t) / dt : 0;
  return {
    ...a,
    t,
    pos: {
      x: a.pos.x + (b.pos.x - a.pos.x) * u,
      y: a.pos.y + (b.pos.y - a.pos.y) * u,
      z: a.pos.z + (b.pos.z - a.pos.z) * u,
    },
    vel: {
      x: a.vel.x + (b.vel.x - a.vel.x) * u,
      y: a.vel.y + (b.vel.y - a.vel.y) * u,
      z: a.vel.z + (b.vel.z - a.vel.z) * u,
    },
  };
}

function peakAltKm(samples: Sample[]): number {
  let maxA = 0;
  for (const s of samples) {
    const a = altitudeEarth(s.t, s.pos);
    if (a > maxA) maxA = a;
  }
  return maxA;
}

/**
 * Compare two sample trails (typically n-body vs Earth-only) at matched times.
 */
export function summarizeForceDeviation(
  nbodySamples: Sample[],
  earthSamples: Sample[],
  meta?: {
    durationNbodyS?: number;
    durationEarthS?: number;
    stageTNbody?: number | null;
    stageTEarth?: number | null;
  },
): Flight13ForceCompare {
  if (nbodySamples.length < 2 || earthSamples.length < 2) {
    return {
      maxPosDevKm: 0,
      maxVelDevKmS: 0,
      maxAltDevKm: 0,
      rmsPosDevKm: 0,
      nPairs: 0,
      coastMaxPosDevKm: 0,
      coastMaxVelDevKmS: 0,
      coastRmsPosDevKm: 0,
      coastNPairs: 0,
      peakAltNbodyKm: peakAltKm(nbodySamples),
      peakAltEarthKm: peakAltKm(earthSamples),
      durationNbodyS: meta?.durationNbodyS ?? 0,
      durationEarthS: meta?.durationEarthS ?? 0,
      stageTNbody: meta?.stageTNbody ?? null,
      stageTEarth: meta?.stageTEarth ?? null,
    };
  }

  const tEnd = Math.min(
    nbodySamples[nbodySamples.length - 1]!.t,
    earthSamples[earthSamples.length - 1]!.t,
  );

  let maxPos = 0;
  let maxVel = 0;
  let maxAlt = 0;
  let sumSq = 0;
  let n = 0;

  // Ballistic coast: after SECO energy insert, before deorbit relight
  const coastT0 = F13.SECO + 30;
  const coastT1 = F13.RELIGHT - 30;
  let coastMaxPos = 0;
  let coastMaxVel = 0;
  let coastSumSq = 0;
  let coastN = 0;

  for (const s of nbodySamples) {
    if (s.t > tEnd + 1e-9) break;
    const e = sampleAtTime(earthSamples, s.t);
    sub(_d, s.pos, e.pos);
    const dPos = len(_d);
    sub(_d, s.vel, e.vel);
    const dVel = len(_d);
    const dAlt = Math.abs(
      altitudeEarth(s.t, s.pos) - altitudeEarth(e.t, e.pos),
    );
    if (dPos > maxPos) maxPos = dPos;
    if (dVel > maxVel) maxVel = dVel;
    if (dAlt > maxAlt) maxAlt = dAlt;
    sumSq += dPos * dPos;
    n++;

    if (s.t >= coastT0 && s.t <= coastT1) {
      if (dPos > coastMaxPos) coastMaxPos = dPos;
      if (dVel > coastMaxVel) coastMaxVel = dVel;
      coastSumSq += dPos * dPos;
      coastN++;
    }
  }

  return {
    maxPosDevKm: maxPos,
    maxVelDevKmS: maxVel,
    maxAltDevKm: maxAlt,
    rmsPosDevKm: n > 0 ? Math.sqrt(sumSq / n) : 0,
    nPairs: n,
    coastMaxPosDevKm: coastMaxPos,
    coastMaxVelDevKmS: coastMaxVel,
    coastRmsPosDevKm: coastN > 0 ? Math.sqrt(coastSumSq / coastN) : 0,
    coastNPairs: coastN,
    peakAltNbodyKm: peakAltKm(nbodySamples),
    peakAltEarthKm: peakAltKm(earthSamples),
    durationNbodyS:
      meta?.durationNbodyS ?? nbodySamples[nbodySamples.length - 1]!.t,
    durationEarthS:
      meta?.durationEarthS ?? earthSamples[earthSamples.length - 1]!.t,
    stageTNbody: meta?.stageTNbody ?? null,
    stageTEarth: meta?.stageTEarth ?? null,
  };
}

/**
 * Run Earth-only Flight 13 and compare against an existing n-body sample trail
 * (e.g. the baked pack). Prefer this in the theater so we do not re-integrate
 * the n-body profile at metrics open.
 */
export function compareFlight13ToEarthOnly(
  nbodySamples: Sample[],
  meta?: {
    durationS?: number;
    stageT?: number | null;
  },
  earthOpts?: Flight13MissionOptions,
): Flight13ForceCompare {
  const earth = runFlight13Mission({
    ...earthOpts,
    gravity: "earth",
  });
  return summarizeForceDeviation(nbodySamples, earth.samples, {
    durationNbodyS: meta?.durationS,
    durationEarthS: earth.durationS,
    stageTNbody: meta?.stageT ?? null,
    stageTEarth: earth.stageT ?? null,
  });
}

/**
 * Run Flight 13 under both force models and report path agreement.
 */
export function compareFlight13ForceModels(
  nbodyOpts?: Flight13MissionOptions,
): Flight13ForceCompare {
  const nbody = runFlight13Mission({
    ...nbodyOpts,
    gravity: "nbody",
  });
  const earth = runFlight13Mission({
    ...nbodyOpts,
    gravity: "earth",
  });
  return summarizeForceDeviation(nbody.samples, earth.samples, {
    durationNbodyS: nbody.durationS,
    durationEarthS: earth.durationS,
    stageTNbody: nbody.stageT ?? null,
    stageTEarth: earth.stageT ?? null,
  });
}

/** Compact Metrics / HUD line for a force-model check. */
export function formatForceCompareLine(c: Flight13ForceCompare): string {
  return (
    `n-body vs Earth-only · coast max |Δr| ${c.coastMaxPosDevKm.toFixed(1)} km · ` +
    `full max |Δr| ${c.maxPosDevKm.toFixed(0)} km`
  );
}

/**
 * Expected order-of-magnitude bounds for a healthy n-body vs Earth-only
 * Flight 13 pair (suborbital ~1 h). Not a certification table — gates CI
 * against integrator / force-model regressions.
 *
 * Full-mission bounds are looser: SECO / relight / land triggers are
 * state-dependent, so tiny third-body drifts can shift burn timing and
 * amplify |Δv|. The free-coast window is the pure physics check.
 */
export const FLIGHT13_FORCE_AGREE = {
  /** Full-arc peak |Δr| (km) — guidance-amplified OK within this. */
  maxPosDevKm: 500,
  /** Full-arc peak |Δv| (km/s). */
  maxVelDevKmS: 0.5,
  /** Full-arc peak |Δalt| (km). */
  maxAltDevKm: 200,
  /** Free-coast peak |Δr| (km) — third-body only. */
  coastMaxPosDevKm: 15,
  /** Free-coast peak |Δv| (km/s). */
  coastMaxVelDevKmS: 0.01,
  /** |stageT| difference (s). */
  stageTDiffS: 5,
  /** Public hot-stage still near both models. */
  stageNearHotStageS: 20,
  /** SECO-class mark is F13.HOT_STAGE for reference. */
  hotStageS: F13.HOT_STAGE,
} as const;

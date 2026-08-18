/**
 * Live ship/moon sampling for ecliptic-plane trajectory maps (internal).
 */

import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import type { ReadonlySample } from "../physics/missionTypes";
import { v3 } from "../physics/vec3";
import {
  craftEarthRel,
  moonEarthRel,
  projectEarthCentricPolar,
  type PolarLive,
  type PolarPoint,
  type PolarTrajectoryModel,
  type TimedPolarPoint,
} from "./polarTrajectoriesGeometry";

const _rel = v3();

/** Live ship/moon equatorial positions at mission time t. */
export function livePolar(
  model: PolarTrajectoryModel,
  samples: readonly ReadonlySample[],
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): PolarLive {
  const shipPt = liveShipPolar(model, samples, t, epoch);
  moonEarthRel(t, _rel, epoch);
  const moonPt = projectEarthCentricPolar(_rel, model.basis);
  return packPolarLive(shipPt, moonPt, t);
}

function packPolarLive(
  shipPt: PolarPoint | null,
  moonPt: PolarPoint,
  t: number,
): PolarLive {
  return {
    ship: shipPt, moon: moonPt, t,
    shipR: shipPt ? Math.hypot(shipPt.x, shipPt.y) : 0,
    moonR: Math.hypot(moonPt.x, moonPt.y),
  };
}

function liveShipPolar(
  model: PolarTrajectoryModel,
  samples: readonly ReadonlySample[],
  t: number,
  epoch: EphemerisEpoch,
): PolarPoint | null {
  if (samples.length === 0) return sampleTrailAt(model.shipTrail, t);
  const s = sampleAtTime(samples, t);
  if (!s) return sampleTrailAt(model.shipTrail, t);
  craftEarthRel(s, _rel, epoch);
  return projectEarthCentricPolar(_rel, model.basis);
}

function sampleAtTime(samples: readonly ReadonlySample[], t: number): ReadonlySample | null {
  if (samples.length === 0) return null;
  if (t <= samples[0]!.t) return samples[0]!;
  const last = samples[samples.length - 1]!;
  if (t >= last.t) return last;
  return interpolateSample(samples, t);
}

function interpolateSample(samples: readonly ReadonlySample[], t: number): ReadonlySample {
  const { lo, hi } = binarySearchTime(samples, t, (s) => s.t);
  const a = samples[lo]!;
  const b = samples[hi]!;
  return { ...a, t, pos: lerpPos(a.pos, b.pos, lerpU(a.t, b.t, t)), vel: a.vel };
}

function lerpPos(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  u: number,
): { x: number; y: number; z: number } {
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
  };
}

function binarySearchTime<T>(
  arr: readonly T[],
  t: number,
  getT: (x: T) => number,
): { lo: number; hi: number } {
  let lo = 0;
  let hi = arr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (getT(arr[mid]!) <= t) lo = mid;
    else hi = mid;
  }
  return { lo, hi };
}

function lerpU(t0: number, t1: number, t: number): number {
  const dt = t1 - t0;
  return dt > 1e-12 ? (t - t0) / dt : 0;
}

export function sampleTrailAt(
  trail: TimedPolarPoint[],
  t: number,
): PolarPoint | null {
  if (trail.length === 0) return null;
  if (t <= trail[0]!.t) return { x: trail[0]!.x, y: trail[0]!.y };
  const last = trail[trail.length - 1]!;
  if (t >= last.t) return { x: last.x, y: last.y };
  return lerpTrailPoint(trail, t);
}

function lerpTrailPoint(
  trail: TimedPolarPoint[],
  t: number,
): PolarPoint {
  const { lo, hi } = binarySearchTime(trail, t, (p) => p.t);
  const a = trail[lo]!;
  const b = trail[hi]!;
  const u = lerpU(a.t, b.t, t);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

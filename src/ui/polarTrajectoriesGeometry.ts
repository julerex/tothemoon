/**
 * Earth-centric ecliptic-plane trajectory model, projection, and live sampling.
 * Canvas paint lives in polarTrajectoriesDraw.ts.
 */

import { R_EARTH, R_MOON, A_EM } from "../physics/constants";
import { bodyPositions, osculatingMoonOrbitPoints } from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import type { ReadonlySample } from "../physics/missionTypes";
import { dot, type V3, v3 } from "../physics/vec3";
import { fitCenteredSquareView, type ViewTransform } from "./canvasDiagram";

/** 2-D point in the ecliptic plane (km), looking from ecliptic north. */
export type PolarPoint = { x: number; y: number };

export type TimedPolarPoint = PolarPoint & { t: number };

export type PolarBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

/**
 * Orthonormal frame: e1, e2 span the ecliptic plane; n = ecliptic north (+Z).
 * Looking from +n, +x = e1 (ecliptic X), +y = e2 (ecliptic Y).
 */
export type PolarBasis = {
  n: V3;
  e1: V3;
  e2: V3;
};

export type PolarTrajectoryModel = {
  basis: PolarBasis;
  /** Ship / stack path (Earth-relative, ecliptic projection). */
  shipTrail: TimedPolarPoint[];
  /** Moon path over the same mission window. */
  moonTrail: TimedPolarPoint[];
  bounds: PolarBounds;
  rEarth: number;
  rMoon: number;
  /** Mean Earth–Moon distance (km) — reference ring. */
  aEm: number;
};

export type PolarLive = {
  ship: PolarPoint | null;
  moon: PolarPoint | null;
  shipR: number;
  moonR: number;
  t: number;
};

export type { ViewTransform };

const _rel = v3();

/**
 * Fixed theater basis: look along ecliptic +Z (perpendicular to the ecliptic).
 * e1 = ecliptic +X, e2 = ecliptic +Y, n = ecliptic +Z.
 *
 * Named `polarBasisLookingNorth` for API stability; “north” here means
 * ecliptic north, not Earth's geographic pole.
 */
export function polarBasisLookingNorth(): PolarBasis {
  return {
    n: v3(0, 0, 1),
    e1: v3(1, 0, 0),
    e2: v3(0, 1, 0),
  };
}

/**
 * Project an Earth-relative inertial vector into the ecliptic plane.
 * Drops the ecliptic-normal component (z in the theater frame).
 */
export function projectEarthCentricPolar(
  earthRel: V3,
  basis: PolarBasis,
  out: PolarPoint = { x: 0, y: 0 },
): PolarPoint {
  out.x = dot(earthRel, basis.e1);
  out.y = dot(earthRel, basis.e2);
  return out;
}

/**
 * Earth-relative craft position at a sample (heliocentric sample − Earth).
 */
export function craftEarthRel(
  sample: ReadonlySample,
  out: V3 = v3(),
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  const b = bodyPositions(sample.t, epoch);
  out.x = sample.pos.x - b.earth.x;
  out.y = sample.pos.y - b.earth.y;
  out.z = sample.pos.z - b.earth.z;
  return out;
}

/** Moon − Earth at mission time t. */
export function moonEarthRel(
  t: number,
  out: V3 = v3(),
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  const b = bodyPositions(t, epoch);
  out.x = b.moon.x - b.earth.x;
  out.y = b.moon.y - b.earth.y;
  out.z = b.moon.z - b.earth.z;
  return out;
}

/**
 * Build polar trails from baked samples. Downsamples for draw performance
 * while keeping first/last and phase edges.
 */
export function buildPolarTrajectoryModel(
  samples: readonly ReadonlySample[],
  maxPoints = 1800,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): PolarTrajectoryModel | null {
  if (samples.length < 2) return null;
  const basis = polarBasisLookingNorth();
  const shipTrail: TimedPolarPoint[] = [];
  const moonTrail: TimedPolarPoint[] = [];
  const maxR = fillPolarTrails(samples, basis, shipTrail, moonTrail, maxPoints, epoch);
  return finishPolarModel(basis, shipTrail, moonTrail, maxR);
}

function finishPolarModel(
  basis: PolarBasis,
  shipTrail: TimedPolarPoint[],
  moonTrail: TimedPolarPoint[],
  maxR: number,
): PolarTrajectoryModel {
  return {
    basis,
    shipTrail,
    moonTrail,
    bounds: polarBoundsFromMaxR(maxR),
    rEarth: R_EARTH,
    rMoon: R_MOON,
    aEm: A_EM,
  };
}

function fillPolarTrails(
  samples: readonly ReadonlySample[],
  basis: PolarBasis,
  shipTrail: TimedPolarPoint[],
  moonTrail: TimedPolarPoint[],
  maxPoints: number,
  epoch: EphemerisEpoch,
): number {
  const maxR = samplePolarLoop(samples, basis, shipTrail, moonTrail, maxPoints, epoch);
  return Math.max(maxR, expandMaxRForMoonOrbit(samples, basis, epoch));
}

function samplePolarLoop(
  samples: readonly ReadonlySample[],
  basis: PolarBasis,
  shipTrail: TimedPolarPoint[],
  moonTrail: TimedPolarPoint[],
  maxPoints: number,
  epoch: EphemerisEpoch,
): number {
  const n = samples.length;
  const stride = Math.max(1, Math.ceil(n / maxPoints));
  let maxR = R_EARTH;
  for (let i = 0; i < n; i++) {
    if (!shouldKeepPolarSample(samples, i, n, stride)) continue;
    maxR = Math.max(maxR, pushPolarSample(samples[i]!, basis, shipTrail, moonTrail, epoch));
  }
  return maxR;
}

function shouldKeepPolarSample(
  samples: readonly ReadonlySample[],
  i: number,
  n: number,
  stride: number,
): boolean {
  if (i === 0 || i === n - 1 || i % stride === 0) return true;
  return i > 0 && samples[i - 1]!.phase !== samples[i]!.phase;
}

function pushPolarSample(
  s: ReadonlySample,
  basis: PolarBasis,
  shipTrail: TimedPolarPoint[],
  moonTrail: TimedPolarPoint[],
  epoch: EphemerisEpoch,
): number {
  craftEarthRel(s, _rel, epoch);
  const sp = projectEarthCentricPolar(_rel, basis);
  shipTrail.push({ x: sp.x, y: sp.y, t: s.t });
  moonEarthRel(s.t, _rel, epoch);
  const mp = projectEarthCentricPolar(_rel, basis);
  moonTrail.push({ x: mp.x, y: mp.y, t: s.t });
  return Math.max(Math.hypot(sp.x, sp.y), Math.hypot(mp.x, mp.y), A_EM);
}

function expandMaxRForMoonOrbit(
  samples: readonly ReadonlySample[],
  basis: PolarBasis,
  epoch: EphemerisEpoch,
): number {
  let maxR = 0;
  const n = samples.length;
  for (const t of [samples[0]!.t, samples[n - 1]!.t]) {
    for (const p of osculatingMoonOrbitPoints(t, epoch, 64)) {
      const mp = projectEarthCentricPolar(p, basis);
      maxR = Math.max(maxR, Math.hypot(mp.x, mp.y));
    }
  }
  return maxR;
}

function polarBoundsFromMaxR(maxR: number): PolarBounds {
  const pad = maxR * 0.08 + R_EARTH;
  return {
    xMin: -maxR - pad,
    xMax: maxR + pad,
    yMin: -maxR - pad,
    yMax: maxR + pad,
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

/**
 * Trail points up through missionT (for progressive path draw).
 * When missionT falls between samples, appends a linearly interpolated
 * endpoint so the stroked path meets the live marker instead of stopping
 * short at the previous sample.
 */
export function trailUpTo(
  trail: TimedPolarPoint[],
  missionT: number,
): TimedPolarPoint[] {
  if (trail.length === 0) return [];
  if (missionT <= trail[0]!.t) {
    const first = trail[0]!;
    return [{ x: first.x, y: first.y, t: first.t }];
  }
  if (missionT >= trail[trail.length - 1]!.t) return trail.slice();
  return trailUpToInterior(trail, missionT);
}

function trailUpToInterior(
  trail: TimedPolarPoint[],
  missionT: number,
): TimedPolarPoint[] {
  const { lo, hi } = binarySearchTime(trail, missionT, (p) => p.t);
  const a = trail[lo]!;
  const out = trail.slice(0, lo + 1);
  appendInterpTip(out, a, trail[hi]!, missionT);
  return out;
}

function appendInterpTip(
  out: TimedPolarPoint[],
  a: TimedPolarPoint,
  b: TimedPolarPoint,
  missionT: number,
): void {
  if (missionT <= a.t + 1e-12) return;
  const u = lerpU(a.t, b.t, missionT);
  out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, t: missionT });
}

/**
 * Project the osculating geocentric lunar orbit at mission time t into the
 * ecliptic plane. The live Moon always lies on this closed curve.
 */
export function projectedMoonOrbit(
  basis: PolarBasis,
  t: number,
  samples = 128,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): PolarPoint[] {
  const pts3 = osculatingMoonOrbitPoints(t, epoch, samples);
  const out: PolarPoint[] = [];
  for (const p of pts3) out.push(projectEarthCentricPolar(p, basis));
  return out;
}

export function fitPolarView(
  bounds: PolarBounds,
  cssW: number,
  cssH: number,
  dpr: number,
  padPx = 40,
): ViewTransform {
  return fitCenteredSquareView(bounds, cssW, cssH, dpr, padPx);
}

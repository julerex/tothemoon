/**
 * Interpolated JPL Horizons sample table for the July 2027 mission window.
 *
 * Data: `src/data/horizons-epoch.json` (regenerate with
 * `npx tsx scripts/fetch-horizons-epoch.ts`).
 *
 * Times are seconds relative to landing (2027-07-20 12:00 TDB). Mission clock
 * t = 0 at launch; pass `horizonsLandingT` so absolute ephemeris time is
 *   τ = t − horizonsLandingT
 *
 * Pure: no module mutable state — landing map comes from {@link EphemerisEpoch}.
 */
import horizonsPack from "../data/horizons-epoch.json";
import type { V3 } from "./vec3";

export type HorizonsSample = {
  /** Seconds from landing epoch (negative before landing). */
  dtS: number;
  /** Earth heliocentric ecliptic J2000: [x,y,z,vx,vy,vz] km, km/s */
  earth: number[];
  /** Moon geocentric ecliptic J2000: [x,y,z,vx,vy,vz] km, km/s */
  moonRel: number[];
};

type HorizonsPack = {
  version: number;
  source: string;
  landingUtc: string;
  landingJdTdb: number;
  samples: HorizonsSample[];
};

const pack = horizonsPack as HorizonsPack;
const samples = pack.samples;

/** True when the packed Horizons table has enough samples to interpolate. */
export function hasHorizonsTable(): boolean {
  return samples.length >= 2;
}

/**
 * @deprecated Prefer {@link hasHorizonsTable} + `epoch.useHorizons`.
 * Kept as alias for callers that only care whether a table exists.
 */
export function hasHorizonsEpoch(): boolean {
  return hasHorizonsTable();
}

export function horizonsSource(): string {
  return pack.source ?? "JPL Horizons";
}

export function horizonsLandingUtc(): string {
  return pack.landingUtc;
}

function lerp6(
  a: number[],
  b: number[],
  u: number,
  outP: V3,
  outV: V3,
): void {
  const v = 1 - u;
  outP.x = v * a[0]! + u * b[0]!;
  outP.y = v * a[1]! + u * b[1]!;
  outP.z = v * a[2]! + u * b[2]!;
  outV.x = v * a[3]! + u * b[3]!;
  outV.y = v * a[4]! + u * b[4]!;
  outV.z = v * a[5]! + u * b[5]!;
}

/**
 * Interpolate Earth (heliocentric) and Moon (geocentric) at mission time t.
 * Returns false if τ is outside the table (caller may fall back to analytic).
 *
 * @param missionT mission clock (s from launch)
 * @param horizonsLandingT mission t at which Horizons τ = 0
 */
function horizonsBracket(τ: number): { a: (typeof samples)[number]; b: (typeof samples)[number]; u: number } {
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.dtS <= τ) lo = mid; else hi = mid;
  }
  const a = samples[lo]!, b = samples[hi]!;
  return { a, b, u: (τ - a.dtS) / (b.dtS - a.dtS || 1) };
}

export function interpolateHorizons(
  missionT: number, horizonsLandingT: number,
  earthPos: V3, earthVel: V3, moonRelPos: V3, moonRelVel: V3,
): boolean {
  if (samples.length < 2) return false;
  const τ = missionT - horizonsLandingT;
  if (τ < samples[0]!.dtS || τ > samples[samples.length - 1]!.dtS) return false;
  const { a, b, u } = horizonsBracket(τ);
  lerp6(a.earth, b.earth, u, earthPos, earthVel);
  lerp6(a.moonRel, b.moonRel, u, moonRelPos, moonRelVel);
  return true;
}

/** Diagnostics / tests: sample count and time span. */
export function horizonsTableMeta(): {
  n: number;
  t0: number;
  t1: number;
  source: string;
} {
  return {
    n: samples.length,
    t0: samples[0]?.dtS ?? 0,
    t1: samples[samples.length - 1]?.dtS ?? 0,
    source: horizonsSource(),
  };
}

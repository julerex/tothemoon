/**
 * Interpolated JPL Horizons sample tables (DE441).
 *
 * Lunar window: `horizons-epoch.json` (`npm run horizons`) — τ = 0 at
 * 2027-07-20 landing. Flight 13: `horizons-flight13-epoch.json`
 * (`npm run horizons:flight13`) — τ = 0 at the flown liftoff.
 *
 * Pure: no module mutable state — table pick comes from the epoch clock map.
 */
import lunarPackJson from "../data/horizons-epoch.json";
import flight13PackJson from "../data/horizons-flight13-epoch.json";
import type { V3 } from "./vec3";

export type HorizonsSample = {
  /** Seconds from the table τ = 0 epoch. */
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

const lunarPack = lunarPackJson as HorizonsPack;
const flight13Pack = flight13PackJson as HorizonsPack;
const lunarSamples = lunarPack.samples;
const flight13Samples = flight13Pack.samples;

/** True when the July 2027 lunar Horizons table can interpolate. */
export function hasHorizonsTable(): boolean {
  return lunarSamples.length >= 2;
}

/** True when the Flight 13 launch-window Horizons table can interpolate. */
export function hasFlight13HorizonsTable(): boolean {
  return flight13Samples.length >= 2;
}

/**
 * @deprecated Prefer {@link hasHorizonsTable} + `epoch.useHorizons`.
 * Kept as alias for callers that only care whether a table exists.
 */
export function hasHorizonsEpoch(): boolean {
  return hasHorizonsTable();
}

export function horizonsSource(): string {
  return lunarPack.source ?? "JPL Horizons";
}

export function horizonsLandingUtc(): string {
  return lunarPack.landingUtc;
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

function horizonsBracket(
  samples: HorizonsSample[],
  τ: number,
): { a: HorizonsSample; b: HorizonsSample; u: number } {
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.dtS <= τ) lo = mid; else hi = mid;
  }
  const a = samples[lo]!, b = samples[hi]!;
  return { a, b, u: (τ - a.dtS) / (b.dtS - a.dtS || 1) };
}

function interpolateTable(
  samples: HorizonsSample[],
  τ: number,
  earthPos: V3, earthVel: V3, moonRelPos: V3, moonRelVel: V3,
): boolean {
  if (samples.length < 2) return false;
  if (τ < samples[0]!.dtS || τ > samples[samples.length - 1]!.dtS) return false;
  const { a, b, u } = horizonsBracket(samples, τ);
  lerp6(a.earth, b.earth, u, earthPos, earthVel);
  lerp6(a.moonRel, b.moonRel, u, moonRelPos, moonRelVel);
  return true;
}

/**
 * Interpolate Earth (heliocentric) and Moon (geocentric) at mission time t.
 * Lunar table: τ = t − horizonsLandingT. Flight 13 (clockUtcMsAtT0 set): τ = t
 * from liftoff. Returns false if τ is outside the table (analytic fallback).
 */
export function interpolateHorizons(
  missionT: number,
  epoch: { horizonsLandingT: number; clockUtcMsAtT0: number | null },
  earthPos: V3, earthVel: V3, moonRelPos: V3, moonRelVel: V3,
): boolean {
  if (epoch.clockUtcMsAtT0 != null) {
    return interpolateTable(flight13Samples, missionT, earthPos, earthVel, moonRelPos, moonRelVel);
  }
  return interpolateTable(
    lunarSamples, missionT - epoch.horizonsLandingT,
    earthPos, earthVel, moonRelPos, moonRelVel,
  );
}

/** Diagnostics / tests: sample count and time span (lunar table). */
export function horizonsTableMeta(): {
  n: number;
  t0: number;
  t1: number;
  source: string;
} {
  return {
    n: lunarSamples.length,
    t0: lunarSamples[0]?.dtS ?? 0,
    t1: lunarSamples[lunarSamples.length - 1]?.dtS ?? 0,
    source: horizonsSource(),
  };
}

/**
 * Kepler-vs-n-body coast corridor.
 *
 * After translunar injection the craft coasts under restricted n-body gravity. The osculating
 * 2-body ellipse at inject is a theater reference — this module samples that
 * path, measures max |Δr| vs the baked n-body trail, and supplies polyline
 * points for a low-opacity scene ribbon.
 *
 * Pure + scrub-free. Scene unit = km.
 */

import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import { MU_EARTH } from "./constants";
import { keplerRvAt, rvToKepler, type KeplerOrbit } from "./kepler";
import type { Sample } from "./missionTypes";
import { type V3, v3 } from "./vec3";

const _relP = v3();
const _relV = v3();

export type CoastCorridor = {
  /** Heliocentric n-body coast points (thinned) */
  nbodyPts: V3[];
  /** Matching heliocentric Kepler reference points */
  keplerPts: V3[];
  /** Peak |r_nbody − r_kepler| over the corridor (km) */
  maxDevKm: number;
  /** Coast window start / end (mission s) */
  t0: number;
  t1: number;
};

const COAST_PHASES = new Set([
  "coast", "impact", "approach", "braking", "descent", "landed", "entry", "splashdown",
]);

/** Coast / impact phases after translunar injection. */
function isCoastPhase(phase: string): boolean {
  return COAST_PHASES.has(phase);
}

/**
 * Inject sample for the Kepler reference: last translunar injection sample if present,
 * otherwise first coast sample (already post-inject).
 */
export function findTranslunarInjectionInjectSample(samples: Sample[]): Sample | null {
  let lastTli: Sample | null = null;
  for (const s of samples) {
    if (s.phase === "translunarInjection") lastTli = s;
  }
  if (lastTli) return lastTli;
  for (const s of samples) {
    if (isCoastPhase(s.phase)) return s;
  }
  return null;
}

/** Osculating Earth-centered Kepler orbit at a sample (heliocentric r,v). */
export function orbitFromSample(
  s: Sample,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): KeplerOrbit {
  const b = bodyPositions(s.t, epoch);
  _relP.x = s.pos.x - b.earth.x;
  _relP.y = s.pos.y - b.earth.y;
  _relP.z = s.pos.z - b.earth.z;
  _relV.x = s.vel.x - b.earthVel.x;
  _relV.y = s.vel.y - b.earthVel.y;
  _relV.z = s.vel.z - b.earthVel.z;
  return rvToKepler(_relP, _relV, MU_EARTH, s.t);
}

/** Heliocentric position of the Kepler reference at mission time t. */
export function keplerHeliocentricAt(
  orb: KeplerOrbit,
  t: number,
  out: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t, epoch);
  out.x = b.earth.x + _relP.x;
  out.y = b.earth.y + _relP.y;
  out.z = b.earth.z + _relP.z;
  return out;
}

function collectCoastSamples(samples: Sample[]): Sample[] {
  const coast: Sample[] = [];
  let seenCoast = false;
  for (const s of samples) {
    if (isCoastPhase(s.phase)) {
      seenCoast = true;
      coast.push(s);
    } else if (seenCoast) break;
  }
  return coast;
}

function orbitOk(orb: KeplerOrbit): boolean {
  return orb.a > 0 && Number.isFinite(orb.a) && orb.e < 1;
}

function resolveCorridorOrbit(
  inject: Sample, coast: Sample[], epoch: EphemerisEpoch,
): KeplerOrbit | null {
  try {
    let orb = orbitFromSample(inject, epoch);
    if (!orbitOk(orb)) orb = orbitFromSample(coast[0]!, epoch);
    return orbitOk(orb) ? orb : null;
  } catch {
    return null;
  }
}

function pushCorridorPair(
  s: Sample, orb: KeplerOrbit, kPos: V3, epoch: EphemerisEpoch,
  nbodyPts: V3[], keplerPts: V3[],
): number {
  nbodyPts.push({ x: s.pos.x, y: s.pos.y, z: s.pos.z });
  keplerHeliocentricAt(orb, s.t, kPos, epoch);
  keplerPts.push({ x: kPos.x, y: kPos.y, z: kPos.z });
  return Math.hypot(s.pos.x - kPos.x, s.pos.y - kPos.y, s.pos.z - kPos.z);
}

function thinCorridorPts(
  coast: Sample[], orb: KeplerOrbit, maxPts: number, epoch: EphemerisEpoch,
): { nbodyPts: V3[]; keplerPts: V3[]; maxDevKm: number } {
  const n = Math.min(maxPts, coast.length); const step = (coast.length - 1) / Math.max(1, n - 1);
  const nbodyPts: V3[] = [], keplerPts: V3[] = [], kPos = v3();
  let maxDevKm = 0;
  for (let i = 0; i < n; i++) {
    const s = coast[Math.min(coast.length - 1, Math.round(i * step))]!;
    const d = pushCorridorPair(s, orb, kPos, epoch, nbodyPts, keplerPts);
    if (Number.isFinite(d) && d > maxDevKm) maxDevKm = d;
  }
  return { nbodyPts, keplerPts, maxDevKm };
}

/**
 * Build a thinned Kepler-vs-n-body corridor along the post-Translunar injection coast.
 * Returns null when the pack has no coast samples or inject state.
 */
export function buildCoastCorridor(
  samples: Sample[],
  maxPts = 480,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): CoastCorridor | null {
  const inject = findTranslunarInjectionInjectSample(samples);
  if (!inject) return null;
  const coast = collectCoastSamples(samples);
  if (coast.length < 2) return null;
  const orb = resolveCorridorOrbit(inject, coast, epoch);
  if (!orb) return null;
  const pts = thinCorridorPts(coast, orb, maxPts, epoch);
  return { ...pts, t0: coast[0]!.t, t1: coast[coast.length - 1]!.t };
}

/**
 * Max |Δr| between n-body coast samples and the inject osculating ellipse.
 * Used at bake and as a pack-meta fallback.
 */
export function computeKeplerRefMaxDevKm(
  samples: Sample[],
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  const c = buildCoastCorridor(samples, 800, epoch);
  return c?.maxDevKm ?? 0;
}

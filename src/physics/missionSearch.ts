/**
 * Transfer search: epoch / Moon-phase / Translunar injection Δv grid for a close ballistic pass.
 *
 * Pure scoring + search over probes; low Earth orbit template is rebuilt when epoch/phase
 * changes so scores match the path {@link flyMission} will bake.
 */

import {
  A_EM,
  LOW_EARTH_ORBIT_RADIUS,
  N_MOON,
  R_MOON,
  MOON_SPHERE_OF_INFLUENCE_KM,
} from "./constants";
import type { AscentResult } from "./ascent";
import type { AscentCache } from "./ascentCache";
import { probePerilune } from "./ballisticCoast";
import { starbaseSunElev } from "./earthFrame";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { hasHorizonsTable } from "./horizonsEpoch";
import {
  computeLowEarthOrbitRelative,
  type LowEarthOrbitRelative,
} from "./lowEarthOrbitCoast";
import { makeLunarEpoch } from "./missionEpoch";
import {
  apogeeFromTranslunarInjectionDeltaV,
  maxTranslunarInjectionDeltaV,
} from "./translunarInjection";

export type TransferSearchResult = {
  bestPhase: number;
  bestDv: number;
  bestLandingT: number;
  bestAlt: number;
  bestPeriluneT: number;
  bestREarth: number;
  found: boolean;
};

const INTERCEPT_ALT = 80_000;
const IDEAL_PERILUNE = 8_000;
/**
 * Hot free-coast meets the Moon on the *outbound* leg near lunar distance
 * (~3 d), not at design apogee time of flight (~T). Prefer that window so the craft
 * crosses the lunar sphere of influence when it flies past the Moon’s orbit.
 */
const IDEAL_TOA = 72 * 3600;
const TOA_MIN = 48 * 3600;
const TOA_MAX = 120 * 3600;
/** Lunar altitude at the sphere of influence shell (theater overlay). */
const MOON_SPHERE_OF_INFLUENCE_ALTITUDE = MOON_SPHERE_OF_INFLUENCE_KM - R_MOON;

/**
 * Prefer a daytime Starbase liftoff under Greenwich-mean-sidereal-time-locked spin.
 * Soft: does not override a clearly better perilune; hard: rejects night.
 */
function launchDayPenalty(epoch: EphemerisEpoch): number {
  const elev = starbaseSunElev(0, epoch);
  if (elev < 0) return 12_000 + (-elev) * 8_000;
  if (elev < 0.2) return 4_000 * ((0.2 - elev) / 0.2);
  if (elev < 0.35) return 400 * ((0.35 - elev) / 0.35);
  return 0;
}

/** Altitude term of perilune score. */
function periluneAltTerm(alt: number): number {
  if (alt < 0) return 100;
  return (
    Math.abs(alt - IDEAL_PERILUNE) +
    (alt > INTERCEPT_ALT ? (alt - INTERCEPT_ALT) * 10 : 0) +
    (alt > 150_000 ? (alt - 150_000) * 8 : 0)
  );
}

/** Time-of-arrival window penalty. */
function periluneWindowPen(periluneT: number): number {
  if (periluneT < TOA_MIN) return ((TOA_MIN - periluneT) / 3600) ** 2 * 40;
  if (periluneT > TOA_MAX) return ((periluneT - TOA_MAX) / 3600) ** 2 * 40;
  return 0;
}

/** Reward / penalty for sphere-of-influence altitude. */
function sphereOfInfluenceTerm(alt: number): number {
  if (alt < MOON_SPHERE_OF_INFLUENCE_ALTITUDE) return -80_000;
  return (alt - MOON_SPHERE_OF_INFLUENCE_ALTITUDE) * 1.5;
}

function nearLunarTerm(rEarth: number): number {
  if (rEarth > A_EM * 0.75 && rEarth < A_EM * 1.2) return 0;
  return ((rEarth - A_EM) / 1000) ** 2 * 50;
}

function periluneScore(
  alt: number,
  periluneT: number,
  rEarth: number,
): number {
  if (!Number.isFinite(alt) || alt > 400_000) return 1e12;
  if (rEarth < A_EM * 0.5 && alt > 50_000) return 1e12;
  const dtH = (periluneT - IDEAL_TOA) / 3600;
  const rErr = Math.abs(rEarth - A_EM) / 1000;
  return (
    periluneAltTerm(alt) + dtH * dtH * 12 + rErr * rErr * 25 +
    periluneWindowPen(periluneT) + nearLunarTerm(rEarth) + sphereOfInfluenceTerm(alt)
  );
}

type CandidateEval = { sc: number; alt: number; t: number; rE: number };

type SearchBest = {
  bestPhase: number;
  bestDv: number;
  bestAlt: number;
  bestPeriluneT: number;
  bestREarth: number;
  bestScore: number;
  bestLandingT: number;
};

/** Apply a candidate eval if it improves the best score. */
function considerEval(
  best: SearchBest,
  ev: CandidateEval,
  ph: number,
  dv: number,
  landT: number,
): void {
  if (!(ev.sc < best.bestScore)) return;
  best.bestScore = ev.sc;
  best.bestAlt = ev.alt;
  best.bestPeriluneT = ev.t;
  best.bestREarth = ev.rE;
  best.bestPhase = ph;
  best.bestDv = dv;
  best.bestLandingT = landT;
}

/** Apply eval only when score improves by more than 1e-6 (refine steps). */
function considerEvalStrict(
  best: SearchBest,
  ev: CandidateEval,
  ph: number,
  dv: number,
  landT: number,
): boolean {
  if (!(ev.sc < best.bestScore - 1e-6)) return false;
  best.bestScore = ev.sc; best.bestAlt = ev.alt;
  best.bestPeriluneT = ev.t;
  best.bestREarth = ev.rE;
  best.bestPhase = ph;
  best.bestDv = dv;
  best.bestLandingT = landT;
  return true;
}

type SearchCtx = {
  useHorizons: boolean;
  baseDv: number;
  dvMax: number;
  T: number;
  lowEarthOrbitRelative: { current: LowEarthOrbitRelative | null };
  epoch: EphemerisEpoch;
  ascentCache: AscentCache;
  /** Ascent the low Earth orbit template is currently built on. */
  ascent: AscentResult;
};

/** Rebuild ascent + LEO template under epoch. */
function rebuildLeo(ctx: SearchCtx, epoch: EphemerisEpoch): void {
  ctx.epoch = epoch;
  ctx.ascent = ctx.ascentCache.ensure(epoch);
  ctx.lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(ctx.ascent, epoch);
}

/** Score a (Δv, moon-phase) pair; optionally rebuild LEO. */
function evalCandidate(
  ctx: SearchCtx,
  dv: number,
  ph: number,
  landT: number,
  reAscent: boolean,
): CandidateEval {
  ctx.epoch = makeLunarEpoch(ph, landT, ctx.useHorizons);
  if (reAscent) ctx.ascent = ctx.ascentCache.ensure(ctx.epoch);
  ctx.lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(ctx.ascent, ctx.epoch);
  const pr = probePerilune(dv, ctx.lowEarthOrbitRelative.current, ctx.epoch);
  return { sc: periluneScore(pr.minAlt, pr.periluneT, pr.rEarth) + launchDayPenalty(ctx.epoch), alt: pr.minAlt, t: pr.periluneT, rE: pr.rEarth };
}

function rangeOffsets(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i * step);
  return out;
}

/** Build phase / epoch / Δv grids for the coarse pass. */
function buildSearchGrids(
  useHorizons: boolean,
  baseDv: number,
  dvMax: number,
): { phaseOffsets: number[]; epochOffsetsS: number[]; dvScales: number[] } {
  return { phaseOffsets: useHorizons ? [0] : rangeOffsets(-80, 80, 0.03), epochOffsetsS: useHorizons ? rangeOffsets(-20, 20, 12 * 3600) : [0], dvScales: [1.0, 1.015, 1.03, 1.045, 1.06].filter((s) => baseDv * s <= dvMax + 1e-9) };
}

function coarseAtLandOff(
  ctx: SearchCtx, best: SearchBest, grids: ReturnType<typeof buildSearchGrids>,
  guess: number, landOff: number,
): void {
  if (ctx.useHorizons) rebuildLeo(ctx, makeLunarEpoch(0, ctx.T + landOff, true));
  for (const dS of grids.dvScales) {
    const dv = Math.min(ctx.baseDv * dS, ctx.dvMax);
    for (const off of grids.phaseOffsets) {
      const ph = ctx.useHorizons ? 0 : guess + off;
      const landT = ctx.T + landOff;
      considerEval(best, evalCandidate(ctx, dv, ph, landT, false), ph, dv, landT);
    }
  }
}

/** Coarse grid over epoch × Δv × phase. */
function runCoarseGrid(
  ctx: SearchCtx,
  best: SearchBest,
  grids: ReturnType<typeof buildSearchGrids>,
  guess: number,
): void {
  for (const landOff of grids.epochOffsetsS) coarseAtLandOff(ctx, best, grids, guess, landOff);
  if (ctx.useHorizons) ctx.epoch = makeLunarEpoch(0, best.bestLandingT, true);
}

function mediumAtLandT(ctx: SearchCtx, best: SearchBest, seedDv: number, landT: number): void {
  rebuildLeo(ctx, makeLunarEpoch(0, landT, true));
  for (const s of [0, -0.012, 0.012, -0.024, 0.024]) {
    const dv = Math.min(ctx.dvMax, Math.max(ctx.baseDv * 0.999, seedDv + s));
    considerEval(best, evalCandidate(ctx, dv, 0, landT, false), 0, dv, landT);
  }
}

/** Medium refine under Horizons: ±48 h epoch × small Δv. */
function mediumPassHorizons(ctx: SearchCtx, best: SearchBest): void {
  const seedDv = best.bestDv;
  const seedLand = best.bestLandingT;
  best.bestScore = Infinity;
  for (let i = -12; i <= 12; i++) mediumAtLandT(ctx, best, seedDv, seedLand + i * 4 * 3600);
  ctx.epoch = makeLunarEpoch(0, best.bestLandingT, true);
}

/** One analytic medium-pass phase sample over Δv offsets. */
function mediumAnalyticAtPhase(ctx: SearchCtx, best: SearchBest, ph: number, seedDv: number): void {
  rebuildLeo(ctx, makeLunarEpoch(ph, ctx.T, false));
  for (const s of [0, -0.012, 0.012]) {
    const dv = Math.min(ctx.dvMax, Math.max(ctx.baseDv * 0.999, seedDv + s));
    considerEval(best, evalCandidate(ctx, dv, ph, ctx.T, false), ph, dv, ctx.T);
  }
}

/** Medium refine under analytic Moon phase. */
function mediumPassAnalytic(ctx: SearchCtx, best: SearchBest): void {
  const seedPhase = best.bestPhase;
  const seedDv = best.bestDv;
  best.bestScore = Infinity;
  for (let i = -20; i <= 20; i++) mediumAnalyticAtPhase(ctx, best, seedPhase + i * 0.05, seedDv);
}

/** One coordinate-descent iteration: epoch/phase then Δv. */
function refineIteration(ctx: SearchCtx, best: SearchBest, iter: number): boolean {
  let improved = false;
  if (ctx.useHorizons) {
    improved = refineLandingT(ctx, best, iter) || improved;
  } else {
    improved = refinePhase(ctx, best, iter) || improved;
  }
  improved = refineDv(ctx, best, iter) || improved;
  return improved;
}

/** Coordinate descent on landing map (Horizons). */
function refineLandingT(ctx: SearchCtx, best: SearchBest, iter: number): boolean {
  let improved = false; const dT = (3 * 3600) / (1 + iter);
  for (const s of [-2, -1, 1, 2]) {
    const landT = best.bestLandingT + s * dT;
    rebuildLeo(ctx, makeLunarEpoch(0, landT, true));
    const ev = evalCandidate(ctx, best.bestDv, 0, landT, false);
    if (considerEvalStrict(best, ev, 0, best.bestDv, landT)) improved = true;
  }
  rebuildLeo(ctx, makeLunarEpoch(0, best.bestLandingT, true));
  return improved;
}

/** Coordinate descent on Moon phase (analytic). */
function refinePhase(ctx: SearchCtx, best: SearchBest, iter: number): boolean {
  let improved = false;
  const dPh = 0.02 / (1 + iter);
  for (const s of [-2, -1, 1, 2]) {
    const ph = best.bestPhase + s * dPh;
    const ev = evalCandidate(ctx, best.bestDv, ph, ctx.T, true);
    if (considerEvalStrict(best, ev, ph, best.bestDv, best.bestLandingT)) improved = true;
  }
  return improved;
}

/** Coordinate descent on Δv. */
function refineDv(ctx: SearchCtx, best: SearchBest, iter: number): boolean {
  let improved = false;
  const dDv = 0.008 / (1 + iter);
  for (const s of [-2, -1, 1, 2]) {
    const dv = Math.min(ctx.dvMax, Math.max(ctx.baseDv * 0.999, best.bestDv + s * dDv));
    const ev = evalCandidate(ctx, dv, best.bestPhase, best.bestLandingT, true);
    if (considerEvalStrict(best, ev, best.bestPhase, dv, best.bestLandingT)) improved = true;
  }
  return improved;
}

/** Log search summary. */
function logSearchResult(best: SearchBest, baseDv: number, found: boolean): void {
  const raDes = apogeeFromTranslunarInjectionDeltaV(LOW_EARTH_ORBIT_RADIUS, best.bestDv); const raLabel = Number.isFinite(raDes) ? (raDes / A_EM).toFixed(3) : "∞";
  console.info(
    `[tothemoon] Ballistic 4-body probe minMoonAlt=${best.bestAlt.toFixed(0)} km @${(best.bestPeriluneT / 3600).toFixed(1)}h ` +
      `rEarth=${(best.bestREarth / A_EM).toFixed(3)}×A_EM phase=${best.bestPhase.toFixed(3)} ` +
      `landT=${(best.bestLandingT / 3600).toFixed(1)}h ` +
      `dv=${best.bestDv.toFixed(4)} (Hohmann=${baseDv.toFixed(4)}) · ra_des≈${raLabel}×A_EM · ` +
      `${found ? "close-pass" : "best-effort"}`,
  );
}

function emptySearchBest(guess: number, baseDv: number, T: number): SearchBest {
  return { bestPhase: guess, bestDv: baseDv, bestAlt: Infinity, bestPeriluneT: T, bestREarth: Infinity, bestScore: Infinity, bestLandingT: T };
}

/**
 * Search epoch / phase / Δv for the best ballistic perilune.
 * Rebuilds ascent + low Earth orbit under explicit {@link EphemerisEpoch} candidates.
 * Updates `lowEarthOrbitRelative.current` whenever low Earth orbit is rebuilt.
 */
function initSearch(opts: SearchOpts): {
  ctx: SearchCtx; best: SearchBest; grids: ReturnType<typeof buildSearchGrids>; guess: number;
} {
  const { baseDv, designTof: T, tTli0, lowEarthOrbitRelative, ascentCache, ascent } = opts;
  const useHorizons = hasHorizonsTable(); const dvMax = maxTranslunarInjectionDeltaV();
  const guess = Math.PI - N_MOON * (72 * 3600 + tTli0);
  const ctx: SearchCtx = {
    useHorizons, baseDv, dvMax, T, lowEarthOrbitRelative, ascentCache, ascent,
    epoch: makeLunarEpoch(useHorizons ? 0 : guess, T, useHorizons),
  };
  return { ctx, best: emptySearchBest(guess, baseDv, T), grids: buildSearchGrids(useHorizons, baseDv, dvMax), guess };
}

function toSearchResult(best: SearchBest, found: boolean): TransferSearchResult {
  return { bestPhase: best.bestPhase, bestDv: best.bestDv, bestLandingT: best.bestLandingT, bestAlt: best.bestAlt, bestPeriluneT: best.bestPeriluneT, bestREarth: best.bestREarth, found };
}

export type SearchOpts = {
  baseDv: number;
  designTof: number;
  tTli0: number;
  lowEarthOrbitRelative: { current: LowEarthOrbitRelative | null };
  /** Ascent memo reused across candidate epochs. */
  ascentCache: AscentCache;
  /** Ascent `lowEarthOrbitRelative` was seeded from. */
  ascent: AscentResult;
};

export function searchBallisticTransfer(opts: SearchOpts): TransferSearchResult {
  const { ctx, best, grids, guess } = initSearch(opts);
  runCoarseGrid(ctx, best, grids, guess);
  if (ctx.useHorizons) mediumPassHorizons(ctx, best);
  else mediumPassAnalytic(ctx, best);
  for (let iter = 0; iter < 8; iter++) {
    if (!refineIteration(ctx, best, iter)) break;
  }
  const found = best.bestAlt < INTERCEPT_ALT; logSearchResult(best, ctx.baseDv, found);
  return toSearchResult(best, found);
}

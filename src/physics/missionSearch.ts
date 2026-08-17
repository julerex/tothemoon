/**
 * Transfer search: epoch / Moon-phase / Translunar injection Δv for a design
 * ballistic perilune (B-plane + LOI-class altitude), not a closest-approach
 * anywhere score.
 *
 * Pure scoring + search over probes; low Earth orbit template is rebuilt when
 * epoch/phase changes so scores match the path {@link flyMission} will bake.
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
import { probePerilune, type ProbeResult } from "./ballisticCoast";
import { DESIGN_PERILUNE_ALT_KM, bPlaneFromMoonRel, periluneTargetScore } from "./bplane";
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

/** Time-of-arrival window penalty. */
function periluneWindowPen(periluneT: number): number {
  if (periluneT < TOA_MIN) return ((TOA_MIN - periluneT) / 3600) ** 2 * 40;
  if (periluneT > TOA_MAX) return ((TOA_MAX - periluneT) / 3600) ** 2 * 40;
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

/**
 * Combined ballistic score: design perilune + south-pole B-plane, plus the
 * existing TOA / SOI / Earth-radius window so the search still meets the Moon
 * on the outbound leg.
 */
export function scoreBallisticPerilune(pr: ProbeResult): number {
  if (!Number.isFinite(pr.minAlt) || pr.minAlt > 400_000) return 1e12;
  if (pr.rEarth < A_EM * 0.5 && pr.minAlt > 50_000) return 1e12;
  const plane = bPlaneFromMoonRel(pr.periRel, pr.periVel);
  const dtH = (pr.periluneT - IDEAL_TOA) / 3600;
  const rErr = Math.abs(pr.rEarth - A_EM) / 1000;
  return (
    periluneTargetScore(pr.minAlt, plane) +
    dtH * dtH * 12 +
    rErr * rErr * 25 +
    periluneWindowPen(pr.periluneT) +
    nearLunarTerm(pr.rEarth) +
    sphereOfInfluenceTerm(pr.minAlt)
  );
}

type CandidateEval = { sc: number; alt: number; t: number; rE: number };

type SearchBest = Readonly<{
  bestPhase: number;
  bestDv: number;
  bestAlt: number;
  bestPeriluneT: number;
  bestREarth: number;
  bestScore: number;
  bestLandingT: number;
}>;

/** Coordinate-descent result: the surviving best plus whether it moved. */
type RefineStep = Readonly<{ best: SearchBest; improved: boolean }>;

/** Offsets probed on each coordinate-descent axis, in step multiples. */
const REFINE_OFFSETS: readonly number[] = [-2, -1, 1, 2];

/** Score improvement a refine step must beat to count as progress. */
const REFINE_MARGIN = 1e-6;

/** The winning candidate as a new best record (pure). */
function withCandidate(
  ev: CandidateEval,
  ph: number,
  dv: number,
  landT: number,
): SearchBest {
  return {
    bestScore: ev.sc,
    bestAlt: ev.alt,
    bestPeriluneT: ev.t,
    bestREarth: ev.rE,
    bestPhase: ph,
    bestDv: dv,
    bestLandingT: landT,
  };
}

/**
 * Keep whichever of `best` / the candidate scores lower.
 *
 * `margin` is the improvement a candidate must beat: 0 for the coarse passes,
 * 1e-6 in coordinate descent so numerically identical scores do not read as
 * progress and keep the refine loop spinning.
 */
function betterCandidate(
  best: SearchBest,
  ev: CandidateEval,
  ph: number,
  dv: number,
  landT: number,
  margin = 0,
): SearchBest {
  if (!(ev.sc < best.bestScore - margin)) return best;
  return withCandidate(ev, ph, dv, landT);
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
  return { sc: scoreBallisticPerilune(pr) + launchDayPenalty(ctx.epoch), alt: pr.minAlt, t: pr.periluneT, rE: pr.rEarth };
}

/** `[lo·step … hi·step]` inclusive, one entry per integer index. */
function rangeOffsets(lo: number, hi: number, step: number): number[] {
  return Array.from({ length: hi - lo + 1 }, (_unused, i) => (lo + i) * step);
}

/** Build phase / epoch / Δv grids for the coarse pass. */
function buildSearchGrids(
  useHorizons: boolean,
  baseDv: number,
  dvMax: number,
): { phaseOffsets: number[]; epochOffsetsS: number[]; dvScales: number[] } {
  return { phaseOffsets: useHorizons ? [0] : rangeOffsets(-80, 80, 0.03), epochOffsetsS: useHorizons ? rangeOffsets(-20, 20, 12 * 3600) : [0], dvScales: [1.0, 1.015, 1.03, 1.045, 1.06].filter((s) => baseDv * s <= dvMax + 1e-9) };
}

/** Δv floor: never trim below (almost) the Hohmann baseline. */
function clampDv(ctx: SearchCtx, dv: number): number {
  return Math.min(ctx.dvMax, Math.max(ctx.baseDv * 0.999, dv));
}

function coarseAtLandOff(
  ctx: SearchCtx, best: SearchBest, grids: ReturnType<typeof buildSearchGrids>,
  guess: number, landOff: number,
): SearchBest {
  if (ctx.useHorizons) rebuildLeo(ctx, makeLunarEpoch(0, ctx.T + landOff, true));
  const landT = ctx.T + landOff;
  return grids.dvScales.reduce((atScale, dS) => {
    const dv = Math.min(ctx.baseDv * dS, ctx.dvMax);
    return grids.phaseOffsets.reduce((atPhase, off) => {
      const ph = ctx.useHorizons ? 0 : guess + off;
      return betterCandidate(atPhase, evalCandidate(ctx, dv, ph, landT, false), ph, dv, landT);
    }, atScale);
  }, best);
}

/** Coarse grid over epoch × Δv × phase. */
function runCoarseGrid(
  ctx: SearchCtx,
  best: SearchBest,
  grids: ReturnType<typeof buildSearchGrids>,
  guess: number,
): SearchBest {
  const coarse = grids.epochOffsetsS.reduce(
    (acc, landOff) => coarseAtLandOff(ctx, acc, grids, guess, landOff),
    best,
  );
  if (ctx.useHorizons) ctx.epoch = makeLunarEpoch(0, coarse.bestLandingT, true);
  return coarse;
}

/** Δv offsets probed around the seed in the medium passes. */
const MEDIUM_DV_OFFSETS_HORIZONS: readonly number[] = [0, -0.012, 0.012, -0.024, 0.024];
const MEDIUM_DV_OFFSETS_ANALYTIC: readonly number[] = [0, -0.012, 0.012];

function mediumAtLandT(
  ctx: SearchCtx, best: SearchBest, seedDv: number, landT: number,
): SearchBest {
  rebuildLeo(ctx, makeLunarEpoch(0, landT, true));
  return MEDIUM_DV_OFFSETS_HORIZONS.reduce((acc, s) => {
    const dv = clampDv(ctx, seedDv + s);
    return betterCandidate(acc, evalCandidate(ctx, dv, 0, landT, false), 0, dv, landT);
  }, best);
}

/**
 * Medium refine under Horizons: ±48 h epoch × small Δv.
 * Score resets so the pass re-picks against the rebuilt low Earth orbit template.
 */
function mediumPassHorizons(ctx: SearchCtx, best: SearchBest): SearchBest {
  const seedDv = best.bestDv;
  const seedLand = best.bestLandingT;
  const refined = rangeOffsets(-12, 12, 4 * 3600).reduce(
    (acc, landOff) => mediumAtLandT(ctx, acc, seedDv, seedLand + landOff),
    { ...best, bestScore: Infinity },
  );
  ctx.epoch = makeLunarEpoch(0, refined.bestLandingT, true);
  return refined;
}

/** One analytic medium-pass phase sample over Δv offsets. */
function mediumAnalyticAtPhase(
  ctx: SearchCtx, best: SearchBest, ph: number, seedDv: number,
): SearchBest {
  rebuildLeo(ctx, makeLunarEpoch(ph, ctx.T, false));
  return MEDIUM_DV_OFFSETS_ANALYTIC.reduce((acc, s) => {
    const dv = clampDv(ctx, seedDv + s);
    return betterCandidate(acc, evalCandidate(ctx, dv, ph, ctx.T, false), ph, dv, ctx.T);
  }, best);
}

/** Medium refine under analytic Moon phase. */
function mediumPassAnalytic(ctx: SearchCtx, best: SearchBest): SearchBest {
  const seedPhase = best.bestPhase;
  const seedDv = best.bestDv;
  return rangeOffsets(-20, 20, 0.05).reduce(
    (acc, off) => mediumAnalyticAtPhase(ctx, acc, seedPhase + off, seedDv),
    { ...best, bestScore: Infinity },
  );
}

/** Fold one probed axis offset into the running best, tracking progress. */
function refineFold(
  step: RefineStep,
  ev: CandidateEval,
  ph: number,
  dv: number,
  landT: number,
): RefineStep {
  const next = betterCandidate(step.best, ev, ph, dv, landT, REFINE_MARGIN);
  return { best: next, improved: step.improved || next !== step.best };
}

/** Coordinate descent on landing map (Horizons). */
function refineLandingT(ctx: SearchCtx, best: SearchBest, iter: number): RefineStep {
  const dT = (3 * 3600) / (1 + iter);
  const step = REFINE_OFFSETS.reduce<RefineStep>((acc, s) => {
    const landT = acc.best.bestLandingT + s * dT;
    rebuildLeo(ctx, makeLunarEpoch(0, landT, true));
    const ev = evalCandidate(ctx, acc.best.bestDv, 0, landT, false);
    return refineFold(acc, ev, 0, acc.best.bestDv, landT);
  }, { best, improved: false });
  rebuildLeo(ctx, makeLunarEpoch(0, step.best.bestLandingT, true));
  return step;
}

/** Coordinate descent on Moon phase (analytic). */
function refinePhase(ctx: SearchCtx, best: SearchBest, iter: number): RefineStep {
  const dPh = 0.02 / (1 + iter);
  return REFINE_OFFSETS.reduce<RefineStep>((acc, s) => {
    const ph = acc.best.bestPhase + s * dPh;
    const ev = evalCandidate(ctx, acc.best.bestDv, ph, ctx.T, true);
    return refineFold(acc, ev, ph, acc.best.bestDv, acc.best.bestLandingT);
  }, { best, improved: false });
}

/** Coordinate descent on Δv. */
function refineDv(ctx: SearchCtx, best: SearchBest, iter: number): RefineStep {
  const dDv = 0.008 / (1 + iter);
  return REFINE_OFFSETS.reduce<RefineStep>((acc, s) => {
    const dv = clampDv(ctx, acc.best.bestDv + s * dDv);
    const ev = evalCandidate(ctx, dv, acc.best.bestPhase, acc.best.bestLandingT, true);
    return refineFold(acc, ev, acc.best.bestPhase, dv, acc.best.bestLandingT);
  }, { best, improved: false });
}

/** One coordinate-descent iteration: epoch/phase then Δv. */
function refineIteration(ctx: SearchCtx, best: SearchBest, iter: number): RefineStep {
  const axis = ctx.useHorizons
    ? refineLandingT(ctx, best, iter)
    : refinePhase(ctx, best, iter);
  const dv = refineDv(ctx, axis.best, iter);
  return { best: dv.best, improved: axis.improved || dv.improved };
}

/**
 * Golden-section polish on TLI Δv around the coordinate-descent seed.
 * 1-D only — epoch / phase stay fixed so the last pass is a true Δv converge.
 */
const GOLDEN = 0.5 * (3 - Math.sqrt(5));
const GOLDEN_DV_SPAN = 0.04;
const GOLDEN_EVALS = 10;

function refineDvGolden(ctx: SearchCtx, best: SearchBest): SearchBest {
  let lo = clampDv(ctx, best.bestDv - GOLDEN_DV_SPAN);
  let hi = clampDv(ctx, best.bestDv + GOLDEN_DV_SPAN);
  if (!(hi > lo + 1e-6)) return best;
  let x1 = lo + GOLDEN * (hi - lo);
  let x2 = hi - GOLDEN * (hi - lo);
  let e1 = evalCandidate(ctx, x1, best.bestPhase, best.bestLandingT, true);
  let e2 = evalCandidate(ctx, x2, best.bestPhase, best.bestLandingT, true);
  let current = betterCandidate(
    betterCandidate(best, e1, best.bestPhase, x1, best.bestLandingT),
    e2, best.bestPhase, x2, best.bestLandingT,
  );
  for (let i = 0; i < GOLDEN_EVALS; i++) {
    if (e1.sc < e2.sc) {
      hi = x2;
      x2 = x1;
      e2 = e1;
      x1 = lo + GOLDEN * (hi - lo);
      e1 = evalCandidate(ctx, x1, best.bestPhase, best.bestLandingT, true);
      current = betterCandidate(current, e1, best.bestPhase, x1, best.bestLandingT);
    } else {
      lo = x1;
      x1 = x2;
      e1 = e2;
      x2 = hi - GOLDEN * (hi - lo);
      e2 = evalCandidate(ctx, x2, best.bestPhase, best.bestLandingT, true);
      current = betterCandidate(current, e2, best.bestPhase, x2, best.bestLandingT);
    }
  }
  return current;
}

/** Log search summary. */
function logSearchResult(best: SearchBest, baseDv: number, found: boolean): void {
  const raDes = apogeeFromTranslunarInjectionDeltaV(LOW_EARTH_ORBIT_RADIUS, best.bestDv); const raLabel = Number.isFinite(raDes) ? (raDes / A_EM).toFixed(3) : "∞";
  console.info(
    `[tothemoon] Ballistic 4-body probe minMoonAlt=${best.bestAlt.toFixed(0)} km ` +
      `(design ${DESIGN_PERILUNE_ALT_KM} km) @${(best.bestPeriluneT / 3600).toFixed(1)}h ` +
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

/** Coordinate-descent iterations before giving up on further improvement. */
const REFINE_ITERATIONS = 8;

/** Descend until an iteration stops improving the score. */
function runRefinement(ctx: SearchCtx, best: SearchBest): SearchBest {
  let current = best;
  for (let iter = 0; iter < REFINE_ITERATIONS; iter++) {
    const step = refineIteration(ctx, current, iter);
    current = step.best;
    if (!step.improved) break;
  }
  return refineDvGolden(ctx, current);
}

export function searchBallisticTransfer(opts: SearchOpts): TransferSearchResult {
  const { ctx, best, grids, guess } = initSearch(opts);
  const coarse = runCoarseGrid(ctx, best, grids, guess);
  const medium = ctx.useHorizons
    ? mediumPassHorizons(ctx, coarse)
    : mediumPassAnalytic(ctx, coarse);
  const refined = runRefinement(ctx, medium);
  const found = refined.bestAlt < INTERCEPT_ALT;
  logSearchResult(refined, ctx.baseDv, found);
  return toSearchResult(refined, found);
}

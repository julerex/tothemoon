/**
 * Transfer search: epoch / Moon-phase / Translunar injection Δv for a B-plane
 * south-pole perilune (theater). Coarse epoch grid, then 1-D golden-section on Δv.
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
import { ensureAscent } from "./ascentCache";
import { bplaneMissNeedsTcm, DESIGN_PERILUNE_ALT_KM } from "./bplane";
import { probePerilune, type ProbeResult } from "./ballisticCoast";
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
  bestBPlaneMissKm: number;
  needsTcm: boolean;
  found: boolean;
};

const INTERCEPT_ALT = 80_000;
const IDEAL_PERILUNE = DESIGN_PERILUNE_ALT_KM;
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

function bplaneMissTerm(pr: ProbeResult): number {
  if (!Number.isFinite(pr.bPlaneMissKm)) return 50_000;
  const southPen = pr.southDot < 0
    ? 20_000 + (-pr.southDot) * 30_000
    : (1 - Math.max(0, pr.southDot)) * 6_000;
  return pr.bPlaneMissKm * 0.12 + southPen;
}

function periluneScore(pr: ProbeResult): number {
  const alt = pr.minAlt;
  const periluneT = pr.periluneT;
  const rEarth = pr.rEarth;
  if (!Number.isFinite(alt) || alt > 400_000) return 1e12;
  if (rEarth < A_EM * 0.5 && alt > 50_000) return 1e12;
  const dtH = (periluneT - IDEAL_TOA) / 3600;
  const rErr = Math.abs(rEarth - A_EM) / 1000;
  return (
    periluneAltTerm(alt) + dtH * dtH * 12 + rErr * rErr * 25 +
    periluneWindowPen(periluneT) + nearLunarTerm(rEarth) + sphereOfInfluenceTerm(alt) +
    bplaneMissTerm(pr)
  );
}

type CandidateEval = {
  sc: number;
  alt: number;
  t: number;
  rE: number;
  bMiss: number;
};

type SearchBest = {
  bestPhase: number;
  bestDv: number;
  bestAlt: number;
  bestPeriluneT: number;
  bestREarth: number;
  bestScore: number;
  bestLandingT: number;
  bestBPlaneMissKm: number;
};

function applyEval(best: SearchBest, ev: CandidateEval, ph: number, dv: number, landT: number): void {
  best.bestScore = ev.sc;
  best.bestAlt = ev.alt;
  best.bestPeriluneT = ev.t;
  best.bestREarth = ev.rE;
  best.bestBPlaneMissKm = ev.bMiss;
  best.bestPhase = ph;
  best.bestDv = dv;
  best.bestLandingT = landT;
}

/** Apply a candidate eval if it improves the best score. */
function considerEval(
  best: SearchBest,
  ev: CandidateEval,
  ph: number,
  dv: number,
  landT: number,
): void {
  if (!(ev.sc < best.bestScore)) return;
  applyEval(best, ev, ph, dv, landT);
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
  applyEval(best, ev, ph, dv, landT);
  return true;
}

type SearchCtx = {
  useHorizons: boolean;
  baseDv: number;
  dvMax: number;
  T: number;
  lowEarthOrbitRelative: { current: LowEarthOrbitRelative | null };
  epoch: EphemerisEpoch;
};

/** Rebuild ascent + LEO template under epoch. */
function rebuildLeo(ctx: SearchCtx, epoch: EphemerisEpoch): void {
  ctx.epoch = epoch;
  ensureAscent(epoch);
  ctx.lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(epoch);
}

function evalFromProbe(pr: ProbeResult, epoch: EphemerisEpoch): CandidateEval {
  return {
    sc: periluneScore(pr) + launchDayPenalty(epoch),
    alt: pr.minAlt,
    t: pr.periluneT,
    rE: pr.rEarth,
    bMiss: pr.bPlaneMissKm,
  };
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
  if (reAscent) ensureAscent(ctx.epoch);
  ctx.lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(ctx.epoch);
  return evalFromProbe(probePerilune(dv, ctx.lowEarthOrbitRelative.current, ctx.epoch), ctx.epoch);
}

/** Δv-only probe at the current epoch / LEO template (no rebuild). */
function evalDvOnly(ctx: SearchCtx, dv: number): CandidateEval {
  return evalFromProbe(probePerilune(dv, ctx.lowEarthOrbitRelative.current, ctx.epoch), ctx.epoch);
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

/** Local Δv polish after the golden-section basin find. */
function refineDv(ctx: SearchCtx, best: SearchBest, iter: number): boolean {
  rebuildLeo(ctx, makeLunarEpoch(best.bestPhase, best.bestLandingT, ctx.useHorizons));
  let improved = false;
  const dDv = 0.008 / (1 + iter);
  for (const s of [-2, -1, 1, 2]) {
    const dv = Math.min(ctx.dvMax, Math.max(ctx.baseDv * 0.999, best.bestDv + s * dDv));
    const ev = evalDvOnly(ctx, dv);
    if (considerEvalStrict(best, ev, best.bestPhase, dv, best.bestLandingT)) improved = true;
  }
  return improved;
}

/** One coordinate-descent iteration: epoch/phase then Δv. */
function refineIteration(ctx: SearchCtx, best: SearchBest, iter: number): boolean {
  let improved = false;
  if (ctx.useHorizons) {
    improved = refineLandingT(ctx, best, iter) || improved;
  } else {
    improved = refinePhase(ctx, best, iter) || improved;
  }
  if (iter === 0) improved = goldenSectionDv(ctx, best, 10) || improved;
  else improved = refineDv(ctx, best, iter) || improved;
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

/** 1-D golden-section minimize on TLI Δv at the current epoch. */
function goldenSectionDv(ctx: SearchCtx, best: SearchBest, nIters = 10): boolean {
  rebuildLeo(ctx, makeLunarEpoch(best.bestPhase, best.bestLandingT, ctx.useHorizons));
  const phi = 0.5 * (3 - Math.sqrt(5));
  let lo = Math.max(ctx.baseDv * 0.999, best.bestDv - 0.05);
  let hi = Math.min(ctx.dvMax, best.bestDv + 0.05);
  if (!(hi > lo + 1e-6)) return false;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  let fc = evalDvOnly(ctx, c);
  let fd = evalDvOnly(ctx, d);
  considerEval(best, fc, best.bestPhase, c, best.bestLandingT);
  considerEval(best, fd, best.bestPhase, d, best.bestLandingT);
  let improved = false;
  for (let i = 0; i < nIters; i++) {
    if (fc.sc <= fd.sc) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - phi * (hi - lo);
      fc = evalDvOnly(ctx, c);
      if (considerEvalStrict(best, fc, best.bestPhase, c, best.bestLandingT)) improved = true;
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + phi * (hi - lo);
      fd = evalDvOnly(ctx, d);
      if (considerEvalStrict(best, fd, best.bestPhase, d, best.bestLandingT)) improved = true;
    }
  }
  return improved;
}

/** Log search summary. */
function logSearchResult(best: SearchBest, baseDv: number, found: boolean): void {
  const raDes = apogeeFromTranslunarInjectionDeltaV(LOW_EARTH_ORBIT_RADIUS, best.bestDv); const raLabel = Number.isFinite(raDes) ? (raDes / A_EM).toFixed(3) : "∞";
  console.info(
    `[tothemoon] B-plane probe perilune=${best.bestAlt.toFixed(0)} km @${(best.bestPeriluneT / 3600).toFixed(1)}h ` +
      `Bmiss=${Number.isFinite(best.bestBPlaneMissKm) ? best.bestBPlaneMissKm.toFixed(0) : "∞"} km ` +
      `rEarth=${(best.bestREarth / A_EM).toFixed(3)}×A_EM phase=${best.bestPhase.toFixed(3)} ` +
      `landT=${(best.bestLandingT / 3600).toFixed(1)}h ` +
      `dv=${best.bestDv.toFixed(4)} (Hohmann=${baseDv.toFixed(4)}) · ra_des≈${raLabel}×A_EM · ` +
      `${found ? "close-pass" : "best-effort"}`,
  );
}

function emptySearchBest(guess: number, baseDv: number, T: number): SearchBest {
  return {
    bestPhase: guess, bestDv: baseDv, bestAlt: Infinity, bestPeriluneT: T, bestREarth: Infinity,
    bestScore: Infinity, bestLandingT: T, bestBPlaneMissKm: Infinity,
  };
}

/**
 * Search epoch / phase / Δv for the best ballistic south-pole B-plane perilune.
 * Rebuilds ascent + low Earth orbit under explicit {@link EphemerisEpoch} candidates.
 * Updates `lowEarthOrbitRelative.current` whenever low Earth orbit is rebuilt.
 */
function initSearch(opts: {
  baseDv: number; designTof: number; tTli0: number;
  lowEarthOrbitRelative: { current: LowEarthOrbitRelative | null };
}): { ctx: SearchCtx; best: SearchBest; grids: ReturnType<typeof buildSearchGrids>; guess: number } {
  const { baseDv, designTof: T, tTli0, lowEarthOrbitRelative } = opts;
  const useHorizons = hasHorizonsTable(); const dvMax = maxTranslunarInjectionDeltaV();
  const guess = Math.PI - N_MOON * (72 * 3600 + tTli0);
  const ctx: SearchCtx = {
    useHorizons, baseDv, dvMax, T, lowEarthOrbitRelative,
    epoch: makeLunarEpoch(useHorizons ? 0 : guess, T, useHorizons),
  };
  return { ctx, best: emptySearchBest(guess, baseDv, T), grids: buildSearchGrids(useHorizons, baseDv, dvMax), guess };
}

function toSearchResult(best: SearchBest, found: boolean): TransferSearchResult {
  return {
    bestPhase: best.bestPhase,
    bestDv: best.bestDv,
    bestLandingT: best.bestLandingT,
    bestAlt: best.bestAlt,
    bestPeriluneT: best.bestPeriluneT,
    bestREarth: best.bestREarth,
    bestBPlaneMissKm: best.bestBPlaneMissKm,
    needsTcm: bplaneMissNeedsTcm(best.bestBPlaneMissKm, best.bestAlt),
    found,
  };
}

export function searchBallisticTransfer(opts: {
  baseDv: number;
  designTof: number;
  tTli0: number;
  lowEarthOrbitRelative: { current: LowEarthOrbitRelative | null };
}): TransferSearchResult {
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

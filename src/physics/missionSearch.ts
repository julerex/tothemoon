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
import { ensureAscent } from "./ascentCache";
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
  // Below horizon — strong push toward another epoch
  if (elev < 0) return 12_000 + (-elev) * 8_000;
  // Civil twilight band
  if (elev < 0.2) return 4_000 * ((0.2 - elev) / 0.2);
  // Low morning/evening sun — mild
  if (elev < 0.35) return 400 * ((0.35 - elev) / 0.35);
  return 0;
}

function periluneScore(
  alt: number,
  periluneT: number,
  rEarth: number,
): number {
  if (!Number.isFinite(alt) || alt > 400_000) return 1e12;
  // Ignore "closest approach" still in low Earth orbit (rE ≪ A_EM)
  if (rEarth < A_EM * 0.5 && alt > 50_000) return 1e12;
  const altTerm =
    alt < 0
      ? 100
      : Math.abs(alt - IDEAL_PERILUNE) +
        (alt > INTERCEPT_ALT ? (alt - INTERCEPT_ALT) * 10 : 0) +
        (alt > 150_000 ? (alt - 150_000) * 8 : 0);
  const dtH = (periluneT - IDEAL_TOA) / 3600;
  const timeTerm = dtH * dtH * 12;
  const rErr = Math.abs(rEarth - A_EM) / 1000;
  const rTerm = rErr * rErr * 25;
  const windowPen =
    periluneT < TOA_MIN
      ? ((TOA_MIN - periluneT) / 3600) ** 2 * 40
      : periluneT > TOA_MAX
        ? ((periluneT - TOA_MAX) / 3600) ** 2 * 40
        : 0;
  const nearLunar =
    rEarth > A_EM * 0.75 && rEarth < A_EM * 1.2
      ? 0
      : ((rEarth - A_EM) / 1000) ** 2 * 50;
  // Reward sphere of influence entry so the trail punches the Moon sphere of influence shell near A_EM
  const sphereOfInfluenceTerm =
    alt < MOON_SPHERE_OF_INFLUENCE_ALTITUDE
      ? -80_000
      : (alt - MOON_SPHERE_OF_INFLUENCE_ALTITUDE) * 1.5;
  return altTerm + timeTerm + rTerm + windowPen + nearLunar + sphereOfInfluenceTerm;
}

/**
 * Search epoch / phase / Δv for the best ballistic perilune.
 * Rebuilds ascent + low Earth orbit under explicit {@link EphemerisEpoch} candidates.
 * Updates `lowEarthOrbitRelative.current` whenever low Earth orbit is rebuilt.
 */
export function searchBallisticTransfer(opts: {
  baseDv: number;
  designTof: number;
  tTli0: number;
  lowEarthOrbitRelative: { current: LowEarthOrbitRelative | null };
}): TransferSearchResult {
  const { baseDv, designTof: T, tTli0, lowEarthOrbitRelative } = opts;
  const useHorizons = hasHorizonsTable();
  const dvMax = maxTranslunarInjectionDeltaV();

  // Lead angle for outbound lunar-distance intercept (~3 d), not full apo time of flight
  const guess = Math.PI - N_MOON * (72 * 3600 + tTli0);

  const phaseOffsets: number[] = [];
  if (!useHorizons) {
    for (let i = -80; i <= 80; i++) phaseOffsets.push(i * 0.03);
  } else {
    phaseOffsets.push(0);
  }
  const epochOffsetsS: number[] = [];
  if (useHorizons) {
    // ±10 d around design landing map, 12 h steps. Coarse pass rebuilds
    // low Earth orbit per offset so dogleg / translunar injection aim match DE441 Moon geometry.
    for (let i = -20; i <= 20; i++) epochOffsetsS.push(i * 12 * 3600);
  } else {
    epochOffsetsS.push(0);
  }

  // Prefer design / hotter injects for free-coast reach
  const dvScales = [1.0, 1.015, 1.03, 1.045, 1.06].filter(
    (s) => baseDv * s <= dvMax + 1e-9,
  );

  let epoch = makeLunarEpoch(useHorizons ? 0 : guess, T, useHorizons);

  /**
   * Score a (Δv, moon-phase) pair. `reAscent` rebuilds low Earth orbit under that phase so
   * the probe matches flyMission (ascent is weakly barycenter-coupled).
   */
  function evalCandidate(
    dv: number,
    ph: number,
    landT: number,
    reAscent = false,
  ): {
    sc: number;
    alt: number;
    t: number;
    rE: number;
  } {
    epoch = makeLunarEpoch(ph, landT, useHorizons);
    if (reAscent) ensureAscent(epoch);
    lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(epoch);
    const pr = probePerilune(dv, lowEarthOrbitRelative.current, epoch);
    return {
      sc:
        periluneScore(pr.minAlt, pr.periluneT, pr.rEarth) +
        launchDayPenalty(epoch),
      alt: pr.minAlt,
      t: pr.periluneT,
      rE: pr.rEarth,
    };
  }

  let bestPhase = guess;
  let bestDv = baseDv;
  let bestAlt = Infinity;
  let bestPeriluneT = T;
  let bestREarth = Infinity;
  let bestScore = Infinity;
  let bestLandingT = T;
  let found = false;

  // Coarse grid: epoch offset (Horizons) and/or Moon phase (analytic) × Δv.
  // Horizons: rebuild ascent+ low Earth orbit at every epoch so the transfer plane aims at
  // the DE441 Moon (stale low Earth orbit from a fixed landT systematically missed).
  for (const landOff of epochOffsetsS) {
    if (useHorizons) {
      epoch = makeLunarEpoch(0, T + landOff, useHorizons);
      ensureAscent(epoch);
      lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(epoch);
    }
    for (const dS of dvScales) {
      const dv = Math.min(baseDv * dS, dvMax);
      for (const off of phaseOffsets) {
        const ph = useHorizons ? 0 : guess + off;
        const landT = T + landOff;
        const ev = evalCandidate(dv, ph, landT, false);
        if (ev.sc < bestScore) {
          bestScore = ev.sc;
          bestAlt = ev.alt;
          bestPeriluneT = ev.t;
          bestREarth = ev.rE;
          bestPhase = ph;
          bestDv = dv;
          bestLandingT = landT;
        }
      }
    }
  }
  if (useHorizons) {
    epoch = makeLunarEpoch(0, bestLandingT, useHorizons);
  }

  // Medium pass: re-ascent so scores match the path flyMission will bake
  {
    const seedPhase = bestPhase;
    const seedDv = bestDv;
    const seedLand = bestLandingT;
    bestScore = Infinity;
    if (useHorizons) {
      // Refine epoch ±48 h at 4 h, rebuild low Earth orbit each step
      for (let i = -12; i <= 12; i++) {
        const landT = seedLand + i * 4 * 3600;
        epoch = makeLunarEpoch(0, landT, useHorizons);
        ensureAscent(epoch);
        lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(epoch);
        for (const s of [0, -0.012, 0.012, -0.024, 0.024]) {
          const dv = Math.min(dvMax, Math.max(baseDv * 0.999, seedDv + s));
          const ev = evalCandidate(dv, 0, landT, false);
          if (ev.sc < bestScore) {
            bestScore = ev.sc;
            bestAlt = ev.alt;
            bestPeriluneT = ev.t;
            bestREarth = ev.rE;
            bestPhase = 0;
            bestDv = dv;
            bestLandingT = landT;
          }
        }
      }
      epoch = makeLunarEpoch(0, bestLandingT, useHorizons);
    } else {
      for (let i = -20; i <= 20; i++) {
        const ph = seedPhase + i * 0.05;
        epoch = makeLunarEpoch(ph, T, useHorizons);
        ensureAscent(epoch);
        lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(epoch);
        for (const s of [0, -0.012, 0.012]) {
          const dv = Math.min(dvMax, Math.max(baseDv * 0.999, seedDv + s));
          const ev = evalCandidate(dv, ph, T, false);
          if (ev.sc < bestScore) {
            bestScore = ev.sc;
            bestAlt = ev.alt;
            bestPeriluneT = ev.t;
            bestREarth = ev.rE;
            bestPhase = ph;
            bestDv = dv;
          }
        }
      }
    }
  }

  // Coordinate descent refine (rebuild low Earth orbit when epoch or phase changes)
  for (let iter = 0; iter < 8; iter++) {
    let improved = false;
    if (useHorizons) {
      const dT = (3 * 3600) / (1 + iter);
      for (const s of [-2, -1, 1, 2]) {
        const landT = bestLandingT + s * dT;
        epoch = makeLunarEpoch(0, landT, useHorizons);
        ensureAscent(epoch);
        lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(epoch);
        const ev = evalCandidate(bestDv, 0, landT, false);
        if (ev.sc < bestScore - 1e-6) {
          bestScore = ev.sc;
          bestAlt = ev.alt;
          bestPeriluneT = ev.t;
          bestREarth = ev.rE;
          bestLandingT = landT;
          bestPhase = 0;
          improved = true;
        }
      }
      epoch = makeLunarEpoch(0, bestLandingT, useHorizons);
      ensureAscent(epoch);
      lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(epoch);
    } else {
      const dPh = 0.02 / (1 + iter);
      for (const s of [-2, -1, 1, 2]) {
        const ph = bestPhase + s * dPh;
        const ev = evalCandidate(bestDv, ph, T, true);
        if (ev.sc < bestScore - 1e-6) {
          bestScore = ev.sc;
          bestAlt = ev.alt;
          bestPeriluneT = ev.t;
          bestREarth = ev.rE;
          bestPhase = ph;
          improved = true;
        }
      }
    }
    const dDv = 0.008 / (1 + iter);
    for (const s of [-2, -1, 1, 2]) {
      // Never cool below design (sub-lunar apo → early Earth return)
      const dv = Math.min(dvMax, Math.max(baseDv * 0.999, bestDv + s * dDv));
      const ev = evalCandidate(dv, bestPhase, bestLandingT, true);
      if (ev.sc < bestScore - 1e-6) {
        bestScore = ev.sc;
        bestAlt = ev.alt;
        bestPeriluneT = ev.t;
        bestREarth = ev.rE;
        bestDv = dv;
        improved = true;
      }
    }
    if (!improved) break;
  }

  if (bestAlt < INTERCEPT_ALT) found = true;

  const raDes = apogeeFromTranslunarInjectionDeltaV(
    LOW_EARTH_ORBIT_RADIUS,
    bestDv,
  );
  console.info(
    `[tothemoon] Ballistic 4-body probe minMoonAlt=${bestAlt.toFixed(0)} km @${(bestPeriluneT / 3600).toFixed(1)}h ` +
      `rEarth=${(bestREarth / A_EM).toFixed(3)}×A_EM phase=${bestPhase.toFixed(3)} ` +
      `landT=${(bestLandingT / 3600).toFixed(1)}h ` +
      `dv=${bestDv.toFixed(4)} (Hohmann=${baseDv.toFixed(4)}) · ` +
      `ra_des≈${Number.isFinite(raDes) ? (raDes / A_EM).toFixed(3) : "∞"}×A_EM · ` +
      `${found ? "close-pass" : "best-effort"}`,
  );

  return {
    bestPhase,
    bestDv,
    bestLandingT,
    bestAlt,
    bestPeriluneT,
    bestREarth,
    found,
  };
}

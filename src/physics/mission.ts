/**
 * Mission orchestrator: Starbase → low Earth orbit → translunar injection →
 * n-body coast → lunar orbit insertion → low lunar orbit → powered descent → land.
 *
 * After translunar injection the craft coasts under restricted n-body gravity,
 * then captures into polar low lunar orbit and soft-lands at the south pole
 * (theater LOI / LLO / PDI — not flight-ops tables).
 *
 * Heavy lifting lives in focused modules:
 * - {@link flyMission} — ascent + dogleg + translunar injection + capture
 * - {@link searchBallisticTransfer} — epoch / phase / Δv search (close perilune)
 * - {@link runLunarCapture} — coast + LOI + LLO + descent
 * - {@link downsampleTrajectory} — pack thinning
 */

import { createAscentCache, type AscentCache } from "./ascentCache";
import { hasHorizonsTable, horizonsSource } from "./horizonsEpoch";
import {
  computeLowEarthOrbitRelative,
  type LowEarthOrbitRelative,
} from "./lowEarthOrbitCoast";
import { downsampleTrajectory } from "./missionDownsample";
import { makeLunarEpoch } from "./missionEpoch";
import { flyMission } from "./missionFly";
import { searchBallisticTransfer } from "./missionSearch";
import type { MissionResult } from "./missionTypes";
import { deriveTrajectoryMeta } from "./trajectoryMeta";
import { designLunarTransfer } from "./translunarInjection";
import { clone } from "./vec3";
import type { AscentResult } from "./ascent";
import type { EphemerisEpoch } from "./ephemerisEpoch";

// Re-export public types / helpers so existing imports of ./mission keep working.
export type { PhaseId, Sample, MissionResult } from "./missionTypes";
export { phaseLabel } from "./missionTypes";

/** Failed ascent → MissionResult for the pack. */
function cloneAscentSample(s: AscentResult["samples"][number]) {
  return {
    t: s.t, pos: clone(s.pos), vel: clone(s.vel), phase: s.phase, burning: s.burning,
    fuelBooster: s.fuelBooster, fuelShip: s.fuelShip, thrustN: s.thrustN, staged: s.staged,
  };
}

function ascentFailureResult(ascent0: AscentResult): MissionResult {
  return {
    samples: ascent0.samples.map(cloneAscentSample),
    durationS: ascent0.state.t, moonPhase0: 0, translunarInjectionDeltaV: 0,
    minMoonAlt: Infinity, ok: false, message: ascent0.message,
  };
}

/** Design TOF and base TLI Δv from Hohmann transfer. */
function designTransferParams(): { baseDv: number; T: number } {
  const xfer = designLunarTransfer();
  return { baseDv: xfer.translunarInjectionDeltaV, T: xfer.tof };
}

/** Initial epoch + optional Horizons log. */
function initMissionEpoch(T: number, useHorizons: boolean): EphemerisEpoch {
  const epoch = makeLunarEpoch(0, T, useHorizons);
  if (useHorizons) {
    console.info(
      `[tothemoon] Using ${horizonsSource()} for Earth/Moon (landing τ=0)`,
    );
  }
  return epoch;
}

/**
 * Rebuild LEO template under chosen search result.
 * A fresh ascent memo guarantees the baked ascent is re-flown for the winning
 * epoch rather than reused from a scoring candidate.
 */
function rebuildAfterSearch(
  search: ReturnType<typeof searchBallisticTransfer>,
  useHorizons: boolean,
  lowEarthOrbitRelative: { current: LowEarthOrbitRelative | null },
): { epoch: EphemerisEpoch; ascent: AscentResult } {
  const epoch = makeLunarEpoch(search.bestPhase, search.bestLandingT, useHorizons);
  const ascent = createAscentCache().ensure(epoch);
  lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(ascent, epoch);
  return { epoch, ascent };
}

/** Attach pack meta and log summary after fly + downsample. */
function stampMeta(out: MissionResult, epoch: EphemerisEpoch, bestLandingT: number): MissionResult {
  out.horizonsLandingT = bestLandingT;
  const meta = deriveTrajectoryMeta(out.samples, epoch);
  out.peakSpeedKmS = meta.peakSpeedKmS;
  out.stageT = meta.stageT;
  return out;
}

function finalizeMission(flown: MissionResult, epoch: EphemerisEpoch, bestLandingT: number): MissionResult {
  console.info(
    `[tothemoon] ${flown.message} · duration=${(flown.durationS / 3600).toFixed(1)}h · samples=${flown.samples.length}`,
  );
  return stampMeta(downsampleTrajectory(flown), epoch, bestLandingT);
}

/**
 * Starbase → low Earth orbit → translunar injection → capture → south-pole land.
 * Probe search aims for a close Moon pass so LOI can light.
 */
function pickToa(search: ReturnType<typeof searchBallisticTransfer>, T: number): number {
  return Number.isFinite(search.bestPeriluneT) && search.bestPeriluneT > 0
    ? search.bestPeriluneT
    : T;
}

function runSearch(
  baseDv: number, T: number, epoch: EphemerisEpoch,
  ascentCache: AscentCache, ascent: AscentResult,
) {
  const lowEarthOrbitRelative: { current: LowEarthOrbitRelative | null } = {
    current: computeLowEarthOrbitRelative(ascent, epoch),
  };
  const search = searchBallisticTransfer({
    baseDv, designTof: T, tTli0: lowEarthOrbitRelative.current!.t, lowEarthOrbitRelative,
    ascentCache, ascent,
  });
  return { search, lowEarthOrbitRelative };
}

function flyAfterSearch(search: ReturnType<typeof searchBallisticTransfer>, useHorizons: boolean, lowEarthOrbitRelative: { current: LowEarthOrbitRelative | null }, T: number): MissionResult {
  const { epoch, ascent } = rebuildAfterSearch(search, useHorizons, lowEarthOrbitRelative);
  return finalizeMission(flyMission(ascent, epoch, search.bestDv, pickToa(search, T)), epoch, search.bestLandingT);
}

export function runMission(): MissionResult {
  const { baseDv, T } = designTransferParams();
  const useHorizons = hasHorizonsTable();
  const epoch = initMissionEpoch(T, useHorizons);
  const ascentCache = createAscentCache();
  const ascent0 = ascentCache.ensure(epoch);
  if (!ascent0.ok) return ascentFailureResult(ascent0);
  const { search, lowEarthOrbitRelative } = runSearch(baseDv, T, epoch, ascentCache, ascent0);
  return flyAfterSearch(search, useHorizons, lowEarthOrbitRelative, T);
}

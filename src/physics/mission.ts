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

import { LOW_EARTH_ORBIT_COAST_S } from "./constants";
import { ensureAscent, resetAscentCache } from "./ascentCache";
import { hasHorizonsTable, horizonsSource } from "./horizonsEpoch";
import {
  computeLowEarthOrbitRelative,
  setLowEarthOrbitCoastS,
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

// Re-export public types / helpers so existing imports of ./mission keep working.
export type { PhaseId, Sample, MissionResult } from "./missionTypes";
export { phaseLabel } from "./missionTypes";

/**
 * Starbase → low Earth orbit → translunar injection → capture → south-pole land.
 * Probe search aims for a close Moon pass so LOI can light.
 */
export function runMission(): MissionResult {
  const xfer = designLunarTransfer();
  const baseDv = xfer.translunarInjectionDeltaV;
  const T = xfer.tof;
  const useHorizons = hasHorizonsTable();

  // Map mission time → Horizons absolute epoch (landing = 2027-07-20 12:00)
  let epoch = makeLunarEpoch(0, T, useHorizons);
  if (useHorizons) {
    console.info(
      `[tothemoon] Using ${horizonsSource()} for Earth/Moon (landing τ=0)`,
    );
  }

  resetAscentCache();
  const ascent0 = ensureAscent(epoch);
  if (!ascent0.ok) {
    return {
      samples: ascent0.samples.map((s) => ({
        t: s.t,
        pos: clone(s.pos),
        vel: clone(s.vel),
        phase: s.phase,
        burning: s.burning,
        fuelBooster: s.fuelBooster,
        fuelShip: s.fuelShip,
        thrustN: s.thrustN,
        staged: s.staged,
      })),
      durationS: ascent0.state.t,
      moonPhase0: 0,
      translunarInjectionDeltaV: 0,
      minMoonAlt: Infinity,
      ok: false,
      message: ascent0.message,
    };
  }
  setLowEarthOrbitCoastS(LOW_EARTH_ORBIT_COAST_S);
  const lowEarthOrbitRelative: { current: LowEarthOrbitRelative | null } = {
    current: computeLowEarthOrbitRelative(epoch),
  };
  const tTli0 = lowEarthOrbitRelative.current!.t;

  const search = searchBallisticTransfer({
    baseDv,
    designTof: T,
    tTli0,
    lowEarthOrbitRelative,
  });

  const toa =
    Number.isFinite(search.bestPeriluneT) && search.bestPeriluneT > 0
      ? search.bestPeriluneT
      : T;
  // Keep best Horizons epoch; rebuild ascent under the chosen phase + landing map
  epoch = makeLunarEpoch(search.bestPhase, search.bestLandingT, useHorizons);
  resetAscentCache();
  ensureAscent(epoch);
  lowEarthOrbitRelative.current = computeLowEarthOrbitRelative(epoch);

  const flown = flyMission(epoch, search.bestDv, toa);

  console.info(
    `[tothemoon] ${flown.message} · duration=${(flown.durationS / 3600).toFixed(1)}h · samples=${flown.samples.length}`,
  );
  const out = downsampleTrajectory(flown);
  out.horizonsLandingT = search.bestLandingT;
  // Peak speed / stage epoch for pack v2 meta (minMoonAlt already from flyMission)
  const meta = deriveTrajectoryMeta(out.samples, epoch);
  out.peakSpeedKmS = meta.peakSpeedKmS;
  out.stageT = meta.stageT;
  return out;
}

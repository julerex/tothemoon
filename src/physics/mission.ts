/**
 * Mission orchestrator: Starbase → low Earth orbit → translunar injection → pure ballistic n-body coast.
 *
 * After translunar injection there are **no burns** (no trajectory corrections, no lunar orbit insertion / powered descent). The craft coasts under
 * restricted n-body gravity (Earth + Moon + solar tide + J₂). Outcome is lunar
 * impact or ballistic flyby — not a powered landing.
 *
 * Heavy lifting lives in focused modules:
 * - {@link flyMission} — ascent + dogleg + translunar injection + ballistic coast
 * - {@link searchBallisticTransfer} — epoch / phase / Δv search
 * - {@link runBallisticCoast} / {@link probePerilune} — free-coast dynamics
 * - {@link downsampleTrajectory} — pack thinning
 */

import { LOW_EARTH_ORBIT_COAST_S } from "./constants";
import { ensureAscent, resetAscentCache } from "./ascentCache";
import {
  hasHorizonsEpoch,
  horizonsSource,
  setMissionLandingT,
} from "./horizonsEpoch";
import { computeLowEarthOrbitRelative, setLowEarthOrbitCoastS, type LowEarthOrbitRelative } from "./lowEarthOrbitCoast";
import { downsampleTrajectory } from "./missionDownsample";
import { setEpochPhases } from "./missionEpoch";
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
 * Starbase → low Earth orbit → translunar injection → ballistic free coast (no post-Translunar injection burns).
 * Outcome: lunar impact or flyby. Probe search aims for a close Moon pass.
 */
export function runMission(): MissionResult {
  const xfer = designLunarTransfer();
  const baseDv = xfer.translunarInjectionDeltaV;
  const T = xfer.tof;

  // Map mission time → Horizons absolute epoch (landing = 2027-07-20 12:00)
  setMissionLandingT(T);
  if (hasHorizonsEpoch()) {
    console.info(
      `[tothemoon] Using ${horizonsSource()} for Earth/Moon (landing τ=0)`,
    );
  }

  resetAscentCache();
  setEpochPhases(0, T);
  const ascent0 = ensureAscent(0);
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
    current: computeLowEarthOrbitRelative(),
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
  // Keep best Horizons epoch; rebuild ascent (cache is phase-only, not epoch)
  setMissionLandingT(search.bestLandingT);
  setEpochPhases(search.bestPhase, T);
  resetAscentCache();
  ensureAscent(search.bestPhase);
  lowEarthOrbitRelative.current = computeLowEarthOrbitRelative();

  setMissionLandingT(search.bestLandingT);
  const flown = flyMission(search.bestPhase, search.bestDv, toa);
  // Keep the same Horizons map used while integrating — do not remap to
  // durationS (that would move Earth under fixed craft samples).
  setMissionLandingT(search.bestLandingT);
  setEpochPhases(search.bestPhase, flown.durationS);

  console.info(
    `[tothemoon] ${flown.message} · duration=${(flown.durationS / 3600).toFixed(1)}h · samples=${flown.samples.length}`,
  );
  const out = downsampleTrajectory(flown);
  out.horizonsLandingT = search.bestLandingT;
  // Peak speed / stage epoch for pack v2 meta (minMoonAlt already from flyMission)
  const meta = deriveTrajectoryMeta(out.samples);
  out.peakSpeedKmS = meta.peakSpeedKmS;
  out.stageT = meta.stageT;
  return out;
}

/**
 * Live craft sampling for the ascent / RTLS cross-section (internal).
 */

import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import type { buildBoosterKeyframes } from "../physics/boosterRecovery";
import {
  sampleBoosterRecovery,
  type RecoveryProfile,
  type StageState,
} from "../physics/boosterRecovery";
import type { ReadonlySample } from "../physics/missionTypes";
import { v3 } from "../physics/vec3";
import {
  planeAltitudeKm,
  projectToLaunchPlane,
  samplePosAt,
  surfaceArcKm,
  type CrossSectionLive,
  type CrossSectionModel,
  type LaunchPlaneBasis,
  type PlanePoint,
} from "./crossSectionGeometry";

export function liveCrossSection(
  model: CrossSectionModel,
  samples: readonly ReadonlySample[],
  stage: StageState | null,
  t: number,
  keyframes?: ReturnType<typeof buildBoosterKeyframes> | null,
  recovery: RecoveryProfile = "chopsticks",
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): CrossSectionLive {
  const ship = liveShipPoint(model, samples, t, epoch);
  const boost = liveBoosterPoint(ship, stage, t, keyframes, recovery, epoch, model.basis);
  return assembleLive(model, ship, boost, recovery);
}

function liveShipPoint(
  model: CrossSectionModel,
  samples: readonly ReadonlySample[],
  t: number,
  epoch: EphemerisEpoch,
): PlanePoint | null {
  const shipPos = samplePosAt(samples, t);
  if (!shipPos) return null;
  const shipPt: PlanePoint = { x: 0, y: 0 };
  projectToLaunchPlane(shipPos, t, model.basis, shipPt, epoch);
  return { x: shipPt.x, y: shipPt.y };
}

function liveBoosterPoint(
  ship: PlanePoint | null,
  stage: StageState | null,
  t: number,
  keyframes: ReturnType<typeof buildBoosterKeyframes> | null | undefined,
  recovery: RecoveryProfile,
  epoch: EphemerisEpoch,
  basis: LaunchPlaneBasis,
): { booster: PlanePoint | null; boosterFade: number; staged: boolean } {
  if (stage && t + 1e-9 >= stage.t) {
    return recoveryBooster(stage, t, keyframes, recovery, epoch, basis);
  }
  if (ship) return { booster: { x: ship.x, y: ship.y }, boosterFade: 1, staged: false };
  return { booster: null, boosterFade: 0, staged: false };
}

function recoveryBooster(
  stage: StageState,
  t: number,
  keyframes: ReturnType<typeof buildBoosterKeyframes> | null | undefined,
  recovery: RecoveryProfile,
  epoch: EphemerisEpoch,
  basis: LaunchPlaneBasis,
): { booster: PlanePoint | null; boosterFade: number; staged: boolean } {
  const rec = sampleBoosterRecovery(
    stage, t - stage.t, keyframes ?? undefined, recovery, epoch,
  );
  if (rec.phase === "done" || rec.fade < 0.02) {
    return { booster: null, boosterFade: rec.fade, staged: true };
  }
  return { booster: projectRecoveryPos(rec.pos, t, basis, epoch), boosterFade: rec.fade, staged: true };
}

function projectRecoveryPos(
  posIn: { x: number; y: number; z: number },
  t: number,
  basis: LaunchPlaneBasis,
  epoch: EphemerisEpoch,
): PlanePoint {
  const boosterPt: PlanePoint = { x: 0, y: 0 };
  projectToLaunchPlane(v3(posIn.x, posIn.y, posIn.z), t, basis, boosterPt, epoch);
  return { x: boosterPt.x, y: boosterPt.y };
}

function assembleLive(
  model: CrossSectionModel,
  ship: PlanePoint | null,
  boost: { booster: PlanePoint | null; boosterFade: number; staged: boolean },
  recovery: RecoveryProfile,
): CrossSectionLive {
  return {
    ship,
    booster: boost.booster,
    staged: boost.staged,
    boosterFade: boost.boosterFade,
    ...liveAltRange(model, ship, boost.booster),
    recoveryProfile: recovery,
  };
}

function liveAltRange(
  model: CrossSectionModel,
  ship: PlanePoint | null,
  booster: PlanePoint | null,
) {
  return {
    shipAltKm: ship ? planeAltitudeKm(ship, model.rEarth) : 0,
    boosterAltKm: booster ? planeAltitudeKm(booster, model.rEarth) : 0,
    shipRangeKm: ship ? surfaceArcKm(ship, model.rEarth) : 0,
    boosterRangeKm: booster ? surfaceArcKm(booster, model.rEarth) : 0,
  };
}

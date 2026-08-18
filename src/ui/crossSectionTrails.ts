/**
 * Trail sampling for the ascent / RTLS cross-section (internal to crossSection).
 */

import { R_EARTH } from "../physics/constants";
import {
  buildBoosterKeyframes,
  boosterVisibleS,
  recoverySchedule,
  sampleBoosterRecovery,
  type RecoveryProfile,
  type StageState,
} from "../physics/boosterRecovery";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import type { ReadonlySample } from "../physics/missionTypes";
import { v3 } from "../physics/vec3";
import {
  projectToLaunchPlane,
  type LaunchPlaneBasis,
  type PlanePoint,
  type TimedPlanePoint,
} from "./crossSectionGeometry";

export function fillAllTrails(
  samples: readonly ReadonlySample[],
  stage: StageState | null,
  stageT: number | null,
  recovery: RecoveryProfile,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  boosterTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
): void {
  fillStackedAscent(samples, stageT, basis, shipTrail, boosterTrail, epoch);
  fillPostStageShip(samples, stageT, basis, shipTrail, epoch);
  if (stage) fillBoosterRecovery(stage, recovery, basis, boosterTrail, epoch);
}

function fillStackedAscent(
  samples: readonly ReadonlySample[],
  stageT: number | null,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  boosterTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
): void {
  const pt = { x: 0, y: 0 };
  let lastShipT = -Infinity;
  for (const s of samples) {
    lastShipT = maybePushStacked(s, stageT, basis, shipTrail, boosterTrail, epoch, pt, lastShipT);
    if (lastShipT === Number.POSITIVE_INFINITY) break;
  }
}

function maybePushStacked(
  s: ReadonlySample,
  stageT: number | null,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  boosterTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
  pt: PlanePoint,
  lastShipT: number,
): number {
  if (stageT != null && s.t > stageT + 1e-6) return Number.POSITIVE_INFINITY;
  if (s.t - lastShipT < 0.35 && s.t !== stageT) return lastShipT;
  projectToLaunchPlane(s.pos, s.t, basis, pt, epoch);
  const q = { x: pt.x, y: pt.y, t: s.t };
  shipTrail.push(q);
  boosterTrail.push({ ...q });
  return s.t;
}

function fillPostStageShip(
  samples: readonly ReadonlySample[],
  stageT: number | null,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
): void {
  if (stageT == null) return;
  appendPostStageSamples(samples, stageT, basis, shipTrail, epoch);
}

function appendPostStageSamples(
  samples: readonly ReadonlySample[],
  stageT: number,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
): void {
  const pt = { x: 0, y: 0 };
  let lastShipT = shipTrail[shipTrail.length - 1]?.t ?? -Infinity;
  for (const s of samples) {
    lastShipT = stepPostStage(s, stageT, basis, shipTrail, epoch, pt, lastShipT);
    if (lastShipT === Number.POSITIVE_INFINITY) break;
  }
}

function stepPostStage(
  s: ReadonlySample,
  stageT: number,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
  pt: PlanePoint,
  lastShipT: number,
): number {
  if (s.t <= stageT) return lastShipT;
  if (s.t > stageT + 45) return Number.POSITIVE_INFINITY;
  if (s.t - lastShipT < 0.5) return lastShipT;
  projectToLaunchPlane(s.pos, s.t, basis, pt, epoch);
  if (shipLeftEnvelope(pt)) return Number.POSITIVE_INFINITY;
  shipTrail.push({ x: pt.x, y: pt.y, t: s.t });
  return s.t;
}

function shipLeftEnvelope(pt: PlanePoint): boolean {
  return Math.abs(pt.x) > 160 || Math.hypot(pt.x, pt.y) > R_EARTH + 160;
}

function fillBoosterRecovery(
  stage: StageState,
  recovery: RecoveryProfile,
  basis: LaunchPlaneBasis,
  boosterTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
): void {
  const kfs = buildBoosterKeyframes(stage, recovery, epoch);
  const vis = boosterVisibleS(recoverySchedule(recovery));
  const pt = { x: 0, y: 0 };
  for (let age = 0; age <= vis; age += 1.0) {
    pushRecoverySample(stage, age, kfs, recovery, basis, boosterTrail, pt, epoch);
  }
}

function pushRecoverySample(
  stage: StageState,
  age: number,
  kfs: ReturnType<typeof buildBoosterKeyframes>,
  recovery: RecoveryProfile,
  basis: LaunchPlaneBasis,
  boosterTrail: TimedPlanePoint[],
  pt: PlanePoint,
  epoch: EphemerisEpoch,
): void {
  const rec = sampleBoosterRecovery(stage, age, kfs, recovery, epoch);
  if (rec.phase === "done" || rec.fade < 0.02) return;
  const t = stage.t + age;
  const pos = v3(rec.pos.x, rec.pos.y, rec.pos.z);
  projectToLaunchPlane(pos, t, basis, pt, epoch);
  boosterTrail.push({ x: pt.x, y: pt.y, t });
}

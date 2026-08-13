/**
 * Structural / regression checks for baked mission trajectories.
 * Used by unit tests and by the precompute script so bad packs fail the build.
 */

import { R_MOON } from "./constants";
import type { PhaseId } from "./mission";

/**
 * Expected core phase order for the lunar capture mission.
 * Optional terminal: `impact` if LOI fails and the craft hits the Moon.
 */
export const EXPECTED_PHASE_ORDER: readonly PhaseId[] = [
  "launch",
  "ascent",
  "lowEarthOrbit",
  "translunarInjection",
  "coast",
  "approach",
  "braking",
  "descent",
  "landed",
] as const;

/** Allowed end phases for a completed lunar mission. */
export const EXPECTED_END_PHASES: readonly PhaseId[] = [
  "landed",
  "impact",
  "coast",
] as const;

/** Minimal sample shape (works for packed JSON and live Sample). */
export type TrajectorySampleLike = {
  t: number;
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  phase: string;
  burning: boolean;
  fuelBooster: number;
  fuelShip: number;
  thrustN: number;
  staged: boolean;
};

export type TrajectoryLike = {
  ok: boolean;
  durationS: number;
  message: string;
  samples: TrajectorySampleLike[];
  /** Pack schema version when known (v2+ has peak/stage meta) */
  version?: number;
  minMoonAlt?: number;
  peakSpeedKmS?: number;
  stageT?: number | null;
  periluneAltKm?: number;
  bPlaneMissKm?: number;
};

export type InvariantIssue = {
  code: string;
  message: string;
};

/**
 * Hard caps tuned above observed healthy packs (coast Δt≤300 s, v≲11 km/s).
 * Teleport-style trail holes historically produced multi-10_000 km jumps.
 */
export const MAX_STEP_KM = 8_000;
/** |Δr|/Δt should stay near orbital / translunar injection speeds, not instantaneous jumps. */
/** Trail continuity; trajectory correction rejoin / polar taxi can peak higher than ballistic coast. */
export const MAX_APPARENT_SPEED_KM_S = 80;
export const MIN_SAMPLES = 500;
export const MIN_DURATION_H = 24;
export const MAX_DURATION_H = 14 * 24;

const BALLISTIC_CORE = [
  "launch",
  "ascent",
  "lowEarthOrbit",
  "translunarInjection",
  "coast",
] as const;

const CAPTURE_CORE = [
  "coast",
  "approach",
  "braking",
  "descent",
  "landed",
] as const;

function pushIssue(
  issues: InvariantIssue[],
  code: string,
  message: string,
): void {
  issues.push({ code, message });
}

/** ok flag + sample count. */
function checkOkAndCount(traj: TrajectoryLike, issues: InvariantIssue[]): void {
  if (!traj.ok) pushIssue(issues, "not_ok", `mission not ok: ${traj.message}`);
  if (traj.samples.length < MIN_SAMPLES) {
    pushIssue(issues, "too_few_samples", `expected ≥${MIN_SAMPLES} samples, got ${traj.samples.length}`);
  }
}

/** durationS finite and within mission band. */
function checkDuration(traj: TrajectoryLike, issues: InvariantIssue[]): void {
  if (!(traj.durationS > 0) || !Number.isFinite(traj.durationS)) {
    pushIssue(issues, "bad_duration", `durationS must be finite > 0, got ${traj.durationS}`);
    return;
  }
  const hours = traj.durationS / 3600;
  if (hours < MIN_DURATION_H || hours > MAX_DURATION_H) {
    pushIssue(issues, "duration_range", `duration ${hours.toFixed(2)} h outside [${MIN_DURATION_H}, ${MAX_DURATION_H}] h`);
  }
}

/** First sample t / phase / staged. */
function checkStartSample(first: TrajectorySampleLike, issues: InvariantIssue[]): void {
  if (first.t > 1e-6) pushIssue(issues, "start_t", `first sample t should be ~0, got ${first.t}`);
  if (first.phase !== "launch" && first.phase !== "ascent") {
    pushIssue(issues, "start_phase", `first phase should be launch/ascent, got ${first.phase}`);
  }
  if (first.staged) pushIssue(issues, "start_staged", "first sample should not be staged");
}

function endPhaseOk(phase: string): boolean {
  return phase === "landed" || phase === "impact" || phase === "coast";
}

/** Last sample phase / staged / t vs duration. */
function checkEndSample(
  last: TrajectorySampleLike,
  durationS: number,
  issues: InvariantIssue[],
): void {
  if (!endPhaseOk(last.phase)) {
    pushIssue(issues, "end_phase", `last phase should be landed/impact/coast, got ${last.phase}`);
  }
  if (!last.staged) pushIssue(issues, "end_staged", "last sample should be staged (ship only)");
  if (Math.abs(last.t - durationS) > 1) {
    pushIssue(issues, "end_t", `last.t (${last.t}) should match durationS (${durationS})`);
  }
}

/** Collapse samples to unique consecutive phases. */
function uniquePhaseSequence(s: TrajectorySampleLike[]): string[] {
  const phaseSeq: string[] = [];
  for (const sample of s) {
    if (phaseSeq.length === 0 || phaseSeq[phaseSeq.length - 1] !== sample.phase) {
      phaseSeq.push(sample.phase);
    }
  }
  return phaseSeq;
}

function phaseAdvanceOk(
  p: string, coreCheck: readonly string[], ei: number, phaseSeq: string[], isCapture: boolean,
): number | null {
  if (p === "impact" && !isCapture) return ei;
  const idx = coreCheck.indexOf(p as PhaseId, ei);
  if (idx >= 0) return idx + 1;
  if (p === "impact" && phaseSeq[phaseSeq.length - 1] === "impact") return ei;
  return null;
}

/** Whether phase list is a subsequence of the capture or ballistic core. */
function phaseOrderOk(phaseSeq: string[], isCapture: boolean): boolean {
  const coreCheck = isCapture
    ? (EXPECTED_PHASE_ORDER as readonly string[])
    : (BALLISTIC_CORE as readonly string[]); let ei = 0;
  for (const p of phaseSeq) {
    const next = phaseAdvanceOk(p, coreCheck, ei, phaseSeq, isCapture);
    if (next == null) return false;
    ei = next;
  }
  return true;
}

function isCaptureSequence(phaseSeq: string[]): boolean {
  return phaseSeq.includes("approach") || phaseSeq.includes("landed");
}

/** Phase subsequence + required phases for capture vs ballistic. */
function checkPhaseSequence(
  s: TrajectorySampleLike[],
  last: TrajectorySampleLike,
  issues: InvariantIssue[],
): void {
  const phaseSeq = uniquePhaseSequence(s);
  const endOk = EXPECTED_END_PHASES.includes(phaseSeq[phaseSeq.length - 1] as PhaseId);
  const isCapture = isCaptureSequence(phaseSeq);
  if (!phaseOrderOk(phaseSeq, isCapture) || phaseSeq[0] !== "launch" || !endOk) {
    pushIssue(issues, "phase_order", `phase sequence ${phaseSeq.join(" → ")} does not match capture or ballistic arc`);
  }
  checkMissingPhases(phaseSeq, isCapture, last, issues);
}

function requirePhases(
  phaseSeq: string[], needs: readonly string[], issues: InvariantIssue[], onlyIf?: boolean,
): void {
  if (onlyIf === false) return;
  for (const need of needs) {
    if (!phaseSeq.includes(need)) pushIssue(issues, "missing_phase", `missing phase ${need}`);
  }
}

/** Required phases present for capture-landed or ballistic packs. */
function checkMissingPhases(
  phaseSeq: string[],
  isCapture: boolean,
  last: TrajectorySampleLike,
  issues: InvariantIssue[],
): void {
  if (isCapture) {
    requirePhases(phaseSeq, CAPTURE_CORE, issues, last.phase === "landed");
    return;
  }
  requirePhases(phaseSeq, BALLISTIC_CORE, issues);
}

function fuelInUnitRange(f: number): boolean {
  return f >= -1e-6 && f <= 1 + 1e-6;
}

/** Per-sample fuel / thrust range checks. */
function checkSampleScalars(cur: TrajectorySampleLike, issues: InvariantIssue[]): void {
  if (!fuelInUnitRange(cur.fuelBooster)) {
    pushIssue(issues, "fuel_booster_range", `booster fuel ${cur.fuelBooster} out of [0,1] at t=${cur.t}`);
  }
  if (!fuelInUnitRange(cur.fuelShip)) {
    pushIssue(issues, "fuel_ship_range", `ship fuel ${cur.fuelShip} out of [0,1] at t=${cur.t}`);
  }
  if (cur.thrustN < -1e-3) {
    pushIssue(issues, "thrust_negative", `negative thrust ${cur.thrustN} at t=${cur.t}`);
  }
}

/** Fuel must not increase; staged is sticky. */
function checkFuelAndStaged(
  cur: TrajectorySampleLike,
  prevFb: number,
  prevFs: number,
  everStaged: boolean,
  issues: InvariantIssue[],
): { prevFb: number; prevFs: number; everStaged: boolean } {
  if (cur.fuelBooster > prevFb + 1e-4) {
    pushIssue(issues, "fuel_booster_increase", `booster fuel rose ${prevFb} → ${cur.fuelBooster} at t=${cur.t}`);
  }
  if (cur.fuelShip > prevFs + 1e-4) {
    pushIssue(issues, "fuel_ship_increase", `ship fuel rose ${prevFs} → ${cur.fuelShip} at t=${cur.t}`);
  }
  if (everStaged && !cur.staged) pushIssue(issues, "unstaged", `staged flipped false at t=${cur.t}`);
  return { prevFb: cur.fuelBooster, prevFs: cur.fuelShip, everStaged: everStaged || cur.staged };
}

type StepStats = { maxStep: number; maxStepI: number; maxApparent: number };

function posStepKm(a: TrajectorySampleLike, b: TrajectorySampleLike): number {
  return Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y, b.pos.z - a.pos.z);
}

/** Time order + position step / apparent speed stats. */
function updateStepStats(
  prev: TrajectorySampleLike,
  cur: TrajectorySampleLike,
  i: number,
  stats: StepStats,
  issues: InvariantIssue[],
): void {
  if (cur.t + 1e-9 < prev.t) {
    pushIssue(issues, "time_order", `time went backwards at index ${i}: ${prev.t} → ${cur.t}`);
  }
  const step = posStepKm(prev, cur);
  if (step > stats.maxStep) { stats.maxStep = step; stats.maxStepI = i; }
  const apparent = step / Math.max(cur.t - prev.t, 1e-6);
  if (apparent > stats.maxApparent) stats.maxApparent = apparent;
}

function applyFuelState(
  state: { prevFb: number; prevFs: number; everStaged: boolean },
  next: { prevFb: number; prevFs: number; everStaged: boolean },
): void {
  state.prevFb = next.prevFb;
  state.prevFs = next.prevFs;
  state.everStaged = next.everStaged;
}

function walkOneSample(
  s: TrajectorySampleLike[],
  i: number,
  state: { prevFb: number; prevFs: number; everStaged: boolean },
  stats: StepStats,
  issues: InvariantIssue[],
): boolean {
  const cur = s[i]!;
  if (!Number.isFinite(cur.t) || !Number.isFinite(cur.pos.x)) {
    pushIssue(issues, "non_finite", `non-finite sample at index ${i}`);
    return false;
  }
  checkSampleScalars(cur, issues);
  applyFuelState(state, checkFuelAndStaged(cur, state.prevFb, state.prevFs, state.everStaged, issues));
  if (i > 0) updateStepStats(s[i - 1]!, cur, i, stats, issues);
  return true;
}

/** Walk all samples for fuel, staged, continuity. */
function checkSampleWalk(
  s: TrajectorySampleLike[],
  first: TrajectorySampleLike,
  issues: InvariantIssue[],
): StepStats {
  const state = { prevFb: first.fuelBooster, prevFs: first.fuelShip, everStaged: first.staged };
  const stats: StepStats = { maxStep: 0, maxStepI: 0, maxApparent: 0 };
  for (let i = 0; i < s.length; i++) {
    if (!walkOneSample(s, i, state, stats, issues)) break;
  }
  return stats;
}

function checkTrailJump(
  s: TrajectorySampleLike[],
  stats: StepStats,
  issues: InvariantIssue[],
): void {
  if (stats.maxStep <= MAX_STEP_KM) return;
  const a = s[stats.maxStepI - 1]!;
  const b = s[stats.maxStepI]!;
  const msg = `position jump ${stats.maxStep.toFixed(1)} km at index ${stats.maxStepI} (t ${a.t}→${b.t}, ${a.phase}→${b.phase}); cap ${MAX_STEP_KM} km`;
  pushIssue(issues, "trail_jump", msg);
}

/** Trail jump / apparent speed caps. */
function checkTrailLimits(
  s: TrajectorySampleLike[],
  stats: StepStats,
  issues: InvariantIssue[],
): void {
  checkTrailJump(s, stats, issues);
  if (stats.maxApparent > MAX_APPARENT_SPEED_KM_S) {
    pushIssue(issues, "apparent_speed", `max |Δr|/Δt = ${stats.maxApparent.toFixed(2)} km/s exceeds ${MAX_APPARENT_SPEED_KM_S}`);
  }
}

/** Staging by/after low Earth orbit. */
function checkStagingAfterLeo(
  s: TrajectorySampleLike[],
  issues: InvariantIssue[],
): void {
  const lowEarthOrbitIdx = s.findIndex((x) => x.phase === "lowEarthOrbit");
  if (lowEarthOrbitIdx < 0) return;
  const afterLeo = s.slice(lowEarthOrbitIdx + 10);
  if (afterLeo.length && !afterLeo.some((x) => x.staged)) {
    pushIssue(issues, "no_staging", "expected booster staged by/after low Earth orbit");
  }
}

/** Residual ship prop at coast start. */
function checkShipFuelAtCoast(
  s: TrajectorySampleLike[],
  issues: InvariantIssue[],
): void {
  const coast = s.find((x) => x.phase === "coast");
  if (coast && coast.fuelShip < 0.15) {
    pushIssue(
      issues,
      "ship_empty_early",
      `ship fuel at coast start is ${coast.fuelShip} (expected residual ≥0.15)`,
    );
  }
}

/** Optional minMoonAlt band. */
function checkMinMoonAltMeta(traj: TrajectoryLike, issues: InvariantIssue[]): void {
  if (traj.minMoonAlt == null) return;
  if (!Number.isFinite(traj.minMoonAlt)) {
    pushIssue(issues, "bad_min_moon_alt", `minMoonAlt must be finite, got ${traj.minMoonAlt}`);
    return;
  }
  if (traj.minMoonAlt < -R_MOON || traj.minMoonAlt > 500_000) {
    pushIssue(issues, "min_moon_alt_range", `minMoonAlt ${traj.minMoonAlt} km outside [-R_MOON, 500000]`);
  }
}

/** Optional peakSpeedKmS band. */
function checkPeakSpeedMeta(traj: TrajectoryLike, issues: InvariantIssue[]): void {
  if (traj.peakSpeedKmS == null) return;
  if (!Number.isFinite(traj.peakSpeedKmS) || traj.peakSpeedKmS < 0) {
    pushIssue(issues, "bad_peak_speed", `peakSpeedKmS must be finite ≥ 0, got ${traj.peakSpeedKmS}`);
    return;
  }
  if (traj.peakSpeedKmS > 80) {
    pushIssue(issues, "peak_speed_range", `peakSpeedKmS ${traj.peakSpeedKmS.toFixed(2)} km/s exceeds 80`);
  }
}

/** Optional stageT band. */
function checkStageTMeta(traj: TrajectoryLike, issues: InvariantIssue[]): void {
  if (traj.stageT === undefined || traj.stageT == null) return;
  if (!Number.isFinite(traj.stageT) || traj.stageT < 0) {
    pushIssue(issues, "bad_stage_t", `stageT must be finite ≥ 0 or null, got ${traj.stageT}`);
    return;
  }
  if (traj.stageT > traj.durationS + 1) {
    pushIssue(issues, "stage_t_range", `stageT ${traj.stageT} s exceeds durationS ${traj.durationS}`);
  }
}

/** v2+ packs require finite meta fields. */
function checkV2MetaRequired(traj: TrajectoryLike, issues: InvariantIssue[]): void {
  if (traj.version == null || traj.version < 2) return;
  if (traj.minMoonAlt == null || !Number.isFinite(traj.minMoonAlt)) {
    pushIssue(issues, "missing_min_moon_alt", "pack v2+ requires finite minMoonAlt");
  }
  if (traj.peakSpeedKmS == null || !Number.isFinite(traj.peakSpeedKmS)) {
    pushIssue(issues, "missing_peak_speed", "pack v2+ requires finite peakSpeedKmS");
  }
  if (!("stageT" in traj)) pushIssue(issues, "missing_stage_t", "pack v2+ requires stageT (number | null)");
}

/** Optional pre-LOI perilune / B-plane miss (B2 targeting). */
function checkBplaneMeta(traj: TrajectoryLike, issues: InvariantIssue[]): void {
  if (traj.periluneAltKm != null) {
    if (!Number.isFinite(traj.periluneAltKm)) {
      pushIssue(issues, "bad_perilune_alt", `periluneAltKm must be finite, got ${traj.periluneAltKm}`);
    } else if (traj.periluneAltKm < -R_MOON || traj.periluneAltKm > 500_000) {
      pushIssue(issues, "perilune_alt_range", `periluneAltKm ${traj.periluneAltKm} km outside [-R_MOON, 500000]`);
    }
  }
  if (traj.bPlaneMissKm != null) {
    if (!Number.isFinite(traj.bPlaneMissKm) || traj.bPlaneMissKm < 0) {
      pushIssue(issues, "bad_bplane_miss", `bPlaneMissKm must be finite ≥ 0, got ${traj.bPlaneMissKm}`);
    }
  }
}

/** Optional pack metadata (v2+ bands + required fields). */
function checkPackMeta(traj: TrajectoryLike, issues: InvariantIssue[]): void {
  checkMinMoonAltMeta(traj, issues);
  checkPeakSpeedMeta(traj, issues);
  checkStageTMeta(traj, issues);
  checkV2MetaRequired(traj, issues);
  checkBplaneMeta(traj, issues);
}

function checkSampleContinuity(
  s: TrajectorySampleLike[], first: TrajectorySampleLike, issues: InvariantIssue[],
): void {
  checkTrailLimits(s, checkSampleWalk(s, first, issues), issues);
  checkStagingAfterLeo(s, issues);
  checkShipFuelAtCoast(s, issues);
}

function checkSamplesBody(traj: TrajectoryLike, issues: InvariantIssue[]): void {
  const s = traj.samples;
  if (s.length === 0) return;
  const first = s[0]!; const last = s[s.length - 1]!;
  checkStartSample(first, issues);
  checkEndSample(last, traj.durationS, issues);
  checkPhaseSequence(s, last, issues);
  checkSampleContinuity(s, first, issues);
  checkPackMeta(traj, issues);
}

export function checkTrajectoryInvariants(traj: TrajectoryLike): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  checkOkAndCount(traj, issues);
  checkDuration(traj, issues);
  checkSamplesBody(traj, issues);
  return issues;
}

/** Throw AggregateError-style message if any invariant fails. */
export function assertTrajectoryInvariants(traj: TrajectoryLike): void {
  const issues = checkTrajectoryInvariants(traj);
  if (issues.length === 0) return;
  const lines = issues.map((i) => `  [${i.code}] ${i.message}`);
  throw new Error(
    `Trajectory invariant failures (${issues.length}):\n${lines.join("\n")}`,
  );
}

type PackedSampleRow = {
  t: number;
  p: number[];
  v: number[];
  phase: string;
  burning: boolean;
  fb?: number;
  fs?: number;
  th?: number;
  st?: boolean;
};

function defaultStaged(s: PackedSampleRow): boolean {
  return s.phase !== "launch" && s.phase !== "ascent" && (s.fb ?? 0) < 1e-6;
}

/** Map a packed sample row to TrajectorySampleLike. */
function unpackPackedSample(s: PackedSampleRow): TrajectorySampleLike {
  return {
    t: s.t,
    pos: { x: s.p[0]!, y: s.p[1]!, z: s.p[2]! },
    vel: { x: s.v[0]!, y: s.v[1]!, z: s.v[2]! },
    phase: s.phase, burning: s.burning,
    fuelBooster: s.fb ?? 0, fuelShip: s.fs ?? 1,
    thrustN: (s.th ?? 0) * 1000, staged: s.st ?? defaultStaged(s),
  };
}

/** Adapt packed precompute JSON to TrajectoryLike. */
export function unpackPackedForInvariants(packed: {
  ok: boolean;
  durationS: number;
  message: string;
  version?: number;
  minMoonAlt?: number;
  peakSpeedKmS?: number;
  stageT?: number | null;
  samples: PackedSampleRow[];
  periluneAltKm?: number;
  bPlaneMissKm?: number;
}): TrajectoryLike {
  return { ok: packed.ok, durationS: packed.durationS, message: packed.message, version: packed.version, minMoonAlt: packed.minMoonAlt, peakSpeedKmS: packed.peakSpeedKmS, stageT: packed.stageT, periluneAltKm: packed.periluneAltKm, bPlaneMissKm: packed.bPlaneMissKm, samples: packed.samples.map(unpackPackedSample) };
}

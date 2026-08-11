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

export function checkTrajectoryInvariants(
  traj: TrajectoryLike,
): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  const s = traj.samples;

  if (!traj.ok) {
    issues.push({ code: "not_ok", message: `mission not ok: ${traj.message}` });
  }
  if (s.length < MIN_SAMPLES) {
    issues.push({
      code: "too_few_samples",
      message: `expected ≥${MIN_SAMPLES} samples, got ${s.length}`,
    });
  }
  if (!(traj.durationS > 0) || !Number.isFinite(traj.durationS)) {
    issues.push({
      code: "bad_duration",
      message: `durationS must be finite > 0, got ${traj.durationS}`,
    });
  } else {
    const hours = traj.durationS / 3600;
    if (hours < MIN_DURATION_H || hours > MAX_DURATION_H) {
      issues.push({
        code: "duration_range",
        message: `duration ${hours.toFixed(2)} h outside [${MIN_DURATION_H}, ${MAX_DURATION_H}] h`,
      });
    }
  }

  if (s.length === 0) return issues;

  const first = s[0]!;
  const last = s[s.length - 1]!;

  if (first.t > 1e-6) {
    issues.push({
      code: "start_t",
      message: `first sample t should be ~0, got ${first.t}`,
    });
  }
  if (first.phase !== "launch" && first.phase !== "ascent") {
    issues.push({
      code: "start_phase",
      message: `first phase should be launch/ascent, got ${first.phase}`,
    });
  }
  if (first.staged) {
    issues.push({
      code: "start_staged",
      message: "first sample should not be staged",
    });
  }
  if (
    last.phase !== "landed" &&
    last.phase !== "impact" &&
    last.phase !== "coast"
  ) {
    issues.push({
      code: "end_phase",
      message: `last phase should be landed/impact/coast, got ${last.phase}`,
    });
  }
  if (!last.staged) {
    issues.push({
      code: "end_staged",
      message: "last sample should be staged (ship only)",
    });
  }
  if (Math.abs(last.t - traj.durationS) > 1) {
    issues.push({
      code: "end_t",
      message: `last.t (${last.t}) should match durationS (${traj.durationS})`,
    });
  }

  // Phase sequence: unique phases in order must be a subsequence of expected
  // (capture arc) or ballistic fallback (launch→…→coast[→impact]).
  const phaseSeq: string[] = [];
  for (const sample of s) {
    if (phaseSeq.length === 0 || phaseSeq[phaseSeq.length - 1] !== sample.phase) {
      phaseSeq.push(sample.phase);
    }
  }
  const expected = EXPECTED_PHASE_ORDER as readonly string[];
  const endOk = EXPECTED_END_PHASES.includes(
    phaseSeq[phaseSeq.length - 1] as PhaseId,
  );
  const ballisticCore = [
    "launch",
    "ascent",
    "lowEarthOrbit",
    "translunarInjection",
    "coast",
  ];
  const isCapture = phaseSeq.includes("approach") || phaseSeq.includes("landed");
  const coreCheck = isCapture
    ? expected
    : ballisticCore;

  let ei = 0;
  let orderOk = true;
  for (const p of phaseSeq) {
    if (p === "impact" && !isCapture) continue; // optional ballistic terminal
    const idx = coreCheck.indexOf(p as PhaseId, ei);
    if (idx < 0) {
      // Allow impact only as terminal after coast on ballistic packs
      if (p === "impact" && phaseSeq[phaseSeq.length - 1] === "impact") continue;
      orderOk = false;
      break;
    }
    ei = idx + 1;
  }
  if (!orderOk || phaseSeq[0] !== "launch" || !endOk) {
    issues.push({
      code: "phase_order",
      message: `phase sequence ${phaseSeq.join(" → ")} does not match capture or ballistic arc`,
    });
  }
  // Capture packs must include LOI → land core; ballistic must include coast
  if (isCapture) {
    for (const need of [
      "coast",
      "approach",
      "braking",
      "descent",
      "landed",
    ] as const) {
      if (!phaseSeq.includes(need) && last.phase === "landed") {
        issues.push({
          code: "missing_phase",
          message: `missing phase ${need}`,
        });
      }
    }
  } else {
    for (const need of ballisticCore) {
      if (!phaseSeq.includes(need)) {
        issues.push({
          code: "missing_phase",
          message: `missing phase ${need}`,
        });
      }
    }
  }

  let prevFb = first.fuelBooster;
  let prevFs = first.fuelShip;
  let everStaged = first.staged;
  let maxStep = 0;
  let maxStepI = 0;
  let maxApparent = 0;

  for (let i = 0; i < s.length; i++) {
    const cur = s[i]!;

    if (!Number.isFinite(cur.t) || !Number.isFinite(cur.pos.x)) {
      issues.push({
        code: "non_finite",
        message: `non-finite sample at index ${i}`,
      });
      break;
    }

    if (cur.fuelBooster < -1e-6 || cur.fuelBooster > 1 + 1e-6) {
      issues.push({
        code: "fuel_booster_range",
        message: `booster fuel ${cur.fuelBooster} out of [0,1] at t=${cur.t}`,
      });
    }
    if (cur.fuelShip < -1e-6 || cur.fuelShip > 1 + 1e-6) {
      issues.push({
        code: "fuel_ship_range",
        message: `ship fuel ${cur.fuelShip} out of [0,1] at t=${cur.t}`,
      });
    }
    if (cur.thrustN < -1e-3) {
      issues.push({
        code: "thrust_negative",
        message: `negative thrust ${cur.thrustN} at t=${cur.t}`,
      });
    }

    // Fuel should not increase (bookkeeping is drain-only)
    if (cur.fuelBooster > prevFb + 1e-4) {
      issues.push({
        code: "fuel_booster_increase",
        message: `booster fuel rose ${prevFb} → ${cur.fuelBooster} at t=${cur.t}`,
      });
    }
    if (cur.fuelShip > prevFs + 1e-4) {
      issues.push({
        code: "fuel_ship_increase",
        message: `ship fuel rose ${prevFs} → ${cur.fuelShip} at t=${cur.t}`,
      });
    }
    prevFb = cur.fuelBooster;
    prevFs = cur.fuelShip;

    // staged is sticky
    if (everStaged && !cur.staged) {
      issues.push({
        code: "unstaged",
        message: `staged flipped false at t=${cur.t}`,
      });
    }
    if (cur.staged) everStaged = true;

    if (i === 0) continue;

    const prev = s[i - 1]!;
    if (cur.t + 1e-9 < prev.t) {
      issues.push({
        code: "time_order",
        message: `time went backwards at index ${i}: ${prev.t} → ${cur.t}`,
      });
    }

    const dx = cur.pos.x - prev.pos.x;
    const dy = cur.pos.y - prev.pos.y;
    const dz = cur.pos.z - prev.pos.z;
    const step = Math.hypot(dx, dy, dz);
    if (step > maxStep) {
      maxStep = step;
      maxStepI = i;
    }
    const dt = Math.max(cur.t - prev.t, 1e-6);
    const apparent = step / dt;
    if (apparent > maxApparent) maxApparent = apparent;
  }

  if (maxStep > MAX_STEP_KM) {
    const a = s[maxStepI - 1]!;
    const b = s[maxStepI]!;
    issues.push({
      code: "trail_jump",
      message: `position jump ${maxStep.toFixed(1)} km at index ${maxStepI} (t ${a.t}→${b.t}, ${a.phase}→${b.phase}); cap ${MAX_STEP_KM} km`,
    });
  }
  if (maxApparent > MAX_APPARENT_SPEED_KM_S) {
    issues.push({
      code: "apparent_speed",
      message: `max |Δr|/Δt = ${maxApparent.toFixed(2)} km/s exceeds ${MAX_APPARENT_SPEED_KM_S}`,
    });
  }

  // Staging should happen once we're past ascent (by low Earth orbit insert in this theater)
  const lowEarthOrbitIdx = s.findIndex((x) => x.phase === "lowEarthOrbit");
  if (lowEarthOrbitIdx >= 0) {
    const afterLeo = s.slice(lowEarthOrbitIdx + 10);
    if (afterLeo.length && !afterLeo.some((x) => x.staged)) {
      issues.push({
        code: "no_staging",
        message: "expected booster staged by/after low Earth orbit",
      });
    }
  }

  // Ship should retain some prop after translunar injection (mass-coupled pure RE burns hard)
  const coast = s.find((x) => x.phase === "coast");
  if (coast && coast.fuelShip < 0.15) {
    issues.push({
      code: "ship_empty_early",
      message: `ship fuel at coast start is ${coast.fuelShip} (expected residual ≥0.15)`,
    });
  }

  // Optional pack metadata (v2+): finite bands so complete-card stats stay honest
  if (traj.minMoonAlt != null) {
    if (!Number.isFinite(traj.minMoonAlt)) {
      issues.push({
        code: "bad_min_moon_alt",
        message: `minMoonAlt must be finite, got ${traj.minMoonAlt}`,
      });
    } else if (traj.minMoonAlt < -R_MOON || traj.minMoonAlt > 500_000) {
      issues.push({
        code: "min_moon_alt_range",
        message: `minMoonAlt ${traj.minMoonAlt} km outside [-R_MOON, 500000]`,
      });
    }
  }
  if (traj.peakSpeedKmS != null) {
    if (!Number.isFinite(traj.peakSpeedKmS) || traj.peakSpeedKmS < 0) {
      issues.push({
        code: "bad_peak_speed",
        message: `peakSpeedKmS must be finite ≥ 0, got ${traj.peakSpeedKmS}`,
      });
    } else if (traj.peakSpeedKmS > 80) {
      // Heliocentric low Earth orbit/ translunar injection peaks ~30–40 km/s; 80 is a hard ceiling
      issues.push({
        code: "peak_speed_range",
        message: `peakSpeedKmS ${traj.peakSpeedKmS.toFixed(2)} km/s exceeds 80`,
      });
    }
  }
  if (traj.stageT !== undefined && traj.stageT != null) {
    if (!Number.isFinite(traj.stageT) || traj.stageT < 0) {
      issues.push({
        code: "bad_stage_t",
        message: `stageT must be finite ≥ 0 or null, got ${traj.stageT}`,
      });
    } else if (traj.stageT > traj.durationS + 1) {
      issues.push({
        code: "stage_t_range",
        message: `stageT ${traj.stageT} s exceeds durationS ${traj.durationS}`,
      });
    }
  }
  // v2 packs must ship the new meta fields
  if (traj.version != null && traj.version >= 2) {
    if (traj.minMoonAlt == null || !Number.isFinite(traj.minMoonAlt)) {
      issues.push({
        code: "missing_min_moon_alt",
        message: "pack v2+ requires finite minMoonAlt",
      });
    }
    if (traj.peakSpeedKmS == null || !Number.isFinite(traj.peakSpeedKmS)) {
      issues.push({
        code: "missing_peak_speed",
        message: "pack v2+ requires finite peakSpeedKmS",
      });
    }
    if (!("stageT" in traj)) {
      issues.push({
        code: "missing_stage_t",
        message: "pack v2+ requires stageT (number | null)",
      });
    }
  }

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

/** Adapt packed precompute JSON to TrajectoryLike. */
export function unpackPackedForInvariants(packed: {
  ok: boolean;
  durationS: number;
  message: string;
  version?: number;
  minMoonAlt?: number;
  peakSpeedKmS?: number;
  stageT?: number | null;
  samples: Array<{
    t: number;
    p: number[];
    v: number[];
    phase: string;
    burning: boolean;
    fb?: number;
    fs?: number;
    th?: number;
    st?: boolean;
  }>;
}): TrajectoryLike {
  return {
    ok: packed.ok,
    durationS: packed.durationS,
    message: packed.message,
    version: packed.version,
    minMoonAlt: packed.minMoonAlt,
    peakSpeedKmS: packed.peakSpeedKmS,
    stageT: packed.stageT,
    samples: packed.samples.map((s) => ({
      t: s.t,
      pos: { x: s.p[0]!, y: s.p[1]!, z: s.p[2]! },
      vel: { x: s.v[0]!, y: s.v[1]!, z: s.v[2]! },
      phase: s.phase,
      burning: s.burning,
      fuelBooster: s.fb ?? 0,
      fuelShip: s.fs ?? 1,
      thrustN: (s.th ?? 0) * 1000,
      staged:
        s.st ??
        (s.phase !== "launch" && s.phase !== "ascent" && (s.fb ?? 0) < 1e-6),
    })),
  };
}

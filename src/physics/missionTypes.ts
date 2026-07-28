/**
 * Shared mission trajectory types and phase labels.
 *
 * Samples are the time series baked into `trajectory.json` (or live-recomputed).
 * Phase ids drive the scrubber, HUD, and callouts.
 */

import type { V3 } from "./vec3";

/**
 * Discrete mission phases along the theater arc.
 * Ballistic free-coast missions end in `coast` or `impact` (no LOI/PDI).
 * Capture missions may use approach → braking → descent → landed.
 */
export type PhaseId =
  | "launch"
  | "ascent"
  | "leo"
  | "tli"
  | "coast"
  | "approach"
  | "braking"
  | "descent"
  | "landed"
  /** Ballistic lunar surface impact (no capture burns after TLI). */
  | "impact";

/** One trajectory sample at mission time `t` (s). */
export type Sample = {
  /** Mission time (s) from liftoff. */
  t: number;
  /** Inertial position (km). */
  pos: V3;
  /** Inertial velocity (km/s). */
  vel: V3;
  phase: PhaseId;
  burning: boolean;
  /** Booster propellant remaining (0–1) */
  fuelBooster: number;
  /** Ship propellant remaining (0–1) */
  fuelShip: number;
  /** Thrust force (N); 0 when idle */
  thrustN: number;
  /** True after booster stage-out at LEO insert */
  staged: boolean;
};

/** Result of a full mission integration / precompute pack metadata. */
export type MissionResult = {
  samples: Sample[];
  durationS: number;
  moonPhase0: number;
  tliDv: number;
  minMoonAlt: number;
  ok: boolean;
  message: string;
  /**
   * Mission time t used as Horizons τ=0 while baking samples. Playback must
   * call setMissionLandingT with this value so Earth/Moon stay under the craft.
   */
  horizonsLandingT?: number;
  /** Max |r_N-body − r_Kepler| (km) on the TLI coast, if computed */
  keplerRefMaxDevKm?: number;
  /** Discrete midcourse corrections executed during coast */
  tcmCount?: number;
  /** Total TCM |Δv| (km/s) */
  tcmTotalDv?: number;
};

const PHASE_LABELS: Record<PhaseId, string> = {
  launch: "Liftoff · Starbase",
  ascent: "Ascent to LEO",
  leo: "LEO",
  tli: "Trans-lunar injection",
  coast: "Trans-lunar coast (ballistic)",
  approach: "LOI · capture burn",
  braking: "LLO coast",
  descent: "PDI · powered descent",
  landed: "Landed · south pole",
  impact: "Lunar impact (ballistic)",
};

/** Human-readable phase label for HUD / timeline. */
export function phaseLabel(id: PhaseId): string {
  return PHASE_LABELS[id];
}

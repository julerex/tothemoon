/**
 * Shared mission trajectory types and phase labels.
 *
 * Samples are the time series baked into `trajectory.json` (or live-recomputed).
 * Phase ids drive the scrubber, HUD, and callouts.
 */

import type { V3 } from "./vec3";

/**
 * Discrete mission phases along the theater arc.
 * Ballistic free-coast missions end in `coast` or `impact`
 * (no lunar orbit insertion / powered descent).
 * Capture missions may use approach → braking → descent → landed.
 */
export type PhaseId =
  | "launch"
  | "ascent"
  | "lowEarthOrbit"
  | "translunarInjection"
  | "coast"
  | "approach"
  | "braking"
  | "descent"
  | "landed"
  /** Ballistic lunar surface impact (no capture burns after translunar injection). */
  | "impact"
  /** Atmospheric entry (flight-test / reentry theater). */
  | "entry"
  /** Soft ocean splashdown complete (flight-test terminal). */
  | "splashdown";

/**
 * One trajectory sample at mission time `t` (s).
 *
 * Mutable because the integrator fills samples while flying. Consumers of a
 * finished pack should take {@link ReadonlySample} instead, so a trail or HUD
 * cannot write back into baked physics.
 */
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
  /** True after booster stage-out at low Earth orbit insert */
  staged: boolean;
};

/**
 * Read-only view of a baked {@link Sample}, vectors included.
 *
 * `Sample` is assignable to this, so producers keep writing plain samples and
 * only the consumer signature changes.
 */
export type ReadonlySample = Readonly<
  Omit<Sample, "pos" | "vel"> & {
    pos: Readonly<V3>;
    vel: Readonly<V3>;
  }
>;

/** Result of a full mission integration / precompute pack metadata. */
export type MissionResult = {
  samples: Sample[];
  durationS: number;
  moonPhase0: number;
  translunarInjectionDeltaV: number;
  minMoonAlt: number;
  ok: boolean;
  message: string;
  /**
   * Mission time t used as Horizons τ=0 while baking samples. Playback must
   * set EphemerisEpoch.horizonsLandingT to this so Earth/Moon stay under the craft.
   */
  horizonsLandingT?: number;
  /** Peak inertial |v| (km/s) over samples — packed into trajectory.json v2+ */
  peakSpeedKmS?: number;
  /** Mission time (s) of booster stage-out — packed into trajectory.json v2+ */
  stageT?: number | null;
  /** Max |r_N-body − r_Kepler| (km) on the Translunar injection coast, if computed */
  keplerRefMaxDevKm?: number;
  /** Discrete midcourse corrections executed during coast */
  trajectoryCorrectionCount?: number;
  /** Total trajectory correction |Δv| (km/s) */
  trajectoryCorrectionTotalDeltaV?: number;
  /** Peak RK4 step-doubling |Δr| (km) inside ~250_000 km of the Moon */
  maxNearMoonStepErrKm?: number;
  /** Peak |ΔE/E| of Moon-relative energy on the same doubling samples */
  maxMoonEnergyRelResidual?: number;
};

const PHASE_LABELS: Record<PhaseId, string> = {
  launch: "Liftoff · Starbase",
  ascent: "Ascent to low Earth orbit",
  lowEarthOrbit: "Low Earth orbit",
  translunarInjection: "Translunar injection",
  coast: "Translunar coast (ballistic)",
  approach: "Lunar orbit insertion · capture burn",
  braking: "Low lunar orbit coast",
  descent: "Powered descent initiation",
  landed: "Landed · south pole",
  impact: "Lunar impact (ballistic)",
  entry: "Atmospheric entry",
  splashdown: "Splashdown · Indian Ocean",
};

/** Human-readable phase label for HUD / timeline. */
export function phaseLabel(id: PhaseId): string {
  return PHASE_LABELS[id];
}

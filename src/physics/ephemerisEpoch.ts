/**
 * Explicit mission ephemeris context (Moon/Sun phases, Horizons map, clock).
 *
 * Replaces module-level setters (`setMoonPhase0`, `setMissionLandingT`, …).
 * Pass one immutable {@link EphemerisEpoch} through body / integrator / pad APIs.
 *
 * Factories:
 * - {@link makeLunarEpoch} in `./missionEpoch`
 * - {@link makeFlight13Epoch} in `./flight13Epoch`
 */

import { hasHorizonsTable } from "./horizonsEpoch";

/**
 * Immutable ephemeris + mission-clock map for one integrate / theater session.
 *
 * - **Lunar:** `useHorizons` true when the DE441 table is available; `clockUtcMsAtT0` null
 *   so wall time is landing-relative (`LANDING_UTC` at `horizonsLandingT`).
 * - **Flight 13:** `useHorizons` false; `clockUtcMsAtT0` pins t=0 to launch window UTC.
 */
export type EphemerisEpoch = Readonly<{
  /** Moon mean anomaly at mission t = 0 (rad). Analytic Kepler path. */
  moonPhase0: number;
  /**
   * Earth mean ecliptic longitude at t = 0 (rad) — heliocentric angle of the
   * EM barycenter about the Sun (analytic fallback).
   */
  sunPhase0: number;
  /**
   * Mission time (s) at which Horizons τ = 0 (landing). Also used as the
   * landing-relative clock map when `clockUtcMsAtT0` is null.
   */
  horizonsLandingT: number;
  /**
   * Prefer the packed Horizons sample table when in range.
   * Flight 13 sets false (table is the July 2027 lunar window only).
   */
  useHorizons: boolean;
  /**
   * When non-null, mission t = 0 maps to this absolute UTC (ms) — Flight 13
   * launch window. Null → lunar landing-relative mission clock.
   */
  clockUtcMsAtT0: number | null;
}>;

/** Default analytic epoch (no Horizons, classic sunPhase0 = π). */
export const DEFAULT_EPHEMERIS: EphemerisEpoch = Object.freeze({
  moonPhase0: 0,
  sunPhase0: Math.PI,
  horizonsLandingT: 0,
  useHorizons: false,
  clockUtcMsAtT0: null,
});

/**
 * True when this epoch should interpolate the Horizons sample table.
 * Requires both the flag and a loaded pack with ≥2 samples.
 */
export function epochUsesHorizons(epoch: EphemerisEpoch): boolean {
  return epoch.useHorizons && hasHorizonsTable();
}

/** Re-export table probe for callers that only need pack presence. */
export { hasHorizonsTable };

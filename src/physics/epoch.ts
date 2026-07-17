/**
 * Mission calendar epoch — July 2027 theater.
 *
 * Landing is fixed at 2027-07-20 12:00 UTC. Relative Sun–Earth–Moon geometry
 * is tuned to that date:
 *
 * - Full Moon / penumbral lunar eclipse greatest: 2027-07-18 16:02:53 UTC
 *   (NASA/Wikipedia LE2027Jul18N).
 * - On landing day the Moon is a waning gibbous ~1.83 d past full
 *   (≈97% illuminated; TheSkyLive ~96.9% on 2027-07-20).
 * - Apparent solar ecliptic longitude ≈ 117.6° (USNO low-precision formula).
 *
 * The circular ephemeris matches elongation (phase angle), not full JPL DE.
 */

import { N_EARTH_SUN, N_MOON } from "./constants";

/** Touchdown epoch (UTC). */
export const LANDING_UTC_MS = Date.UTC(2027, 6, 20, 12, 0, 0);

/**
 * Full-Moon reference: penumbral eclipse greatest eclipse
 * 2027-07-18 16:02:53 UTC.
 */
export const FULL_MOON_UTC_MS = Date.UTC(2027, 6, 18, 16, 2, 53);

/** Mean synodic month (s) — for elongation past full. */
export const SYNODIC_MONTH_S = 29.530588853 * 86400;

/** Days from full Moon to landing epoch. */
export function daysPastFullAtLanding(): number {
  return (LANDING_UTC_MS - FULL_MOON_UTC_MS) / 86_400_000;
}

/**
 * Moon elongation past opposition at landing (rad).
 * Full = π between Earth→Sun and Earth→Moon; waning adds this δ.
 */
export function moonElongationPastFullRad(): number {
  return (daysPastFullAtLanding() * 2 * Math.PI) / 29.530588853;
}

/**
 * Approximate geocentric solar ecliptic longitude (rad) at landing,
 * USNO low-precision algorithm (good to ~1′).
 */
export function sunEclipticLongitudeAtLanding(): number {
  // JD for 2027-07-20 12:00 UTC
  const jd = 2_461_607.0;
  const d = jd - 2_451_545.0;
  const g = ((357.529 + 0.985_600_28 * d) * Math.PI) / 180;
  const q = 280.459 + 0.985_647_36 * d;
  const L = q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g);
  return (((L % 360) + 360) % 360) * (Math.PI / 180);
}

/**
 * Sun inertial angle offset at mission t = 0 so that at `landingT`
 * Earth→Moon is π + δ ahead of Earth→Sun (waning gibbous, July 2027).
 *
 * Model angles (see bodyPositions):
 *   θ_m = moonPhase0 + N_MOON · t
 *   θ_s = sunPhase0  + N_EARTH_SUN · t
 * Want θ_m − θ_s = π + δ at t = landingT.
 */
export function sunPhase0ForLanding(
  moonPhase0: number,
  landingT: number,
): number {
  const δ = moonElongationPastFullRad();
  return moonPhase0 + (N_MOON - N_EARTH_SUN) * landingT - Math.PI - δ;
}

/** UTC ms for a mission clock time, with t = durationS at landing. */
export function missionUtcMs(missionT: number, durationS: number): number {
  return LANDING_UTC_MS - durationS * 1000 + missionT * 1000;
}

/** Compact UTC label for the HUD, e.g. "2027-07-20 11:42 UTC". */
export function formatMissionDateUtc(
  missionT: number,
  durationS: number,
): string {
  const d = new Date(missionUtcMs(missionT, durationS));
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi} UTC`;
}

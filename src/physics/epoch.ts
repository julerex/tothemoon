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
 * Preferred runtime ephemeris: JPL Horizons DE441 samples in
 * `horizons-epoch.json`. Analytic sunPhase0 / Kepler Moon is the fallback.
 */

import { N_EARTH_SUN } from "./constants";
import { moonEclipticLongitude } from "./bodies";

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
 * Earth mean longitude offset at mission t = 0 so that at `landingT`
 * the ecliptic elongation is a waning gibbous (July 2027).
 *
 * Heliocentric frame: EM barycenter at angle θ_e about the Sun; Earth→Sun
 * points toward the origin (angle θ_e + π). Moon ecliptic longitude λ_m
 * (Earth→Moon from the Keplerian orbit):
 *   full:      λ_m = θ_e
 *   waning +δ: λ_m = θ_e + δ
 *   θ_e = sunPhase0 + N_EARTH_SUN · landingT
 *   sunPhase0 = λ_m − δ − N_EARTH_SUN · landingT
 */
export function sunPhase0ForLanding(
  moonPhase0: number,
  landingT: number,
): number {
  const δ = moonElongationPastFullRad();
  const λm = moonEclipticLongitude(landingT, moonPhase0);
  return λm - δ - N_EARTH_SUN * landingT;
}

/**
 * Absolute UTC (ms) for a mission clock time.
 *
 * Horizons τ = 0 is fixed at {@link LANDING_UTC_MS}. Mission time maps as
 * `τ = missionT − landingMissionT`, so pass the packed `horizonsLandingT`
 * (not necessarily mission duration — flyby coasts can continue past τ = 0).
 */
export function missionUtcMs(
  missionT: number,
  landingMissionT: number,
): number {
  return LANDING_UTC_MS + (missionT - landingMissionT) * 1000;
}

/** Compact UTC label for the HUD, e.g. "2027-07-20 11:42 UTC". */
export function formatMissionDateUtc(
  missionT: number,
  landingMissionT: number,
): string {
  const d = new Date(missionUtcMs(missionT, landingMissionT));
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi} UTC`;
}

/**
 * Greenwich Mean Sidereal Time (rad) at a UTC instant.
 * USNO/Meeus low-precision — plenty for theater pad lighting and launch azimuth.
 * Mesh spin equals Greenwich mean sidereal time: lon 0° → mesh +X → equinox when Greenwich mean sidereal time = 0 (see earthFrame).
 */
export function greenwichMeanSiderealTimeRad(utcMs: number): number {
  // Unix epoch 1970-01-01T00:00:00Z = JD 2440587.5
  const jd = utcMs / 86_400_000 + 2_440_587.5;
  const d = jd - 2_451_545.0; // days from J2000.0
  const T = d / 36_525;
  // Greenwich mean sidereal time in degrees (includes fractional day via d)
  let deg =
    280.460_618_37 +
    360.985_647_366_29 * d +
    0.000_387_933 * T * T -
    (T * T * T) / 38_710_000;
  deg = ((deg % 360) + 360) % 360;
  return (deg * Math.PI) / 180;
}

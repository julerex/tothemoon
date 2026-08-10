/**
 * Mission calendar epochs.
 *
 * **Lunar theater:** landing fixed at 2027-07-20 12:00 UTC. Relative
 * Sun–Earth–Moon geometry is tuned to that date (waning gibbous Moon).
 * Preferred runtime ephemeris: JPL Horizons DE441 in `horizons-epoch.json`.
 *
 * **Flight 13:** liftoff at the public window open (theater) — 2026-07-23
 * 22:45 UTC = 5:45 p.m. CDT — so Starbase is in daytime. Uses analytic
 * Earth/Sun (Horizons table is the July 2027 lunar window only).
 */

import { N_EARTH_SUN } from "./constants";
import { moonEclipticLongitude } from "./bodies";

/** Touchdown epoch (UTC) — lunar mission Horizons τ = 0. */
export const LANDING_UTC_MS = Date.UTC(2027, 6, 20, 12, 0, 0);

/**
 * Flight 13 theater liftoff (UTC).
 * Public window: 5:45 p.m. CT (CDT = UTC−5 in July) → 22:45 UTC, 2026-07-23.
 * See docs/STARSHIP_13.md.
 */
export const FLIGHT13_LIFTOFF_UTC_MS = Date.UTC(2026, 6, 23, 22, 45, 0);

/**
 * When set, {@link missionUtcMs} maps mission t=0 to this UTC (ms) and
 * advances with mission time. Used by Flight 13 so pad lighting / GMST match
 * the launch window. Null → lunar landing-relative mapping.
 */
let clockEpochUtcMs: number | null = null;

/** Pin mission clock t = 0 to an absolute UTC (Flight 13 launch). */
export function setMissionClockEpochUtc(utcMsAtT0: number): void {
  clockEpochUtcMs = utcMsAtT0;
}

/** Restore landing-relative mission clock (lunar theater default). */
export function clearMissionClockEpochUtc(): void {
  clockEpochUtcMs = null;
}

export function getMissionClockEpochUtc(): number | null {
  return clockEpochUtcMs;
}

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
 * Approximate geocentric solar ecliptic longitude (rad) at a UTC instant,
 * USNO low-precision algorithm (good to ~1′).
 */
export function sunEclipticLongitudeAtUtc(utcMs: number): number {
  const jd = utcMs / 86_400_000 + 2_440_587.5;
  const d = jd - 2_451_545.0;
  const g = ((357.529 + 0.985_600_28 * d) * Math.PI) / 180;
  const q = 280.459 + 0.985_647_36 * d;
  const L = q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g);
  return (((L % 360) + 360) % 360) * (Math.PI / 180);
}

/** Solar ecliptic longitude at the lunar landing epoch. */
export function sunEclipticLongitudeAtLanding(): number {
  return sunEclipticLongitudeAtUtc(LANDING_UTC_MS);
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
 * - If {@link setMissionClockEpochUtc} is active (Flight 13):  
 *   `utc = epochUtc + missionT · 1000`
 * - Else (lunar): Horizons τ = 0 at {@link LANDING_UTC_MS};  
 *   `utc = LANDING_UTC + (missionT − landingMissionT) · 1000`
 */
export function missionUtcMs(
  missionT: number,
  landingMissionT: number,
): number {
  if (clockEpochUtcMs != null) {
    return clockEpochUtcMs + missionT * 1000;
  }
  return LANDING_UTC_MS + (missionT - landingMissionT) * 1000;
}

/**
 * Analytic `sunPhase0` so Earth–Sun season matches `utcMs` at mission t = 0.
 *
 * Heliocentric Earth angle θ_e; geocentric solar longitude ≈ θ_e + π,
 * so sunPhase0 = L_sun − π.
 */
export function sunPhase0ForUtc(utcMs: number): number {
  return sunEclipticLongitudeAtUtc(utcMs) - Math.PI;
}

/** Flight 13: sunPhase0 for daytime Starbase launch (public window open). */
export function sunPhase0ForFlight13Liftoff(): number {
  return sunPhase0ForUtc(FLIGHT13_LIFTOFF_UTC_MS);
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

/**
 * Mission calendar epochs.
 *
 * **Lunar theater:** landing fixed at 2027-07-20 12:00 UTC. Relative
 * Sun–Earth–Moon geometry is tuned to that date (waning gibbous Moon).
 * Preferred runtime ephemeris: JPL Horizons DE441 in `horizons-epoch.json`.
 *
 * **Flight 13:** liftoff at the public window open (theater) — 2026-07-23
 * 22:45 UTC = 5:45 p.m. CDT — so Starbase is in daytime. Uses analytic
 * Earth/Sun (Horizons table is the July 2027 lunar window only) plus a
 * small sun-phase nudge so splash is webcast daylight.
 *
 * Pure: wall-clock mapping takes an explicit UTC epoch or landing map —
 * no module mutable state.
 */

import { N_EARTH_SUN } from "./constants";
import { moonEclipticLongitude } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";

/** Touchdown epoch (UTC) — lunar mission Horizons τ = 0. */
export const LANDING_UTC_MS = Date.UTC(2027, 6, 20, 12, 0, 0);

/**
 * Flight 13 theater liftoff (UTC).
 * Public window: 5:45 p.m. CT (CDT = UTC−5 in July) → 22:45 UTC, 2026-07-23.
 * See docs/STARSHIP_13.md.
 */
export const FLIGHT13_LIFTOFF_UTC_MS = Date.UTC(2026, 6, 23, 22, 45, 0);

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
 * (Earth→Moon from the Keplerian / Horizons orbit):
 *   full:      λ_m = θ_e
 *   waning +δ: λ_m = θ_e + δ
 *   θ_e = sunPhase0 + N_EARTH_SUN · landingT
 *   sunPhase0 = λ_m − δ − N_EARTH_SUN · landingT
 *
 * @param epoch partial ephemeris used only for moon longitude (Horizons map)
 */
export function sunPhase0ForLanding(
  moonPhase0: number,
  landingT: number,
  epoch: EphemerisEpoch,
): number {
  const δ = moonElongationPastFullRad();
  const λm = moonEclipticLongitude(landingT, epoch, moonPhase0);
  return λm - δ - N_EARTH_SUN * landingT;
}

/**
 * Absolute UTC (ms) for a mission clock time.
 *
 * - If `clockUtcMsAtT0` is set (Flight 13):
 *   `utc = epochUtc + missionT · 1000`
 * - Else (lunar): Horizons τ = 0 at {@link LANDING_UTC_MS};
 *   `utc = LANDING_UTC + (missionT − landingMissionT) · 1000`
 */
export function missionUtcMs(
  missionT: number,
  landingMissionT: number,
  clockUtcMsAtT0: number | null = null,
): number {
  if (clockUtcMsAtT0 != null) {
    return clockUtcMsAtT0 + missionT * 1000;
  }
  return LANDING_UTC_MS + (missionT - landingMissionT) * 1000;
}

/** UTC from a full {@link EphemerisEpoch}. */
export function missionUtcMsFromEpoch(
  missionT: number,
  epoch: EphemerisEpoch,
): number {
  return missionUtcMs(missionT, epoch.horizonsLandingT, epoch.clockUtcMsAtT0);
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

/** Compact UTC label for the HUD, e.g. "2027-07-20 11:42 UTC". */
export function formatMissionDateUtc(
  missionT: number,
  landingMissionT: number,
  clockUtcMsAtT0: number | null = null,
): string {
  const d = new Date(missionUtcMs(missionT, landingMissionT, clockUtcMsAtT0));
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi} UTC`;
}

/** IANA zone for Starbase / Texas civil time (CST/CDT). */
export const TEXAS_TIME_ZONE = "America/Chicago";

/**
 * Texas civil time for the HUD, e.g. "2026-07-23 5:45 p.m. CDT".
 * Uses America/Chicago so DST follows the civil clock.
 */
export function formatMissionDateTexas(
  missionT: number,
  landingMissionT: number,
  clockUtcMsAtT0: number | null = null,
): string {
  return formatTexasFromUtcMs(
    missionUtcMs(missionT, landingMissionT, clockUtcMsAtT0),
  );
}

function formatTexasFromUtcMs(utcMs: number): string {
  const parts = texasDateParts(utcMs);
  const hour12 = ((parts.hour + 11) % 12) + 1;
  const ampm = parts.hour < 12 ? "a.m." : "p.m.";
  return `${parts.year}-${parts.month}-${parts.day} ${hour12}:${parts.minute} ${ampm} ${parts.zone}`;
}

type TexasDateParts = {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: string;
  zone: string;
};

function texasDateParts(utcMs: number): TexasDateParts {
  const bag = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TEXAS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  return {
    year: bag.year ?? "0000",
    month: bag.month ?? "01",
    day: bag.day ?? "01",
    hour: Number(bag.hour ?? "0"),
    minute: bag.minute ?? "00",
    zone: bag.timeZoneName ?? "CT",
  };
}

export function formatMissionDateUtcFromEpoch(
  missionT: number,
  epoch: EphemerisEpoch,
): string {
  return formatMissionDateUtc(
    missionT,
    epoch.horizonsLandingT,
    epoch.clockUtcMsAtT0,
  );
}

/**
 * Greenwich Mean Sidereal Time (rad) at a UTC instant.
 * USNO/Meeus low-precision — plenty for theater pad lighting and launch azimuth.
 * Mesh spin equals Greenwich mean sidereal time: lon 0° → mesh +X → equinox when Greenwich mean sidereal time = 0 (see earthFrame).
 */
function gmstDegrees(d: number, T: number): number {
  const deg = 280.460_618_37 + 360.985_647_366_29 * d + 0.000_387_933 * T * T - (T * T * T) / 38_710_000;
  return ((deg % 360) + 360) % 360;
}

export function greenwichMeanSiderealTimeRad(utcMs: number): number {
  const jd = utcMs / 86_400_000 + 2_440_587.5;
  const d = jd - 2_451_545.0;
  return (gmstDegrees(d, d / 36_525) * Math.PI) / 180;
}

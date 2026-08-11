/**
 * Theater sky-phase one-liners (Sun / Earth season / Moon illumination).
 *
 * Pure geometry from the mission ephemeris — not a full almanac. Used on the
 * complete card and Metrics overlay so landing lighting context is readable.
 */

import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import { missionUtcMs, sunEclipticLongitudeAtUtc } from "./epoch";

/** Moon phase name (theater labels). */
export type MoonPhaseName =
  | "new"
  | "waxing crescent"
  | "first quarter"
  | "waxing gibbous"
  | "full"
  | "waning gibbous"
  | "last quarter"
  | "waning crescent";

export type SkyPhase = {
  /** Illuminated fraction 0…1 (0 = new, 1 = full). */
  illumination: number;
  moonPhase: MoonPhaseName;
  /** Geocentric solar ecliptic longitude (rad). */
  sunLonRad: number;
  /** Geocentric lunar ecliptic longitude (rad). */
  moonLonRad: number;
  /**
   * Elongation Earth→Moon minus Earth→Sun, principal value in (−π, π].
   * Positive ≈ waxing; |value| → π is near full.
   */
  elongationRad: number;
};

/** Wrap angle to (−π, π]. */
export function wrapPi(rad: number): number {
  let a = ((rad + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Name from elongation past new (0…2π) and illuminated fraction.
 * Boundaries are theater-rounded (±~10° of quarters).
 */
export function moonPhaseName(elongationRad: number, illumination: number): MoonPhaseName {
  const waxing = wrapPi(elongationRad) > 0, k = illumination;
  if (k < 0.03) return "new";
  if (k > 0.97) return "full";
  if (k > 0.45 && k < 0.55) return waxing ? "first quarter" : "last quarter";
  if (k < 0.5) return waxing ? "waxing crescent" : "waning crescent";
  return waxing ? "waxing gibbous" : "waning gibbous";
}

/**
 * Sky phase at mission time from body ephemeris (heliocentric theater).
 * Prefer body geometry so Horizons and analytic stay consistent.
 */
function eclipticLon(dx: number, dy: number): number {
  return Math.atan2(dy, dx);
}

export function skyPhaseAt(missionT: number, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): SkyPhase {
  const b = bodyPositions(missionT, epoch);
  const sunLonRad = eclipticLon(b.sun.x - b.earth.x, b.sun.y - b.earth.y);
  const moonLonRad = eclipticLon(b.moon.x - b.earth.x, b.moon.y - b.earth.y);
  const elongationRad = wrapPi(moonLonRad - sunLonRad);
  const illumination = 0.5 * (1 - Math.cos(Math.abs(elongationRad)));
  return { illumination, moonPhase: moonPhaseName(elongationRad, illumination), sunLonRad, moonLonRad, elongationRad };
}

/** Compact ecliptic longitude for HUD, e.g. "118°". */
export function formatLonDeg(rad: number): string {
  let deg = ((rad * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  return `${deg.toFixed(0)}°`;
}

/**
 * One-liner for complete card / metrics, e.g.
 * "Moon waning gibbous · 87% lit · Sun λ 118°"
 */
export function formatSkyPhaseLine(
  missionT: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): string {
  const p = skyPhaseAt(missionT, epoch);
  const pct = Math.round(p.illumination * 100);
  return `Moon ${p.moonPhase} · ${pct}% lit · Sun λ ${formatLonDeg(p.sunLonRad)}`;
}

/**
 * Same as {@link formatSkyPhaseLine} but anchors analytic sun λ to the mission
 * UTC clock when body geometry is unavailable (should not happen in-theater).
 * Kept for tests that want UTC-only solar season without bodies.
 */
export function formatSkyPhaseLineUtc(
  missionT: number,
  landingMissionT: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
  clockUtcMsAtT0: number | null = null,
): string {
  const line = formatSkyPhaseLine(missionT, epoch);
  // Sanity: UTC sun lon should be close for Horizons-era packs
  void sunEclipticLongitudeAtUtc(
    missionUtcMs(missionT, landingMissionT, clockUtcMsAtT0),
  );
  return line;
}

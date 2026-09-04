/**
 * Pure HUD formatters and transport helpers.
 *
 * String layouts for telemetry, metrics, and the mission-complete card —
 * no DOM. {@link bindHud} applies these to elements; theaters share
 * {@link nudgePlaybackSpeed}.
 */

import {
  BOOSTER_PROP_KG,
  SHIP_PROP_KG,
} from "../physics/constants";

/** Clamp to [0, 1]. */
export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Playback rates offered in the HUD / nudged by `,` (slower / reverse) and
 * `.` (faster / forward). Includes negative reverse rates.
 */
export const PLAYBACK_SPEED_STEPS = [
  -2000, -1000, -500, -100, -50, -10, -1, 1, 10, 50, 100, 500, 1000, 2000,
] as const;

/**
 * Step playback speed along {@link PLAYBACK_SPEED_STEPS}.
 * `dir > 0` → next faster (or less reverse); `dir < 0` → next slower / reverse.
 */
export function nudgePlaybackSpeed(current: number, dir: -1 | 1): number {
  return dir > 0 ? nextFasterSpeed(current) : nextSlowerSpeed(current);
}

function nextFasterSpeed(current: number): number {
  for (const step of PLAYBACK_SPEED_STEPS) {
    if (step > current + 1e-9) return step;
  }
  return PLAYBACK_SPEED_STEPS[PLAYBACK_SPEED_STEPS.length - 1]!;
}

function nextSlowerSpeed(current: number): number {
  for (let i = PLAYBACK_SPEED_STEPS.length - 1; i >= 0; i--) {
    const step = PLAYBACK_SPEED_STEPS[i]!;
    if (step < current - 1e-9) return step;
  }
  return PLAYBACK_SPEED_STEPS[0]!;
}

/** Parse `<select id="speed">` value → finite non-zero rate (default 1). */
export function parseSpeedMode(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 1;
  return n;
}

/** Compact playback rate for Metrics, e.g. "10×" or "−100×". */
export function formatRate(speed: number): string {
  const sign = speed < 0 ? "−" : "";
  const mag = Math.abs(speed);
  if (mag >= 10) return `${sign}${Math.round(mag)}×`;
  return `${sign}${mag.toFixed(0)}×`;
}

/** Metrics rate line: rate plus optional " · paused". */
export function formatPlaybackLine(speed: number, playing: boolean): string {
  return `${formatRate(speed)}${playing ? "" : " · paused"}`;
}

/**
 * Compact mission elapsed for scrubber titles / complete card.
 * Floor to whole minutes; multi-day shows days.
 */
export function formatMissionTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const parts = splitMissionTime(s);
  if (parts.d > 0) {
    return `${parts.d}d ${parts.h}h ${String(parts.m).padStart(2, "0")}m`;
  }
  return `${parts.h}h ${String(parts.m).padStart(2, "0")}m`;
}

function splitMissionTime(s: number): {
  d: number;
  h: number;
  m: number;
  sec: number;
} {
  return {
    d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60), sec: s % 60,
  };
}


/**
 * SpaceX webcast-style mission clock: T+HH:MM:SS (or T− for pre-liftoff).
 * Hours grow past 24 for multi-day coasts (no day field).
 */
export function formatWebcastMissionTime(seconds: number): string {
  const neg = seconds < 0;
  const s = Math.floor(Math.abs(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${neg ? "T−" : "T+"}${padClockHours(h)}:${pad2(m)}:${pad2(sec)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function padClockHours(h: number): string {
  return h < 100 ? pad2(h) : String(h);
}

/** Metrics panel: include seconds. */
export function formatMissionTimeDetailed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const parts = splitMissionTime(s);
  if (parts.d > 0) {
    return `${parts.d}d ${parts.h}h ${pad2(parts.m)}m ${pad2(parts.sec)}s`;
  }
  return `${parts.h}h ${pad2(parts.m)}m ${pad2(parts.sec)}s · ${s.toLocaleString()} s`;
}

/** Main telemetry distance (Moon range, altitude). Non-negative. */
export function formatDistance(km: number): string {
  const v = Math.max(0, km);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Mkm`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Mm`;
  if (v >= 10) return `${Math.round(v)} km`;
  return `${v.toFixed(2)} km`;
}

/** Metrics distance: allows negative altitude (below mean radius). */
export function formatDistancePrecise(km: number): string {
  const abs = Math.abs(km);
  const sign = km < 0 ? "−" : "";
  return sign + formatDistancePreciseAbs(abs);
}

function formatDistancePreciseAbs(abs: number): string {
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(3)} Mkm`;
  if (abs >= 1000) return `${(abs / 1000).toFixed(3)} Mm (${abs.toFixed(1)} km)`;
  if (abs >= 1) return `${abs.toFixed(3)} km`;
  if (abs >= 0.001) return `${(abs * 1000).toFixed(1)} m`;
  return `${(abs * 1e6).toFixed(0)} mm`;
}

/** Camera–focus range: AU-scale down to meters. */
export function formatFocusDistance(km: number): string {
  return formatFocusDistanceAbs(Math.max(0, km));
}

function formatFocusDistanceAbs(v: number): string {
  if (v >= 149_597_870.7) return `${(v / 149_597_870.7).toFixed(3)} AU`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Mkm`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Mm`;
  return formatFocusDistanceNear(v);
}

function formatFocusDistanceNear(v: number): string {
  if (v >= 10) return `${Math.round(v)} km`;
  if (v >= 1) return `${v.toFixed(2)} km`;
  if (v >= 0.001) return `${(v * 1000).toFixed(0)} m`;
  return `${(v * 1e6).toFixed(0)} mm`;
}

/**
 * Earth-relative camera altitude on the rail. Coarser than focus range so
 * sub-frame eye noise does not flash a new string every tick.
 */
export function formatCameraAltitude(km: number): string {
  const v = Math.max(0, km);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Mkm`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Mm`;
  if (v >= 100) return `${Math.round(v)} km`;
  if (v >= 1) return `${(Math.round(v * 10) / 10).toFixed(1)} km`;
  if (v >= 0.01) return `${Math.round(v * 100) * 10} m`;
  return `${Math.round(v * 1000)} m`;
}

/** Main telemetry speed. */
export function formatSpeed(kmPerS: number): string {
  const v = Math.max(0, kmPerS);
  if (v >= 1) return `${v.toFixed(2)} km/s`;
  return `${(v * 1000).toFixed(0)} m/s`;
}

/**
 * Webcast-style ground speed (Flight 13 main strip).
 * `kmPerS` is still km/s; output is integer km/h.
 */
export function formatSpeedKmh(kmPerS: number): string {
  const kmh = Math.max(0, kmPerS) * 3600;
  return `${Math.round(kmh).toLocaleString("en-US")} km/h`;
}

/** Metrics dual-unit speed. */
export function formatSpeedPrecise(kmPerS: number): string {
  const v = Math.max(0, kmPerS);
  if (v >= 1) return `${v.toFixed(4)} km/s · ${(v * 1000).toFixed(1)} m/s`;
  return `${(v * 1000).toFixed(2)} m/s · ${v.toFixed(6)} km/s`;
}

/** Propellant remaining for main telemetry bars/labels. */
export function formatFuel(frac: number, tank: "booster" | "ship"): string {
  const f = Math.max(0, Math.min(1, frac));
  const cap = tank === "booster" ? BOOSTER_PROP_KG : SHIP_PROP_KG;
  return formatFuelFromKg(f, f * cap);
}

function formatFuelFromKg(f: number, kg: number): string {
  const pct = `${Math.round(f * 100)}%`;
  if (kg >= 1_000_000) return `${pct} · ${(kg / 1_000_000).toFixed(2)} kt`;
  if (kg >= 1000) return `${pct} · ${(kg / 1000).toFixed(0)} t`;
  return `${pct} · ${Math.round(kg)} kg`;
}

/** Metrics propellant with mass / capacity. */
export function formatFuelDetailed(
  frac: number,
  kg: number,
  capKg: number,
): string {
  const f = clamp01(frac);
  const pct = `${(f * 100).toFixed(2)}%`;
  return `${pct} · ${formatMassKg(kg)} / ${formatMassKg(capKg)}`;
}

export function formatMassKg(kg: number): string {
  const v = Math.max(0, kg);
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(3)} kt (${Math.round(v).toLocaleString()} kg)`;
  }
  if (v >= 1000) {
    return `${(v / 1000).toFixed(2)} t (${Math.round(v).toLocaleString()} kg)`;
  }
  return `${Math.round(v)} kg`;
}

/** Main telemetry thrust; idle engines show em dash. */
export function formatThrust(newtons: number): string {
  const n = Math.max(0, newtons);
  if (n < 500) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MN`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} kN`;
  return `${Math.round(n)} N`;
}

/** Metrics thrust with dual units. */
export function formatThrustDetailed(newtons: number): string {
  const n = Math.max(0, newtons);
  if (n < 1) return "0 N";
  if (n >= 1e6) return `${(n / 1e6).toFixed(3)} MN · ${(n / 1e3).toFixed(0)} kN`;
  if (n >= 1e3) {
    return `${(n / 1e3).toFixed(2)} kN · ${Math.round(n).toLocaleString()} N`;
  }
  return `${n.toFixed(1)} N`;
}

/**
 * Compact remaining / elapsed duration for the left rail (ascent seconds
 * through multi-day coasts).
 */
export function formatCompactDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (s < 3600) return sec > 0 ? `${m}m ${pad2(sec)}s` : `${m}m`;
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  if (s < 86400) return min > 0 ? `${h}h ${min}m` : `${h}h`;
  const d = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  return hh > 0 ? `${d}d ${hh}h` : `${d}d`;
}

/** Progress bar label: "0%" … "100%" from mission t / duration. */
export function formatProgressPercent(t: number, durationS: number): string {
  const u = durationS > 0 ? t / durationS : 0;
  return `${Math.round(Math.min(1, Math.max(0, u)) * 100)}%`;
}

/**
 * Metrics progress line: "12.34% · 3h 00m 00s · 10800 s left".
 */
export function formatProgressRemainingLine(
  t: number,
  durationS: number,
): string {
  const u = durationS > 0 ? t / durationS : 0;
  const left = Math.max(0, durationS - t);
  const pct = (Math.min(1, Math.max(0, u)) * 100).toFixed(2);
  return `${pct}% · ${formatMissionTimeDetailed(left)} left`;
}

/** Complete-card min lunar altitude (meters when sub-km). */
export function formatMinMoonAlt(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  return formatDistance(Math.max(0, km));
}

/** Optional pack meta → display string or em dash. */
export function formatOptional(
  value: number | null | undefined,
  format: (v: number) => string,
): string {
  if (value != null && Number.isFinite(value)) return format(value);
  return "—";
}

/** Translunar injection Δv for complete card (3 dp). */
export function formatTranslunarInjectionDv(kmS: number): string {
  return `${kmS.toFixed(3)} km/s`;
}

/** Metrics Δv (4 dp). */
export function formatTranslunarInjectionDvDetailed(kmS: number): string {
  return `${kmS.toFixed(4)} km/s`;
}

/** Fuel bar CSS width percent (0–100). */
export function fuelBarWidthPercent(frac: number): string {
  return `${Math.round(clamp01(frac) * 100)}%`;
}

/**
 * Wet mass estimate for Metrics: dry + remaining prop for staged/stack tanks.
 */
export function wetMassFromFuel(
  fuelBooster: number,
  fuelShip: number,
  staged: boolean,
  boosterDryKg: number,
  boosterPropKg: number,
  shipDryKg: number,
  shipPropKg: number,
): number {
  const shipKg = shipDryKg + clamp01(fuelShip) * shipPropKg;
  if (staged) return shipKg;
  return shipKg + boosterDryKg + clamp01(fuelBooster) * boosterPropKg;
}

/** Accel in g from thrust (N) and wet mass (kg). */
export function thrustAccelG(thrustN: number, wetMassKg: number): number {
  if (!(wetMassKg > 0) || !(thrustN > 0)) return 0;
  return thrustN / (wetMassKg * 9.80665);
}

/** Metrics g-load label. */
export function formatAccelG(g: number): string {
  if (g > 1e-4) return `${g.toFixed(3)} g`;
  return "—";
}

/**
 * Shareable mission time-seek URLs.
 *
 * Hash query `t=` on any `#/mission/<path>` deep link seeks the transport
 * clock to that physics time (liftoff = 0; negative = T− countdown). The
 * address bar stays in sync as the clock moves so a copied URL restores the
 * same moment.
 *
 * Accepted `t` forms: `T+01:05:21` / `T−00:05:00`, `1:05:21`, `65:21` (M:SS),
 * raw seconds (`3921`), and compact units (`1h5m21s`). A `+` in the hash is
 * often decoded as a space (`T 01:05:21`) — that still means T+.
 */

import type { MissionClock } from "../mission/clock";
import {
  physicsTToTransportU,
  transportUToPhysicsT,
} from "../mission/prelaunch";

/** Optional theater boot: seek to this physics time (s). */
export type MissionStartOpts = {
  seekT?: number;
};

/** Throttle hash writes while playing so history is not flooded. */
const SEEK_HASH_THROTTLE_MS = 1000;

let applyRunningSeek: ((physicsT: number) => void) | null = null;

/**
 * Parse a `t=` value into physics mission seconds (liftoff = 0).
 * Returns null when the string is empty or not a time.
 */
export function parseSeekTime(raw: string): number | null {
  const cleaned = raw.trim().replace(/[−–—]/g, "-");
  if (!cleaned) return null;
  const signed = stripSeekSign(cleaned);
  if (signed == null) return null;
  const mag = parseSeekMagnitude(signed.body);
  if (mag == null) return null;
  return signed.sign * mag;
}

/**
 * Compact, URL-safe clock for `t=`: `1:05:21` or `-0:05:00`.
 * Floors toward zero so the hash matches the HUD second.
 */
export function formatSeekTime(physicsT: number): string {
  if (!Number.isFinite(physicsT)) return "0:00:00";
  const neg = physicsT < 0;
  const s = Math.floor(Math.abs(physicsT) + 1e-9);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const body = `${h}:${pad2(m)}:${pad2(sec)}`;
  return neg ? `-${body}` : body;
}

/** Read `t` from a query string (hash query or `location.search`). */
export function seekParamFromQuery(params: URLSearchParams): number | undefined {
  const t = parseSeekTime(params.get("t") ?? "");
  return t == null ? undefined : t;
}

/** `#/mission/<path>?t=1:05:21` */
export function missionSeekHash(missionPath: string, physicsT: number): string {
  return `#/mission/${missionPath}?t=${formatSeekTime(physicsT)}`;
}

/**
 * Replace the hash with the current mission time without firing `hashchange`.
 * Keeps pathname + search (`?recompute=1`) intact.
 */
export function replaceMissionSeekHash(missionPath: string, physicsT: number): void {
  if (typeof location === "undefined" || typeof history === "undefined") return;
  const hash = missionSeekHash(missionPath, physicsT);
  if (location.hash === hash) return;
  history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
}

/**
 * Seek a running theater from a later hash change (`t=` edited in place).
 * Bootstraps register via {@link attachMissionSeek}.
 */
export function applyTheaterSeek(physicsT: number): void {
  applyRunningSeek?.(physicsT);
}

/**
 * Apply an optional boot seek, register in-theater hash seeks, and keep the
 * address bar in sync with the clock.
 */
export function attachMissionSeek(
  clock: MissionClock,
  physicsDurationS: number,
  missionPath: string,
  seekT?: number,
): void {
  if (seekT != null && Number.isFinite(seekT)) {
    clock.seek(physicsTToTransportU(seekT, physicsDurationS));
    clock.pause();
  }
  applyRunningSeek = (physicsT) => {
    clock.seek(physicsTToTransportU(physicsT, physicsDurationS));
  };
  wireSeekHashSync(clock, physicsDurationS, missionPath);
}

function wireSeekHashSync(
  clock: MissionClock,
  physicsDurationS: number,
  missionPath: string,
): void {
  const initialU = clock.t;
  let lastWriteMs = 0;
  clock.subscribe(() => {
    if (Math.abs(clock.t - initialU) < 1e-12) return;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (clock.playing && now - lastWriteMs < SEEK_HASH_THROTTLE_MS) return;
    lastWriteMs = now;
    replaceMissionSeekHash(
      missionPath,
      transportUToPhysicsT(clock.t, physicsDurationS),
    );
  });
}

function stripSeekSign(raw: string): { sign: number; body: string } | null {
  let rest = raw;
  let sign = 1;
  const tPrefix = rest.match(/^T(?:\+|-|\s+)/i);
  if (tPrefix) {
    if (tPrefix[0].includes("-")) sign = -1;
    rest = rest.slice(tPrefix[0].length);
  } else if (rest.startsWith("+")) {
    rest = rest.slice(1);
  } else if (rest.startsWith("-")) {
    sign = -1;
    rest = rest.slice(1);
  }
  rest = rest.replace(/^\+/, "").trim();
  if (!rest) return null;
  return { sign, body: rest };
}

function parseSeekMagnitude(body: string): number | null {
  const compact = parseCompactDuration(body);
  if (compact != null) return compact;
  const colon = parseColonClock(body);
  if (colon != null) return colon;
  if (/^\d+(\.\d+)?$/.test(body)) return Number(body);
  return null;
}

/** `1h5m21s`, `65m`, `90s`, `2d`. At least one unit required. */
function parseCompactDuration(body: string): number | null {
  const m = body.match(
    /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i,
  );
  if (!m) return null;
  const d = m[1] != null ? Number(m[1]) : 0;
  const h = m[2] != null ? Number(m[2]) : 0;
  const min = m[3] != null ? Number(m[3]) : 0;
  const sec = m[4] != null ? Number(m[4]) : 0;
  if (m[1] == null && m[2] == null && m[3] == null && m[4] == null) return null;
  return d * 86400 + h * 3600 + min * 60 + sec;
}

/**
 * `H:MM:SS` (hours unbounded), `M:SS` (minutes unbounded), or `D:HH:MM:SS`.
 */
function parseColonClock(body: string): number | null {
  const parts = body.split(":");
  if (parts.length < 2 || parts.length > 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [min, sec] = nums;
    if (sec! >= 60) return null;
    return min! * 60 + sec!;
  }
  if (parts.length === 3) {
    const [h, min, sec] = nums;
    if (min! >= 60 || sec! >= 60) return null;
    return h! * 3600 + min! * 60 + sec!;
  }
  const [d, h, min, sec] = nums;
  if (h! >= 24 || min! >= 60 || sec! >= 60) return null;
  return d! * 86400 + h! * 3600 + min! * 60 + sec!;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

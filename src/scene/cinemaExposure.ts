/**
 * Cinema exposure, bloom, star fade, atmosphere brownout.
 */

import { R_EARTH, R_MOON } from "../physics/constants";

export const SHADOW_FULL_ALT_KM = 12;
/** Shadows fully off above this altitude (km). */
export const SHADOW_FADE_ALT_KM = 80;

/** Pad / low-alt exposure (kept close to LEO so steam does not clip). */
export const EXPOSURE_PAD = 1.06;
/** Mid / LEO exposure. */
export const EXPOSURE_LEO = 1.05;
/** Deep-space / cislunar exposure (slightly restrained). */
export const EXPOSURE_SPACE = 0.96;

export type Vec3Like = { x: number; y: number; z: number };

/**
 * Softstep altitude fade: 1 at/below `fullKm`, 0 at/above `fadeKm`.
 */
export function altitudeFade(
  altKm: number,
  fullKm: number,
  fadeKm: number,
): number {
  if (!Number.isFinite(altKm)) return 0;
  if (fadeKm <= fullKm) return altKm <= fullKm ? 1 : 0;
  if (altKm <= fullKm) return 1;
  if (altKm >= fadeKm) return 0;
  const t = (altKm - fullKm) / (fadeKm - fullKm);
  const s = t * t * (3 - 2 * t);
  return 1 - s;
}

/**
 * Tone-mapping exposure from camera altitude (km above mean surface).
 * Brighter on the pad; slightly restrained in deep space.
 */
export function cinemaExposure(camAltKm: number): number {
  if (!Number.isFinite(camAltKm) || camAltKm < 0) return EXPOSURE_PAD;
  // Pad band → LEO
  const toLeo = altitudeFade(camAltKm, 2, 120);
  const padLeo = EXPOSURE_PAD * toLeo + EXPOSURE_LEO * (1 - toLeo);
  // LEO → deep space
  const toSpace = altitudeFade(camAltKm, 200, 5000);
  return padLeo * toSpace + EXPOSURE_SPACE * (1 - toSpace);
}

/**
 * Mild bloom strength: pulled back near the pad so steam does not flare,
 * restrained in deep space so the Sun does not wash the frame.
 * Optional `phase` adds a small LOI punch during `approach` burn (V10) —
 * theater exposure, not a physical radiance model.
 */
export function cinemaBloomStrength(
  camAltKm: number,
  burning: boolean,
  phase?: string,
): number {
  const near = altitudeFade(camAltKm, 5, 200);
  const base = 0.22 * (1 - near);
  const burnBoost = burning ? 0.08 * Math.max(0.25 - 0.25 * near, 0) : 0;
  const loiBoost = burning && phase === "approach" ? 0.06 : 0;
  return base + burnBoost + loiBoost;
}

/**
 * Bloom luminance threshold — high so only engines / Sun / floods glow.
 */
export function cinemaBloomThreshold(camAltKm: number): number {
  const near = altitudeFade(camAltKm, 5, 150);
  // High near the pad so steam / floods do not bloom into a deck-wide flare
  return 0.88 + 0.08 * near;
}

/**
 * Star-dome opacity: full in space, pulled back near the pad so ground-sky
 * owns the horizon; further reduced during entry brownout.
 *
 * @param brownout - 0..1 from {@link atmosphereBrownout}
 */
export function starDomeOpacity(camAltKm: number, brownout = 0): number {
  const space = 1 - altitudeFade(camAltKm, 15, 100);
  // Near pad still keep a faint starfield above the blue dome
  const op = 0.22 + 0.78 * space;
  const b = Math.max(0, Math.min(1, brownout));
  return op * (1 - 0.65 * b);
}

/**
 * Entry brownout factor for atmosphere / star tint (0..1).
 * Uses phase + altitude (+ optional plasma strength from entry FX).
 */
function entryAltBrownout(altKm: number): number {
  // Theater fallback when plasma helper is not wired (lunar mission)
  if (!Number.isFinite(altKm) || altKm > 100 || altKm < 0.5) return 0;
  // Peak around 40–70 km: rise through 15–35 km, fall through 55–95 km
  const rise = 1 - altitudeFade(altKm, 15, 35);
  const fall = altitudeFade(altKm, 55, 95);
  return Math.max(0, Math.min(1, rise * fall * 0.55));
}

export function atmosphereBrownout(
  phase: string | undefined,
  altKm: number,
  plasmaStrength = 0,
): number {
  const plasma = Math.max(0, Math.min(1, plasmaStrength));
  if (plasma > 0.02) return Math.min(1, plasma * 0.95);
  if (phase !== "entry" && phase !== "descent") return 0;
  return entryAltBrownout(altKm);
}

/**
 * Half-extent (km) for the orthographic sun shadow camera.
 * Tight on the pad; widens modestly during low ascent.
 */
export function shadowHalfExtentKm(camAltKm: number): number {
  if (!Number.isFinite(camAltKm) || camAltKm < 0) return 0.28;
  return Math.min(2.2, 0.22 + camAltKm * 0.08);
}

/**
 * Whether sun shadows should run at this camera altitude.
 */
export function shadowsActive(camAltKm: number): boolean {
  return altitudeFade(camAltKm, SHADOW_FULL_ALT_KM, SHADOW_FADE_ALT_KM) > 0.02;
}
export function cameraAltitudeEarthKm(
  cameraPos: Vec3Like,
  earthPos: Vec3Like,
): number {
  const dx = cameraPos.x - earthPos.x;
  const dy = cameraPos.y - earthPos.y;
  const dz = cameraPos.z - earthPos.z;
  return Math.hypot(dx, dy, dz) - R_EARTH;
}

/**
 * Camera altitude (km) above mean Moon surface from world positions.
 */
export function cameraAltitudeMoonKm(
  cameraPos: Vec3Like,
  moonPos: Vec3Like,
): number {
  const dx = cameraPos.x - moonPos.x;
  const dy = cameraPos.y - moonPos.y;
  const dz = cameraPos.z - moonPos.z;
  return Math.hypot(dx, dy, dz) - R_MOON;
}

/**
 * Shadow / near-surface cinema altitude: the nearer of Earth and Moon AGL.
 * Pad shots use Earth; lunar landing uses the Moon; cislunar stays huge.
 */
export function shadowAltitudeKm(earthAltKm: number, moonAltKm: number): number {
  const e = Number.isFinite(earthAltKm) ? earthAltKm : Number.POSITIVE_INFINITY;
  const m = Number.isFinite(moonAltKm) ? moonAltKm : Number.POSITIVE_INFINITY;
  return Math.min(e, m);
}

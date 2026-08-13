/**
 * Pure frame-derive helpers for the mission theater loop.
 *
 * Extracted from `applyMissionState` so geometry / style decisions stay
 * scrub-deterministic and unit-testable without Three.js.
 *
 * Scene unit = 1 km.
 */

import type { PhaseId } from "../physics/missionTypes";

/** Minimal 3-vector (km or km/s). */
export type Vec3Like = Readonly<{ x: number; y: number; z: number }>;

/** Trail line style for the craft path overlay. */
export type TrailStyle = Readonly<{
  linewidth: number;
  opacity: number;
}>;

/** Default craft trail (ascent / burns other than LOI). */
export const TRAIL_STYLE_IDLE: TrailStyle = Object.freeze({
  linewidth: 3.25,
  opacity: 0.72,
});

/** Dimmer ballistic coast — punctuation, not a new physics overlay. */
export const TRAIL_STYLE_COAST: TrailStyle = Object.freeze({
  linewidth: 2.55,
  opacity: 0.46,
});

/** Perilune / LOI approach without the burn punch. */
export const TRAIL_STYLE_APPROACH: TrailStyle = Object.freeze({
  linewidth: 3.7,
  opacity: 0.8,
});

/** LOI / approach burn beat — brighter, slightly fatter trail. */
export const TRAIL_STYLE_LOI: TrailStyle = Object.freeze({
  linewidth: 5.0,
  opacity: 0.92,
});

/**
 * Lift craft position onto the shared Earth surface shell when samples
 * dip slightly under that radius during ascent / low Earth orbit.
 *
 * `minR` should be `EARTH_SURFACE_RADIUS_KM` so the visual stack matches the
 * physics pad — do not pass a separate visual clearance.
 *
 * @returns Clamped position, or the original `pos` when no lift is needed.
 */
function liftAboveSurface(earth: Vec3Like, dx: number, dy: number, dz: number, s: number): Vec3Like {
  return { x: earth.x + dx * s, y: earth.y + dy * s, z: earth.z + dz * s };
}

export function clampCraftAboveEarth(
  pos: Vec3Like,
  earth: Vec3Like,
  minR: number,
): Vec3Like {
  const dx = pos.x - earth.x;
  const dy = pos.y - earth.y;
  const dz = pos.z - earth.z;
  const r = Math.hypot(dx, dy, dz);
  if (!(r > 1e-6) || r >= minR) return pos;
  return liftAboveSurface(earth, dx, dy, dz, minR / r);
}

/**
 * True for early mission phases that fly near Earth (surface-relative attitude,
 * Earth altitude clamp).
 */
export function isNearEarthPhase(phase: PhaseId): boolean {
  return (
    phase === "launch" ||
    phase === "ascent" ||
    phase === "lowEarthOrbit" ||
    phase === "translunarInjection"
  );
}

/**
 * Use surface-relative air velocity for attitude (vs pure inertial heading).
 * Near-Earth phases, or still within 50_000 km of Earth's surface.
 */
export function attitudeNearEarth(
  phase: PhaseId,
  altEarthKm: number,
): boolean {
  return (
    isNearEarthPhase(phase) ||
    (Number.isFinite(altEarthKm) && altEarthKm < 50_000)
  );
}

/**
 * Craft trail style: coast dims, LOI approach burn punches, perilune pulses.
 * Scrub-safe (phase + burning only).
 */
export function craftTrailStyle(
  prelaunch: boolean,
  phase: PhaseId,
  burning: boolean,
): TrailStyle {
  if (prelaunch) return TRAIL_STYLE_IDLE;
  if (phase === "approach" && burning) return TRAIL_STYLE_LOI;
  if (phase === "approach") return TRAIL_STYLE_APPROACH;
  if (phase === "coast") return TRAIL_STYLE_COAST;
  return TRAIL_STYLE_IDLE;
}

/**
 * Sun elevation factor at a pad: sin(el) ≈ sunDir · padUp (−1…1).
 * Vectors are heliocentric / inertial positions (km); only directions matter.
 */
export function sunElevAtPad(
  sun: Vec3Like,
  earth: Vec3Like,
  padWorld: Vec3Like,
): number {
  const sunDx = sun.x - earth.x;
  const sunDy = sun.y - earth.y;
  const sunDz = sun.z - earth.z;
  const sunLen = Math.hypot(sunDx, sunDy, sunDz) || 1;
  const padUpX = padWorld.x - earth.x;
  const padUpY = padWorld.y - earth.y;
  const padUpZ = padWorld.z - earth.z;
  const upLen = Math.hypot(padUpX, padUpY, padUpZ) || 1;
  return (sunDx * padUpX + sunDy * padUpY + sunDz * padUpZ) / (sunLen * upLen);
}

/**
 * HUD altitude: Earth while outbound near Earth (far from Moon); else Moon.
 */
export function telemetryAltitudeKm(
  phase: PhaseId,
  distMoonKm: number,
  altEarthKm: number,
  altMoonKm: number,
): number {
  const nearEarth =
    phase === "launch" ||
    phase === "ascent" ||
    phase === "lowEarthOrbit" ||
    phase === "translunarInjection" ||
    phase === "coast";
  return nearEarth && distMoonKm > 100_000 ? altEarthKm : altMoonKm;
}

/**
 * Inertial craft speed relative to a body (‖v_craft − v_body‖).
 */
export function relativeSpeedKmS(craftVel: Vec3Like, bodyVel: Vec3Like): number {
  return Math.hypot(
    craftVel.x - bodyVel.x,
    craftVel.y - bodyVel.y,
    craftVel.z - bodyVel.z,
  );
}

/**
 * Whether pad clamp should run (near-Earth powered phases only).
 * Separated from {@link isNearEarthPhase} only for call-site clarity.
 */
export function shouldClampAboveEarth(phase: PhaseId): boolean {
  return isNearEarthPhase(phase);
}

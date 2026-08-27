/**
 * Flame-trench camera mount in pad-local kilometres.
 *
 * Pad frame (see `earthTheater.ts`): origin = OLM / stack engines, **+Y up**,
 * **+X toward the tower**, trench along ±Z. Scene unit = 1 km.
 *
 * Webcast look target: `tminus-000130-engines-up.jpg` — under the OLM hole,
 * looking **up** into the Raptor bells with the painted inner bowl in frame.
 * The mount sits in the open trench below the engine plane (not a side-on
 * skirt shot). Physics pad, visual pad, and stack share {@link STARBASE_ALT}.
 */

import { STARBASE_ALT } from "../physics/constants";

/**
 * Pad / craft-clamp altitude above mean Earth radius (km).
 * Same shell as physics {@link STARBASE_ALT}.
 */
export const PAD_VISUAL_ALT_KM = STARBASE_ALT;

/**
 * Camera in pad-local km: in the trench below the engine plane, offset toward
 * the inner wall so the 33-bell field reads as a circular cluster from below
 * (Flight 13 T−1:30 engines-up still).
 */
export const TRENCH_CAM_LOCAL = {
  x: -0.0004,
  y: -0.0072,
  z: 0.0058,
} as const;

/** Look at the engine-hole lip so the bells sit in the upper frame. */
export const TRENCH_CAM_LOOK_LOCAL = {
  x: 0,
  y: 0.0003,
  z: 0,
} as const;

/**
 * Vertical FOV (deg). The webcast still is a wide pad-security lens, not the
 * 50° theater default — 50° from this mount crops to a few bell sides.
 */
export const TRENCH_CAM_FOV = 88;

/** OLM hole the trench mount must sit inside (km). Visual inner bowl is ~9.8 m (V24). */
export const OLM_INNER_RADIUS_KM = 0.012;

/** Conservative “under the deck” bound (km). Visual hex deck is ~12 m (V24). */
export const OLM_DECK_TOP_KM = 0.004;

/** Outer Raptor ring plus bell radius, scaled to world km (theater). */
export const ENGINE_CLUSTER_RADIUS_KM = 0.0045;

/**
 * Extra lift from {@link starbasePadState} to the visual pad origin.
 * Always 0 — physics and visuals share {@link STARBASE_ALT}.
 */
export function padVisualLiftKm(): number {
  return PAD_VISUAL_ALT_KM - STARBASE_ALT;
}

/** Horizontal distance from OLM center to the trench mount (km). */
export function trenchCamRadialKm(): number {
  return Math.hypot(TRENCH_CAM_LOCAL.x, TRENCH_CAM_LOCAL.z);
}

export type Vec3Like = { x: number; y: number; z: number };

/**
 * World-space trench camera pose from a pad ENU basis.
 *
 * `padPos` is the pad origin from `starbasePadState` (km), which matches the
 * visual pad on {@link STARBASE_ALT}.
 *
 * @param padPos - Pad origin (km)
 * @param east - Unit east
 * @param up - Unit surface normal
 * @param north - Unit north (`up × east`)
 */
export function trenchCamWorldPose(
  padPos: Vec3Like,
  east: Vec3Like,
  up: Vec3Like,
  north: Vec3Like,
): { position: Vec3Like; look: Vec3Like; camUp: Vec3Like } {
  const origin = liftAlongUp(padPos, up, padVisualLiftKm());
  return {
    position: offsetFromOrigin(origin, east, up, north, TRENCH_CAM_LOCAL),
    look: offsetFromOrigin(origin, east, up, north, TRENCH_CAM_LOOK_LOCAL),
    camUp: { x: up.x, y: up.y, z: up.z },
  };
}

function liftAlongUp(pos: Vec3Like, up: Vec3Like, km: number): Vec3Like {
  return {
    x: pos.x + up.x * km,
    y: pos.y + up.y * km,
    z: pos.z + up.z * km,
  };
}

function offsetFromOrigin(
  origin: Vec3Like,
  east: Vec3Like,
  up: Vec3Like,
  north: Vec3Like,
  local: { x: number; y: number; z: number },
): Vec3Like {
  return {
    x: origin.x + east.x * local.x + up.x * local.y + north.x * local.z,
    y: origin.y + east.y * local.x + up.y * local.y + north.y * local.z,
    z: origin.z + east.z * local.x + up.z * local.y + north.z * local.z,
  };
}

/**
 * Flame-trench camera mount in pad-local kilometres.
 *
 * Pad frame (see `earthTheater.ts`): origin = OLM / stack engines, **+Y up**,
 * **+X toward the tower**, trench along ±Z. Scene unit = 1 km.
 *
 * The mount stands *inside* the OLM ring (not 30 m north of it) so the look
 * ray does not hit the table, Earth mesh, or apron discs. A previous ENU
 * offset used the physics pad altitude (`STARBASE_ALT` = 10 m) while the
 * visual pad / clamped stack sit at {@link SURFACE_CLEARANCE_KM} (50 m),
 * which put the camera inside the Earth sphere — a black frame at launch.
 */

import { STARBASE_ALT } from "../physics/constants";
import { SURFACE_CLEARANCE_KM } from "./surfaceClamp";

/**
 * Visual pad / craft-clamp altitude above mean Earth radius (km).
 * Matches `placePadOnEarth` (`max(STARBASE_ALT, 0.05)`) and the ascent clamp.
 */
export const PAD_VISUAL_ALT_KM = SURFACE_CLEARANCE_KM;

/**
 * Camera in pad-local km: west of the stack, under the OLM deck, along the
 * trench so the Raptor field reads as a side cluster rather than head-on.
 */
export const TRENCH_CAM_LOCAL = {
  x: -0.0035,
  y: 0.0006,
  z: 0.007,
} as const;

/** Look a metre-plus above the engine plane so bells fill the lower frame. */
export const TRENCH_CAM_LOOK_LOCAL = {
  x: 0,
  y: 0.0012,
  z: 0,
} as const;

/** OLM open-cylinder top radius (km) — mount must sit inside this ring. */
export const OLM_INNER_RADIUS_KM = 0.012;

/** OLM deck top (km above pad origin). */
export const OLM_DECK_TOP_KM = 0.004;

/** Outer Raptor ring plus bell radius, scaled to world km (theater). */
export const ENGINE_CLUSTER_RADIUS_KM = 0.006;

/**
 * Lift along pad-up from {@link starbasePadState} to the visual pad origin.
 * Physics pad is `STARBASE_ALT`; meshes and the clamped stack use
 * {@link PAD_VISUAL_ALT_KM}.
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
 * `padPos` is the physics pad origin from `starbasePadState` (km). The pose is
 * lifted to the visual pad so the camera is not inside the Earth mesh.
 *
 * @param padPos - Physics pad origin (km)
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

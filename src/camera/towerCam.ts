/**
 * Peak-deck cameras on the two Starbase orbital towers.
 *
 * Pad-local km: +Y up, +X west, +Z north. Scene unit = 1 km.
 *
 * - **Tower Two Cam** sits on the vehicle-facing edge of the live OLP-2
 *   Mechazilla peak and looks down at the stack.
 * - **Tower One Cam** sits on the west face of the OLP-1 peak (gulf-side
 *   pad) and looks across at the OLP-2 stack — the elevated full-stack
 *   framing of `tminus-000400-pad-hold-wide.jpg`.
 */

import {
  TOWER_FACE,
  TOWER_H,
  towerLocalToPad,
} from "../scene/earthTheater/mechazillaDims";
import { olp1TowerFromOlp2 } from "../scene/earthTheater/starbaseSurvey";

/** Stand on the peak deck, just above the house floor (km). */
const PEAK_CAM_Y = TOWER_H + 0.004;

/** Tower Two Cam — OLP-2 peak, vehicle-facing (−X toward the OLM). */
const TOWER2_PEAK = towerLocalToPad(-TOWER_FACE * 0.58, 0.0025);
export const TOWER2_CAM_LOCAL = {
  x: TOWER2_PEAK.x,
  y: PEAK_CAM_Y,
  z: TOWER2_PEAK.z,
} as const;

/** Look at the ship / interstage so the chopsticks sit in the near field. */
export const TOWER2_CAM_LOOK_LOCAL = { x: 0, y: 0.072, z: 0 } as const;

/**
 * Tower-down mount for the panning liftoff cut — mast level, above the parked
 * chopsticks and offset along the deck. The peak-deck pose sits between the
 * two arms, so a wide lens there fills its edges with arm slab.
 */
const TOWER2_DOWN_PEAK = towerLocalToPad(-TOWER_FACE * 0.5, TOWER_FACE * 0.9);
export const TOWER2_DOWN_CAM_LOCAL = {
  x: TOWER2_DOWN_PEAK.x,
  y: TOWER_H + 0.012,
  z: TOWER2_DOWN_PEAK.z,
} as const;

/** Tower One Cam — OLP-1 peak, west face toward the live pad. */
export const TOWER1_CAM_LOCAL = {
  x: olp1TowerFromOlp2.x + TOWER_FACE * 0.58,
  y: PEAK_CAM_Y,
  z: olp1TowerFromOlp2.z,
} as const;

/** Look at mid-stack on the OLP-2 OLM so Mechazilla sits beside the vehicle. */
export const TOWER1_CAM_LOOK_LOCAL = { x: 0, y: 0.058, z: 0 } as const;

/** Close look down the chopsticks from the launch tower. */
export const TOWER2_CAM_FOV = 58;
/**
 * Lens for the panning tower-down cut. The stack clears the deck ~30 m out, so
 * the parked 58° is all hull; the T+3 → T+7 stills keep tower steel and the
 * coastline around the vehicle.
 */
export const TOWER2_DOWN_FOV = 70;
/**
 * Wide elevated lens matching the T−4 pad-hold still (stack + tower +
 * coastline). Same class as the pad flying drone.
 */
export const TOWER1_CAM_FOV = 62;

export const TOWER2_CAM_MOUNT = "tower2-cam";
export const TOWER2_CAM_LOOK = "tower2-cam-look";
export const TOWER2_DOWN_CAM_MOUNT = "tower2-down-cam";
export const TOWER1_CAM_MOUNT = "tower1-cam";
export const TOWER1_CAM_LOOK = "tower1-cam-look";

export function isTowerCamFocus(
  mode: string,
): mode is "tower1cam" | "tower2cam" {
  return mode === "tower1cam" || mode === "tower2cam";
}

/**
 * Farthest (km) a panning tower cam follows the stack. Past this the vehicle
 * is a speck, so the mount goes back to its fixed pad look-at.
 */
export const TOWER_TRACK_MAX_KM = 6;

/**
 * Aim lift above the craft origin (km) while the stack is still below the
 * deck: near the ship, so the lens holds the barrel the T+3 still shows
 * instead of pointing down through the parked chopsticks.
 */
export const TOWER_TRACK_LOOK_UP_HIGH_KM = 0.09;
/** Aim lift once the stack is level with the deck — just above the engines. */
export const TOWER_TRACK_LOOK_UP_LOW_KM = 0.02;
/** Craft-below-deck span (km) the lift blends across. */
export const TOWER_TRACK_BLEND_KM = 0.06;

/**
 * Where up the stack a panning tower cam aims, as a lift above the craft
 * origin (km).
 *
 * While the engines are below the deck the lift is high, which keeps the tilt
 * nearly still in world space and lets the vehicle slide up through the frame
 * — the T+3 → T+7 tower-down stills. Once the stack is level with the deck
 * the lens follows the vehicle itself.
 *
 * @param craftAboveMountKm - Craft origin height relative to the mount (km)
 */
export function towerTrackLookUpKm(craftAboveMountKm: number): number {
  const rel = Number.isFinite(craftAboveMountKm) ? craftAboveMountKm : 0;
  const u = Math.min(1, Math.max(0, (rel + TOWER_TRACK_BLEND_KM) / TOWER_TRACK_BLEND_KM));
  const lift = TOWER_TRACK_LOOK_UP_HIGH_KM +
    (TOWER_TRACK_LOOK_UP_LOW_KM - TOWER_TRACK_LOOK_UP_HIGH_KM) * u;
  // Never aim above the deck. Tilting into empty sky loses the horizon and the
  // plume column; the stills keep both while the stack leaves the top of frame.
  return Math.min(lift, -rel);
}

/**
 * True when a tower peak cam should pan with the climbing stack instead of
 * holding its pad look-at (Flight 13 tower-down cut, T+3 → T+8).
 *
 * @param track - Shot asked for a panning tower cam
 * @param craftDistKm - Mount-to-craft distance (km)
 */
export function towerCamTracksCraft(track: boolean, craftDistKm: number): boolean {
  if (!track) return false;
  return Number.isFinite(craftDistKm) && craftDistKm <= TOWER_TRACK_MAX_KM;
}

export function towerCamMountName(
  mode: "tower1cam" | "tower2cam",
): string {
  return mode === "tower1cam" ? TOWER1_CAM_MOUNT : TOWER2_CAM_MOUNT;
}

export function towerCamLookName(
  mode: "tower1cam" | "tower2cam",
): string {
  return mode === "tower1cam" ? TOWER1_CAM_LOOK : TOWER2_CAM_LOOK;
}

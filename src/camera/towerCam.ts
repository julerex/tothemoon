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
  TOWER_OX,
} from "../scene/earthTheater/mechazillaDims";
import { olp1TowerFromOlp2 } from "../scene/earthTheater/starbaseSurvey";

/** Stand on the peak deck, just above the house floor (km). */
const PEAK_CAM_Y = TOWER_H + 0.004;

/** Tower Two Cam — OLP-2 peak, vehicle-facing (−X toward the OLM). */
export const TOWER2_CAM_LOCAL = {
  x: TOWER_OX - TOWER_FACE * 0.58,
  y: PEAK_CAM_Y,
  z: 0.0025,
} as const;

/** Look at the ship / interstage so the chopsticks sit in the near field. */
export const TOWER2_CAM_LOOK_LOCAL = { x: 0, y: 0.072, z: 0 } as const;

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
 * Wide elevated lens matching the T−4 pad-hold still (stack + tower +
 * coastline). Same class as the pad flying drone.
 */
export const TOWER1_CAM_FOV = 62;

export const TOWER2_CAM_MOUNT = "tower2-cam";
export const TOWER2_CAM_LOOK = "tower2-cam-look";
export const TOWER1_CAM_MOUNT = "tower1-cam";
export const TOWER1_CAM_LOOK = "tower1-cam-look";

export function isTowerCamFocus(
  mode: string,
): mode is "tower1cam" | "tower2cam" {
  return mode === "tower1cam" || mode === "tower2cam";
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

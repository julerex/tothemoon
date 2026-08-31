/**
 * Camera mode toast copy and cycle order for the theater HUD.
 */

import {
  FIXED_CAMERAS,
  FREE_LOOK_CAMERAS,
  isFixedCamera,
  type CameraMode,
} from "../camera/cameraMode";

export const CAMERA_LABELS: Record<
  CameraMode,
  { title: string; detail: string }
> = {
  free: {
    title: "Free camera",
    detail: "No subject track · WASD + T/B pan · drag to look",
  },
  sun: { title: "Sun", detail: "Free · double-tap rail to frame" },
  moon: { title: "Moon", detail: "Free · double-tap rail to frame" },
  earth: { title: "Earth", detail: "Free · double-tap rail to frame" },
  starbase: {
    title: "Starbase",
    detail: "Fixed · pad track of the stack",
  },
  aerial: {
    title: "Launchpad Drone",
    detail: "Fixed · pad flying drone",
  },
  ground1: {
    title: "Ground Camera One",
    detail: "Fixed · T−2 full stack and tower",
  },
  tower1cam: {
    title: "Tower One Cam",
    detail: "Fixed · OLP-1 peak looking at the stack",
  },
  tower2cam: {
    title: "Tower Two Cam",
    detail: "Fixed · OLP-2 peak looking at the stack",
  },
  booster: {
    title: "Booster",
    detail: "Free · Super Heavy from outside",
  },
  tower: {
    title: "Launch Tower",
    detail: "Free · WASD along the ground",
  },
  trench: {
    title: "Flame trench",
    detail: "Fixed · looking up at the booster bells",
  },
  gridfin: {
    title: "Grid fin",
    detail: "Fixed · booster hull cam",
  },
  chase: {
    title: "Starship",
    detail: "Free · ship from outside",
  },
  fin: { title: "Ship fin", detail: "Fixed · aft engines" },
  hull: { title: "Ship hull", detail: "Fixed · barrel cam" },
  engines: {
    title: "Engine bay",
    detail: "Fixed · looking at the Raptor bells",
  },
  enginesDown: {
    title: "Engines down",
    detail: "Fixed · looking down through the plume",
  },
  drone: {
    title: "Drone",
    detail: "Fixed · sea-level orbit of the floating ship",
  },
};

/** HUD subtitle under the camera title. */
export function cameraKindLabel(mode: CameraMode): "Free" | "Mounted" {
  return isFixedCamera(mode) ? "Mounted" : "Free";
}

/** Shown when the user tries to pan / orbit / zoom a mounted camera. */
export const FIXED_CAM_LOCK_NOTE =
  "Mounted camera — movement is locked. Pick a Free camera to look around.";

/** How long the lock note stays visible (ms). */
export const CAM_LOCK_NOTE_MS = 2800;

/**
 * Focus modes cycled by [ / ]: Free rail, then Fixed rail.
 */
export const CAMERA_CYCLE: readonly CameraMode[] = [
  ...FREE_LOOK_CAMERAS,
  ...FIXED_CAMERAS,
];

/**
 * Next or previous focus in {@link CAMERA_CYCLE}.
 * Unknown / free current wraps from the start (`dir > 0`) or end (`dir < 0`).
 */
export function cycleCameraMode(current: CameraMode, dir: -1 | 1): CameraMode {
  const n = CAMERA_CYCLE.length;
  const i = CAMERA_CYCLE.indexOf(current);
  const from = i < 0 ? (dir > 0 ? -1 : 0) : i;
  return CAMERA_CYCLE[(from + dir + n) % n]!;
}

/** Double-tap window for rail-button frame zoom (ms). */
export const CAM_DOUBLE_TAP_MS = 380;

/**
 * Camera mode toast copy and cycle order for the theater HUD.
 */

import type { CameraMode } from "../camera/modes";

export const CAMERA_LABELS: Record<
  CameraMode,
  { title: string; detail: string }
> = {
  free: {
    title: "Free camera",
    detail: "No subject track · WASD pan · drag to look",
  },
  sun: { title: "Sun", detail: "Focus · double-tap rail to frame" },
  moon: { title: "Moon", detail: "Focus · double-tap rail to frame" },
  earth: { title: "Earth", detail: "Focus · double-tap rail to frame" },
  starbase: {
    title: "Starbase",
    detail: "Pad · double-tap rail to frame",
  },
  trench: {
    title: "Launchpad",
    detail: "Flame trench · engines side",
  },
  gridfin: {
    title: "Booster",
    detail: "Grid fin · aft engines",
  },
  chase: {
    title: "Starship",
    detail: "Chase · double-tap rail to frame",
  },
  fin: { title: "Ship fin", detail: "Aft engines" },
  hull: { title: "Ship hull", detail: "Barrel cam" },
};

/** Focus modes cycled by − / =. */
export const CAMERA_CYCLE: readonly CameraMode[] = [
  "sun",
  "moon",
  "earth",
  "starbase",
  "trench",
  "gridfin",
  "chase",
  "fin",
  "hull",
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

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
  sun: { title: "Sun", detail: "Focus · key 1 · double-tap to frame" },
  moon: { title: "Moon", detail: "Focus · key 2 · double-tap to frame" },
  earth: { title: "Earth", detail: "Focus · key 3 · double-tap to frame" },
  starbase: {
    title: "Starbase",
    detail: "Pad · key 4 · double-tap to frame",
  },
  trench: {
    title: "Launchpad",
    detail: "Flame trench · engines side · key 5",
  },
  gridfin: {
    title: "Booster",
    detail: "Grid fin · aft engines · key 6",
  },
  chase: {
    title: "Starship",
    detail: "Chase · key 7 · double-tap to frame",
  },
  fin: { title: "Ship fin", detail: "Aft engines · key 8" },
};

/** Focus modes cycled by ` (backtick) — same order as number keys 1–8. */
export const CAMERA_CYCLE: readonly CameraMode[] = [
  "sun",
  "moon",
  "earth",
  "starbase",
  "trench",
  "gridfin",
  "chase",
  "fin",
];

/** Double-tap window for number-key frame zoom (ms). */
export const CAM_DOUBLE_TAP_MS = 380;

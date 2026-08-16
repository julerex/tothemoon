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
  hull: { title: "Ship hull", detail: "Barrel cam · key 9" },
};

/** Focus modes cycled by − / = — same order as number keys 1–9. */
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

/** Digit keys 1–9 → {@link CAMERA_CYCLE} (single source for HUD + keyboard). */
export const CAMERA_DIGIT_MODES: Readonly<Record<string, CameraMode>> =
  Object.fromEntries(
    CAMERA_CYCLE.map((mode, i) => [String(i + 1), mode]),
  ) as Readonly<Record<string, CameraMode>>;

/** Double-tap window for number-key frame zoom (ms). */
export const CAM_DOUBLE_TAP_MS = 380;

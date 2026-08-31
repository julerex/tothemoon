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
    detail: "No subject track · WASD + T/B pan · drag to look",
  },
  sun: { title: "Sun", detail: "Focus · double-tap rail to frame" },
  moon: { title: "Moon", detail: "Focus · double-tap rail to frame" },
  earth: { title: "Earth", detail: "Focus · double-tap rail to frame" },
  starbase: {
    title: "Starbase",
    detail: "Pad · double-tap rail to frame",
  },
  aerial: {
    title: "Launchpad Drone",
    detail: "Pad flying drone · wide hold of the stack",
  },
  trench: {
    title: "Launchpad",
    detail: "Flame trench · looking up at the bells",
  },
  gridfin: {
    title: "Booster",
    detail: "Grid fin · hull along Earth",
  },
  chase: {
    title: "Starship",
    detail: "Chase · double-tap rail to frame",
  },
  fin: { title: "Ship fin", detail: "Aft engines" },
  hull: { title: "Ship hull", detail: "Barrel cam" },
  engines: {
    title: "Engine bay",
    detail: "Looking at the Raptor bells",
  },
  enginesDown: {
    title: "Engines down",
    detail: "Looking down through the plume",
  },
  drone: {
    title: "Drone",
    detail: "Sea-level orbit of the floating ship",
  },
};

/**
 * Focus modes cycled by − / =.
 * After Sun / Earth / Moon, order is first use in the Flight 13 webcast
 * (T−5 pad through splash).
 */
export const CAMERA_CYCLE: readonly CameraMode[] = [
  "sun",
  "earth",
  "moon",
  "aerial",
  "starbase",
  "trench",
  "chase",
  "enginesDown",
  "hull",
  "engines",
  "gridfin",
  "fin",
  "drone",
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

/**
 * Vertical FOV for onboard hull / grid-fin cams vs the theater default.
 *
 * Flight 13 fin-cam stills are a wide-angle (slight barrel) look along the
 * hull — the default 50° chase FOV crops to a tight barrel slice and loses
 * the Earth limb. Theater-grade: a wider perspective FOV, not a real fisheye
 * mesh (V18). Trench / pad / chase stay at the default.
 */

/** Opening / chase / body cameras (set at bootstrap). */
export const DEFAULT_CAM_FOV_DEG = 50;

/** Fin + grid-fin mounts — webcast hull-cam class. */
export const ONBOARD_CAM_FOV_DEG = 84;

/**
 * Vertical FOV (degrees) for a camera focus.
 * Fin / gridfin use the wide onboard lens; everything else stays default.
 */
export function cameraFovForFocus(focus: string): number {
  if (focus === "fin" || focus === "gridfin") return ONBOARD_CAM_FOV_DEG;
  return DEFAULT_CAM_FOV_DEG;
}

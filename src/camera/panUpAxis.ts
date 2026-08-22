/**
 * World-space T/B pan axis for tracked camera focuses.
 *
 * Starbase and the pad aerial drone climb along local surface up so T/B is
 * perpendicular to the Earth at the pad. Other modes return null so the
 * director pans along camera.up.
 */

import { starbasePadState } from "../physics/earthFrame";
import {
  DEFAULT_EPHEMERIS,
  type EphemerisEpoch,
} from "../physics/ephemerisEpoch";
import { set, type V3 } from "../physics/vec3";
import { isPadFocus, type CameraMode } from "./cameraMode";

/**
 * Fill `out` with the T/B pan axis for `mode`, or return null when the
 * director should pan along camera.up instead.
 */
export function panUpAxisForMode(
  mode: CameraMode,
  t: number,
  out: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 | null {
  if (!isPadFocus(mode)) return null;
  const pad = starbasePadState(t, epoch);
  return set(out, pad.up.x, pad.up.y, pad.up.z);
}

/**
 * World-space T/B pan axis for tracked camera focuses.
 *
 * Sun / Earth / Moon climb along ecliptic north so WASD stays in Earth's
 * orbital plane. Starbase, the pad aerial drone, and the launch-tower look
 * climb along local surface up so T/B is perpendicular to the Earth at the
 * pad. Other modes return null so the director pans along camera.up.
 */

import { starbasePadState } from "../physics/earthFrame";
import {
  DEFAULT_EPHEMERIS,
  type EphemerisEpoch,
} from "../physics/ephemerisEpoch";
import { set, type V3 } from "../physics/vec3";
import { isPadFocus, type CameraMode } from "./cameraMode";
import { ECLIPTIC_NORTH_AXIS } from "./yawAxis";

function isEclipticPanFocus(mode: CameraMode): boolean {
  return mode === "sun" || mode === "earth" || mode === "moon";
}

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
  if (isEclipticPanFocus(mode)) {
    return set(
      out,
      ECLIPTIC_NORTH_AXIS.x,
      ECLIPTIC_NORTH_AXIS.y,
      ECLIPTIC_NORTH_AXIS.z,
    );
  }
  if (!isPadFocus(mode)) return null;
  const pad = starbasePadState(t, epoch);
  return set(out, pad.up.x, pad.up.y, pad.up.z);
}

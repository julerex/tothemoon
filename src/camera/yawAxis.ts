/**
 * World-space Q/E yaw axes for tracked camera focuses.
 *
 * Sun yaws about ecliptic north (perpendicular to Earth's orbital ellipse in
 * XY). Earth yaws about the geographic north–south pole. Starbase yaws about
 * local surface up at the pad. Other modes return null so the director keeps
 * today's camera.up yaw.
 */

import { earthNorthPole, starbasePadState } from "../physics/earthFrame";
import {
  DEFAULT_EPHEMERIS,
  type EphemerisEpoch,
} from "../physics/ephemerisEpoch";
import { set, type V3 } from "../physics/vec3";
import { isPadFocus, type CameraMode } from "./cameraMode";

/** Ecliptic / orbital north — perpendicular to Earth's heliocentric ellipse. */
export const ECLIPTIC_NORTH_AXIS: Readonly<V3> = { x: 0, y: 0, z: 1 };

/**
 * Fill `out` with the Q/E yaw axis for `mode`, or return null when the
 * director should yaw about camera.up instead.
 */
export function yawAxisForMode(
  mode: CameraMode,
  t: number,
  out: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 | null {
  if (mode === "sun") {
    return set(out, ECLIPTIC_NORTH_AXIS.x, ECLIPTIC_NORTH_AXIS.y, ECLIPTIC_NORTH_AXIS.z);
  }
  if (mode === "earth") return earthNorthPole(out);
  if (isPadFocus(mode)) {
    const pad = starbasePadState(t, epoch);
    return set(out, pad.up.x, pad.up.y, pad.up.z);
  }
  return null;
}

/**
 * Brown "You are underground!" hold when the camera is inside Earth or Moon.
 */

import type { Vec3Like } from "../camera/surfaceClamp";
import { cameraUnderground } from "../camera/surfaceClamp";
import { bodyPositions } from "../physics/bodies";
import { R_MOON } from "../physics/constants";
import { earthNorthPole } from "../physics/earthFrame";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";

/** Copy shown in the center of the overlay. */
export const UNDERGROUND_COPY = "You are underground!";

/** Toggle `hidden` on the overlay node. No-op when `el` is missing. */
export function applyUndergroundOverlay(
  el: { hidden: boolean } | null,
  underground: boolean,
): void {
  if (!el) return;
  el.hidden = !underground;
}

/**
 * Show or hide `#underground` from the live camera eye and ephemeris.
 * Call after the camera director has seated this frame.
 */
export function syncUndergroundOverlay(
  cameraPos: Vec3Like,
  simT: number,
  epoch: EphemerisEpoch,
): void {
  const b = bodyPositions(simT, epoch);
  applyUndergroundOverlay(
    document.getElementById("underground"),
    cameraUnderground(cameraPos, {
      earth: b.earth,
      moon: b.moon,
      north: earthNorthPole(),
      moonRadius: R_MOON,
    }),
  );
}

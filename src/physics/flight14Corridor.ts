/**
 * Flight 14 launch corridor.
 *
 * Ascent uses the same passively safe Starbase → Indian Ocean great circle as
 * Flight 13 (SpaceX: health-check coast before the circularization burn).
 * There is no Chile splash aim point: after insertion the ship coasts
 * inertially and the deorbit burn is booked on the public clock. Splash is
 * wherever that force model meets the sea.
 */
export {
  corridorAlongAt,
  flight13GreatCirclePlane as flight14AscentPlane,
  GAUTENG_LAT,
  GAUTENG_LON,
  siteUnit,
  type Flight13CorridorPlane as Flight14CorridorPlane,
} from "./flight13Corridor";

/** Pacific west of Chile (label / briefing only — not a splash buoy). */
export const CHILE_WEST_LAT = (-30.0 * Math.PI) / 180;
export const CHILE_WEST_LON = (-80.0 * Math.PI) / 180;

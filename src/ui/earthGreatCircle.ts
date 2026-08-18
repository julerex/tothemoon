/**
 * Whole-Earth great-circle cross-section (black & white, true scale).
 *
 * Flight 13 corridor: plane through Starbase and the Indian Ocean splashdown
 * zone; labels for Starbase, Gauteng, landing, and Australia projected onto
 * that great circle. Pure helpers are scrub-safe; canvas draw is live.
 */

export type {
  EarthGcBounds,
  EarthGcLabel,
  EarthGcModel,
  EarthGcPlane,
  EarthGcSite,
  PlanePoint,
  ViewTransform,
} from "./earthGreatCircleGeometry";

export {
  AUSTRALIA_LAT,
  AUSTRALIA_LON,
  buildFlight13EarthGcModel,
  corridorAngleRad,
  fitEarthGcView,
  FLIGHT13_SITES,
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
  flight13GreatCirclePlane,
  GAUTENG_LAT,
  GAUTENG_LON,
  labelAngleOrder,
  projectSiteToPlane,
  siteUnit,
  suborbitalArcPoints,
} from "./earthGreatCircleGeometry";

export { drawEarthGreatCircle, worldToCanvas } from "./earthGreatCircleDraw";

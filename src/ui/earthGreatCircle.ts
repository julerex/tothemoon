/**
 * Whole-Earth great-circle cross-section (black & white, true scale).
 *
 * Flight 13 corridor: the Starbase–Gauteng great circle, with labels for
 * Starbase, Gauteng, the Indian Ocean, and Australia. Pure helpers are
 * scrub-safe; canvas draw is live.
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
  flight13GreatCirclePlane,
  GAUTENG_LAT,
  GAUTENG_LON,
  labelAngleOrder,
  projectSiteToPlane,
  siteUnit,
  suborbitalArcPoints,
} from "./earthGreatCircleGeometry";

export { drawEarthGreatCircle, worldToCanvas } from "./earthGreatCircleDraw";

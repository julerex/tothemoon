/**
 * Ascent / return to launch site cross-section: true-scale Earth arc + atmosphere shell in the
 * Starbase launch plane (mesh-local up × east).
 *
 * Black & white diagram for reading booster altitude vs downrange from liftoff
 * through chopsticks catch or gulf hard splash. Live craft markers use the stacked launch
 * silhouette until hot-stage, then separate Super Heavy / Starship glyphs.
 * Pure helpers are scrub-safe; canvas draw is live.
 */

export type {
  CrossSectionBounds,
  CrossSectionLive,
  CrossSectionModel,
  LaunchPlaneBasis,
  PlanePoint,
  TimedPlanePoint,
  ViewTransform,
} from "./crossSectionGeometry";

export {
  buildCrossSectionModel,
  fitView,
  launchPlaneBasis,
  planeAltitudeKm,
  projectToLaunchPlane,
  samplePosAt,
  stageStateFromSamples,
  surfaceArcKm,
  trailUpTo,
} from "./crossSectionGeometry";

export { liveCrossSection } from "./crossSectionLive";

export { drawCrossSection, worldToCanvas } from "./crossSectionDraw";

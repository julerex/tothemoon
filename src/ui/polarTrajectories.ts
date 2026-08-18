/**
 * Earth-centric 2-D trajectories looking down the ecliptic normal.
 *
 * Theater frame is heliocentric **ecliptic J2000** (XY = ecliptic plane).
 * This map drops the component along ecliptic +Z (axis ⟂ Earth's orbital
 * plane) so craft and Moon paths lie in that plane. Black & white, true scale.
 * Pure helpers are scrub-safe; canvas draw is live.
 */

export type {
  PolarBasis,
  PolarBounds,
  PolarLive,
  PolarPoint,
  PolarTrajectoryModel,
  TimedPolarPoint,
  ViewTransform,
} from "./polarTrajectoriesGeometry";

export {
  buildPolarTrajectoryModel,
  craftEarthRel,
  fitPolarView,
  moonEarthRel,
  polarBasisLookingNorth,
  projectEarthCentricPolar,
  projectedMoonOrbit,
  trailUpTo,
} from "./polarTrajectoriesGeometry";

export { livePolar } from "./polarTrajectoriesLive";

export { drawPolarTrajectories, worldToCanvas } from "./polarTrajectoriesDraw";

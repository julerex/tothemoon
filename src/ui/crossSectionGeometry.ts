/**
 * Ascent / RTLS cross-section: projection, model build, and live sampling.
 * Canvas paint lives in crossSectionDraw.ts.
 */

import {
  ATM_H_MAX_KM,
  R_EARTH,
  STARBASE_LAT,
  STARBASE_LON,
} from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import { geocentricRadiusAt } from "../physics/wgs84";
import {
  geodeticToMeshLocal,
  inertialRelToMeshLocal,
} from "../physics/earthFrame";
import type { RecoveryProfile, StageState } from "../physics/boosterRecovery";
import type { ReadonlySample } from "../physics/missionTypes";
import { len, type V3, v3 } from "../physics/vec3";
import { fitBoxView, type ViewTransform } from "./canvasDiagram";
import { fillAllTrails } from "./crossSectionTrails";

/** 2-D point in the launch plane (km): +x east of pad radial, +y pad-up. */
export type PlanePoint = { x: number; y: number };

/** Trail sample with mission time (for partial path up to “now”). */
export type TimedPlanePoint = PlanePoint & { t: number };

export type LaunchPlaneBasis = {
  /** Unit pad radial in mesh-local. */
  up: V3;
  /** Unit local east in mesh-local (downrange positive). */
  east: V3;
};

export type CrossSectionBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type CrossSectionModel = {
  basis: LaunchPlaneBasis;
  /** Stack path until stage-out (and ship while still in frame). */
  shipTrail: TimedPlanePoint[];
  /** Booster: stacked path + recovery (chopsticks RTLS or gulf hard splash). */
  boosterTrail: TimedPlanePoint[];
  /** Stage-out mission time, or null if never staged. */
  stageT: number | null;
  bounds: CrossSectionBounds;
  /** Atmosphere shell radius (km). */
  rAtm: number;
  rEarth: number;
};

export type CrossSectionLive = {
  ship: PlanePoint | null;
  booster: PlanePoint | null;
  /** True after stage-out. */
  staged: boolean;
  /** Booster recovery fade 0–1 (0 = gone). */
  boosterFade: number;
  shipAltKm: number;
  boosterAltKm: number;
  shipRangeKm: number;
  boosterRangeKm: number;
  /** Recovery profile used to build the booster trail (legend copy). */
  recoveryProfile: RecoveryProfile;
};

export type { ViewTransform };

const _local = v3();
const _rel = v3();

/** Age past which we stop extending the return to launch site trail after fade. */
const LANDING_HOLD_CUT = 320;
void LANDING_HOLD_CUT;

/** Arc steps used to sweep the surface / atmosphere shells into view. */
const ATM_ARC_STEPS = 24;

/**
 * Mesh-local orthonormal basis at Starbase: up = pad radial, east = due east.
 * Fixed for the spinning Earth mesh (ground-relative diagram).
 */
export function launchPlaneBasis(): LaunchPlaneBasis {
  const up = padUpUnit();
  const east = padEastUnit(up);
  return { up, east };
}

function padUpUnit(): V3 {
  const pad = v3();
  geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, R_EARTH, pad);
  const L = len(pad) || 1;
  return v3(pad.x / L, pad.y / L, pad.z / L);
}

function padEastUnit(up: V3): V3 {
  const pad = v3();
  geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, R_EARTH, pad);
  const pad2 = v3();
  geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON + 1e-4, R_EARTH, pad2);
  const east = v3(pad2.x - pad.x, pad2.y - pad.y, pad2.z - pad.z);
  normalizeInPlace(east);
  reorthogonalizeEast(east, up);
  return east;
}

function normalizeInPlace(v: V3): void {
  const L = len(v) || 1;
  v.x /= L;
  v.y /= L;
  v.z /= L;
}

function reorthogonalizeEast(east: V3, up: V3): void {
  const d = east.x * up.x + east.y * up.y + east.z * up.z;
  east.x -= up.x * d;
  east.y -= up.y * d;
  east.z -= up.z * d;
  normalizeInPlace(east);
}

/**
 * Project an inertial (heliocentric) position into the Starbase launch plane.
 * Drops the out-of-plane component so return to launch site stays readable in 2-D.
 */
export function projectToLaunchPlane(
  pos: V3,
  t: number,
  basis: LaunchPlaneBasis,
  out: PlanePoint = { x: 0, y: 0 },
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): PlanePoint {
  const b = bodyPositions(t, epoch);
  _rel.x = pos.x - b.earth.x;
  _rel.y = pos.y - b.earth.y;
  _rel.z = pos.z - b.earth.z;
  inertialRelToMeshLocal(_rel, t, _local, epoch);
  out.x = dot3(_local, basis.east);
  out.y = dot3(_local, basis.up);
  return out;
}

function dot3(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Geocentric altitude (km) from a plane point (uses planar radius). */
export function planeAltitudeKm(p: PlanePoint, rEarth = R_EARTH): number {
  return Math.hypot(p.x, p.y) - rEarth;
}

/**
 * Signed surface arc from the pad meridian (km): R · θ with θ = atan2(x, y).
 * Positive = downrange (east of pad radial).
 */
export function surfaceArcKm(p: PlanePoint, rEarth = R_EARTH): number {
  return Math.atan2(p.x, p.y) * rEarth;
}

/**
 * Build static trails + view bounds from mission samples and optional stage state.
 * Ship trail covers launch→early post-stage while inside the booster envelope;
 * booster trail is stacked ascent + full return to launch site to catch.
 */
export function buildCrossSectionModel(
  samples: readonly ReadonlySample[],
  stage: StageState | null,
  recovery: RecoveryProfile = "chopsticks",
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): CrossSectionModel {
  const basis = launchPlaneBasis();
  const shipTrail: TimedPlanePoint[] = [];
  const boosterTrail: TimedPlanePoint[] = [];
  const stageT = stage?.t ?? null;
  fillAllTrails(samples, stage, stageT, recovery, basis, shipTrail, boosterTrail, epoch);
  const rEarth = geocentricRadiusAt(STARBASE_LAT);
  const rAtm = rEarth + ATM_H_MAX_KM;
  const bounds = computeCrossSectionBounds(shipTrail, boosterTrail, rEarth, rAtm);
  return { basis, shipTrail, boosterTrail, stageT, bounds, rAtm, rEarth };
}

/** Bounds grown to include `p` (does not modify `b`). */
function expandBounds(
  b: CrossSectionBounds,
  p: PlanePoint,
  pad = 0,
): CrossSectionBounds {
  return {
    xMin: Math.min(b.xMin, p.x - pad),
    xMax: Math.max(b.xMax, p.x + pad),
    yMin: Math.min(b.yMin, p.y - pad),
    yMax: Math.max(b.yMax, p.y + pad),
  };
}

function computeCrossSectionBounds(
  shipTrail: TimedPlanePoint[],
  boosterTrail: TimedPlanePoint[],
  rEarth: number,
  rAtm: number,
): CrossSectionBounds {
  const trailBounds = [...boosterTrail, ...shipTrail].reduce(
    (acc, p) => expandBounds(acc, p),
    emptyBounds(),
  );
  if (!Number.isFinite(trailBounds.xMin)) return fallbackPadBounds(rEarth, rAtm);
  return padCrossSectionBounds(
    expandBoundsWithAtmArc(trailBounds, rEarth, rAtm),
    rEarth,
  );
}

function emptyBounds(): CrossSectionBounds {
  return { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity };
}

function fallbackPadBounds(rEarth: number, rAtm: number): CrossSectionBounds {
  return { xMin: -20, xMax: 120, yMin: rEarth - 5, yMax: rAtm + 20 };
}

/**
 * Grow bounds to hold the Earth surface and atmosphere arcs spanning the
 * trails, so the diagram never clips the limb.
 */
function expandBoundsWithAtmArc(
  bounds: CrossSectionBounds,
  rEarth: number,
  rAtm: number,
): CrossSectionBounds {
  const angMin = Math.atan2(bounds.xMin, Math.max(bounds.yMin, 1));
  const angMax = Math.atan2(bounds.xMax, Math.max(bounds.yMin, 1));
  return Array.from({ length: ATM_ARC_STEPS + 1 }, (_unused, i) =>
    angMin + ((angMax - angMin) * i) / ATM_ARC_STEPS,
  ).reduce((acc, a) => {
    const withAtm = expandBounds(acc, { x: rAtm * Math.sin(a), y: rAtm * Math.cos(a) });
    return expandBounds(withAtm, { x: rEarth * Math.sin(a), y: rEarth * Math.cos(a) });
  }, bounds);
}

function padCrossSectionBounds(
  bounds: CrossSectionBounds,
  rEarth: number,
): CrossSectionBounds {
  const padX = 12;
  const padY = 8;
  return {
    xMin: bounds.xMin - padX,
    xMax: bounds.xMax + padX,
    yMin: Math.min(bounds.yMin, rEarth - 4) - padY * 0.25,
    yMax: bounds.yMax + padY,
  };
}

/** Linear position interpolate on samples at time t. */
export function samplePosAt(samples: readonly ReadonlySample[], t: number): V3 | null {
  if (samples.length === 0) return null;
  if (t <= samples[0]!.t) {
    const s = samples[0]!;
    return v3(s.pos.x, s.pos.y, s.pos.z);
  }
  const last = samples[samples.length - 1]!;
  if (t >= last.t) return v3(last.pos.x, last.pos.y, last.pos.z);
  return interpolatePos(samples, t);
}

function interpolatePos(samples: readonly ReadonlySample[], t: number): V3 {
  const { lo, hi } = bisectSamples(samples, t);
  const a = samples[lo]!;
  const b = samples[hi]!;
  const f = (t - a.t) / (b.t - a.t || 1);
  return v3(
    a.pos.x + (b.pos.x - a.pos.x) * f,
    a.pos.y + (b.pos.y - a.pos.y) * f,
    a.pos.z + (b.pos.z - a.pos.z) * f,
  );
}

function bisectSamples(samples: readonly ReadonlySample[], t: number): { lo: number; hi: number } {
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  return { lo, hi };
}

/** Trail points with t ≤ now (for drawing path-so-far). */
export function trailUpTo(
  trail: TimedPlanePoint[],
  t: number,
): TimedPlanePoint[] {
  if (trail.length === 0) return [];
  let i = trail.length;
  while (i > 0 && trail[i - 1]!.t > t) i--;
  return trail.slice(0, Math.max(i, 1));
}

/**
 * Fit bounds into a canvas with equal x/y scale (true scale) and padding.
 * Canvas y increases downward; world +y is up.
 */
export function fitView(
  bounds: CrossSectionBounds,
  cssW: number,
  cssH: number,
  dpr: number,
  padPx = 28,
): ViewTransform {
  return fitBoxView(bounds, cssW, cssH, dpr, padPx);
}

/**
 * Stage state from samples (first staged sample). Pure; no Three.js.
 */
export function stageStateFromSamples(samples: readonly ReadonlySample[]): StageState | null {
  for (const s of samples) {
    if (!s.staged) continue;
    return {
      t: s.t,
      pos: v3(s.pos.x, s.pos.y, s.pos.z),
      vel: v3(s.vel.x, s.vel.y, s.vel.z),
    };
  }
  return null;
}

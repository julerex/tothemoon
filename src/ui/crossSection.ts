/**
 * Ascent / return to launch site cross-section: true-scale Earth arc + atmosphere shell in the
 * Starbase launch plane (mesh-local up × east).
 *
 * Black & white diagram for reading booster altitude vs downrange from liftoff
 * through chopsticks catch or gulf soft-land. Live craft markers use the stacked launch
 * silhouette until hot-stage, then separate Super Heavy / Starship glyphs.
 * Pure helpers are scrub-safe; canvas draw is live.
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
import {
  geodeticToMeshLocal,
  inertialRelToMeshLocal,
} from "../physics/earthFrame";
import {
  boosterVisibleS,
  buildBoosterKeyframes,
  recoverySchedule,
  sampleBoosterRecovery,
  type RecoveryProfile,
  type StageState,
} from "../physics/boosterRecovery";
import type { Sample } from "../physics/missionTypes";
import { len, type V3, v3 } from "../physics/vec3";
import {
  drawBoosterIcon,
  drawShipIcon,
  drawStackLaunchIcon,
} from "./craftSilhouettes";

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
  /** Booster: stacked path + recovery (chopsticks RTLS or gulf soft-land). */
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

const _local = v3();
const _rel = v3();

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

/**
 * Build static trails + view bounds from mission samples and optional stage state.
 * Ship trail covers launch→early post-stage while inside the booster envelope;
 * booster trail is stacked ascent + full return to launch site to catch.
 */
export function buildCrossSectionModel(
  samples: Sample[],
  stage: StageState | null,
  recovery: RecoveryProfile = "chopsticks",
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): CrossSectionModel {
  const basis = launchPlaneBasis();
  const shipTrail: TimedPlanePoint[] = [];
  const boosterTrail: TimedPlanePoint[] = [];
  const stageT = stage?.t ?? null;
  fillAllTrails(samples, stage, stageT, recovery, basis, shipTrail, boosterTrail, epoch);
  return finishCrossSectionModel(basis, shipTrail, boosterTrail, stageT);
}

function fillAllTrails(
  samples: Sample[],
  stage: StageState | null,
  stageT: number | null,
  recovery: RecoveryProfile,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  boosterTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
): void {
  fillStackedAscent(samples, stageT, basis, shipTrail, boosterTrail, epoch);
  fillPostStageShip(samples, stageT, basis, shipTrail, epoch);
  if (stage) fillBoosterRecovery(stage, recovery, basis, boosterTrail, epoch);
}

function finishCrossSectionModel(
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  boosterTrail: TimedPlanePoint[],
  stageT: number | null,
): CrossSectionModel {
  const rEarth = R_EARTH;
  const rAtm = R_EARTH + ATM_H_MAX_KM;
  const bounds = computeCrossSectionBounds(shipTrail, boosterTrail, rEarth, rAtm);
  return { basis, shipTrail, boosterTrail, stageT, bounds, rAtm, rEarth };
}

function fillStackedAscent(
  samples: Sample[],
  stageT: number | null,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  boosterTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
): void {
  const pt = { x: 0, y: 0 };
  let lastShipT = -Infinity;
  for (const s of samples) {
    lastShipT = maybePushStacked(s, stageT, basis, shipTrail, boosterTrail, epoch, pt, lastShipT);
    if (lastShipT === Number.POSITIVE_INFINITY) break;
  }
}

function maybePushStacked(
  s: Sample,
  stageT: number | null,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  boosterTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
  pt: PlanePoint,
  lastShipT: number,
): number {
  if (stageT != null && s.t > stageT + 1e-6) return Number.POSITIVE_INFINITY;
  if (s.t - lastShipT < 0.35 && s.t !== stageT) return lastShipT;
  projectToLaunchPlane(s.pos, s.t, basis, pt, epoch);
  const q = { x: pt.x, y: pt.y, t: s.t };
  shipTrail.push(q);
  boosterTrail.push({ ...q });
  return s.t;
}

function fillPostStageShip(
  samples: Sample[],
  stageT: number | null,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
): void {
  if (stageT == null) return;
  appendPostStageSamples(samples, stageT, basis, shipTrail, epoch);
}

function appendPostStageSamples(
  samples: Sample[],
  stageT: number,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
): void {
  const pt = { x: 0, y: 0 };
  let lastShipT = shipTrail[shipTrail.length - 1]?.t ?? -Infinity;
  for (const s of samples) {
    lastShipT = stepPostStage(s, stageT, basis, shipTrail, epoch, pt, lastShipT);
    if (lastShipT === Number.POSITIVE_INFINITY) break;
  }
}

function stepPostStage(
  s: Sample,
  stageT: number,
  basis: LaunchPlaneBasis,
  shipTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
  pt: PlanePoint,
  lastShipT: number,
): number {
  if (s.t <= stageT) return lastShipT;
  if (s.t > stageT + 45) return Number.POSITIVE_INFINITY;
  if (s.t - lastShipT < 0.5) return lastShipT;
  projectToLaunchPlane(s.pos, s.t, basis, pt, epoch);
  if (shipLeftEnvelope(pt)) return Number.POSITIVE_INFINITY;
  shipTrail.push({ x: pt.x, y: pt.y, t: s.t });
  return s.t;
}

function shipLeftEnvelope(pt: PlanePoint): boolean {
  return Math.abs(pt.x) > 160 || Math.hypot(pt.x, pt.y) > R_EARTH + 160;
}

function fillBoosterRecovery(
  stage: StageState,
  recovery: RecoveryProfile,
  basis: LaunchPlaneBasis,
  boosterTrail: TimedPlanePoint[],
  epoch: EphemerisEpoch,
): void {
  const kfs = buildBoosterKeyframes(stage, recovery, epoch);
  const vis = boosterVisibleS(recoverySchedule(recovery));
  const pt = { x: 0, y: 0 };
  for (let age = 0; age <= vis; age += 1.0) {
    pushRecoverySample(stage, age, kfs, recovery, basis, boosterTrail, pt, epoch);
  }
}

function pushRecoverySample(
  stage: StageState,
  age: number,
  kfs: ReturnType<typeof buildBoosterKeyframes>,
  recovery: RecoveryProfile,
  basis: LaunchPlaneBasis,
  boosterTrail: TimedPlanePoint[],
  pt: PlanePoint,
  epoch: EphemerisEpoch,
): void {
  const rec = sampleBoosterRecovery(stage, age, kfs, recovery, epoch);
  if (rec.phase === "done" || rec.fade < 0.02) return;
  const t = stage.t + age;
  const pos = v3(rec.pos.x, rec.pos.y, rec.pos.z);
  projectToLaunchPlane(pos, t, basis, pt, epoch);
  boosterTrail.push({ x: pt.x, y: pt.y, t });
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

/** Arc steps used to sweep the surface / atmosphere shells into view. */
const ATM_ARC_STEPS = 24;

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

/** Age past which we stop extending the return to launch site trail after fade. */
const LANDING_HOLD_CUT = 320;
void LANDING_HOLD_CUT;

/**
 * Live craft positions at mission time `t` (same projection as the trails).
 */
export function liveCrossSection(
  model: CrossSectionModel,
  samples: Sample[],
  stage: StageState | null,
  t: number,
  keyframes?: ReturnType<typeof buildBoosterKeyframes> | null,
  recovery: RecoveryProfile = "chopsticks",
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): CrossSectionLive {
  const ship = liveShipPoint(model, samples, t, epoch);
  const boost = liveBoosterPoint(ship, stage, t, keyframes, recovery, epoch, model.basis);
  return assembleLive(model, ship, boost, recovery);
}

function liveShipPoint(
  model: CrossSectionModel,
  samples: Sample[],
  t: number,
  epoch: EphemerisEpoch,
): PlanePoint | null {
  const shipPos = samplePosAt(samples, t);
  if (!shipPos) return null;
  const shipPt: PlanePoint = { x: 0, y: 0 };
  projectToLaunchPlane(shipPos, t, model.basis, shipPt, epoch);
  return { x: shipPt.x, y: shipPt.y };
}

function liveBoosterPoint(
  ship: PlanePoint | null,
  stage: StageState | null,
  t: number,
  keyframes: ReturnType<typeof buildBoosterKeyframes> | null | undefined,
  recovery: RecoveryProfile,
  epoch: EphemerisEpoch,
  basis: LaunchPlaneBasis,
): { booster: PlanePoint | null; boosterFade: number; staged: boolean } {
  if (stage && t + 1e-9 >= stage.t) {
    return recoveryBooster(stage, t, keyframes, recovery, epoch, basis);
  }
  if (ship) return { booster: { x: ship.x, y: ship.y }, boosterFade: 1, staged: false };
  return { booster: null, boosterFade: 0, staged: false };
}

function recoveryBooster(
  stage: StageState,
  t: number,
  keyframes: ReturnType<typeof buildBoosterKeyframes> | null | undefined,
  recovery: RecoveryProfile,
  epoch: EphemerisEpoch,
  basis: LaunchPlaneBasis,
): { booster: PlanePoint | null; boosterFade: number; staged: boolean } {
  const rec = sampleBoosterRecovery(
    stage, t - stage.t, keyframes ?? undefined, recovery, epoch,
  );
  if (rec.phase === "done" || rec.fade < 0.02) {
    return { booster: null, boosterFade: rec.fade, staged: true };
  }
  return { booster: projectRecoveryPos(rec.pos, t, basis, epoch), boosterFade: rec.fade, staged: true };
}

function projectRecoveryPos(
  posIn: { x: number; y: number; z: number },
  t: number,
  basis: LaunchPlaneBasis,
  epoch: EphemerisEpoch,
): PlanePoint {
  const boosterPt: PlanePoint = { x: 0, y: 0 };
  projectToLaunchPlane(v3(posIn.x, posIn.y, posIn.z), t, basis, boosterPt, epoch);
  return { x: boosterPt.x, y: boosterPt.y };
}

function assembleLive(
  model: CrossSectionModel,
  ship: PlanePoint | null,
  boost: { booster: PlanePoint | null; boosterFade: number; staged: boolean },
  recovery: RecoveryProfile,
): CrossSectionLive {
  return {
    ship,
    booster: boost.booster,
    staged: boost.staged,
    boosterFade: boost.boosterFade,
    ...liveAltRange(model, ship, boost.booster),
    recoveryProfile: recovery,
  };
}

function liveAltRange(
  model: CrossSectionModel,
  ship: PlanePoint | null,
  booster: PlanePoint | null,
) {
  return {
    shipAltKm: ship ? planeAltitudeKm(ship, model.rEarth) : 0,
    boosterAltKm: booster ? planeAltitudeKm(booster, model.rEarth) : 0,
    shipRangeKm: ship ? surfaceArcKm(ship, model.rEarth) : 0,
    boosterRangeKm: booster ? surfaceArcKm(booster, model.rEarth) : 0,
  };
}

/** Linear position interpolate on samples at time t. */
export function samplePosAt(samples: Sample[], t: number): V3 | null {
  if (samples.length === 0) return null;
  if (t <= samples[0]!.t) {
    const s = samples[0]!;
    return v3(s.pos.x, s.pos.y, s.pos.z);
  }
  const last = samples[samples.length - 1]!;
  if (t >= last.t) return v3(last.pos.x, last.pos.y, last.pos.z);
  return interpolatePos(samples, t);
}

function interpolatePos(samples: Sample[], t: number): V3 {
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

function bisectSamples(samples: Sample[], t: number): { lo: number; hi: number } {
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

export type ViewTransform = {
  /** World km → CSS pixels (isotropic). */
  scale: number;
  /** Canvas origin offset so world (0,0) maps correctly. */
  originX: number;
  originY: number;
  width: number;
  height: number;
  dpr: number;
};

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
  const w = Math.max(cssW, 1);
  const h = Math.max(cssH, 1);
  const bw = Math.max(bounds.xMax - bounds.xMin, 1e-3);
  const bh = Math.max(bounds.yMax - bounds.yMin, 1e-3);
  const scale = Math.min((w - 2 * padPx) / bw, (h - 2 * padPx) / bh);
  return fitViewOrigin(bounds, w, h, scale, dpr);
}

function fitViewOrigin(
  bounds: CrossSectionBounds,
  w: number,
  h: number,
  scale: number,
  dpr: number,
): ViewTransform {
  const usedW = (bounds.xMax - bounds.xMin) * scale;
  const usedH = (bounds.yMax - bounds.yMin) * scale;
  return {
    scale, originX: (w - usedW) / 2 - bounds.xMin * scale,
    originY: (h - usedH) / 2 + bounds.yMax * scale, width: w, height: h, dpr,
  };
}

export function worldToCanvas(
  p: PlanePoint,
  view: ViewTransform,
): { x: number; y: number } {
  return {
    x: view.originX + p.x * view.scale,
    y: view.originY - p.y * view.scale,
  };
}

/** Draw the full black & white cross-section into a 2-D canvas. */
export function drawCrossSection(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  live: CrossSectionLive,
  missionT: number,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  prepareCsCanvas(ctx, cssW, cssH, dpr);
  const view = fitView(model.bounds, cssW, cssH, dpr);
  paintCrossSection(ctx, model, live, missionT, view, cssW, cssH);
}

function paintCrossSection(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  live: CrossSectionLive,
  missionT: number,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  const span = arcSpan(model.bounds);
  drawEarthAndAtmArcs(ctx, model, view, span);
  drawPadTick(ctx, model, view);
  drawCsLabels(ctx, model, view, span);
  drawScaleBar(ctx, view, cssW, cssH);
  drawCsTrails(ctx, model, missionT, view);
  drawStageMark(ctx, model, missionT, view);
  drawLiveIcons(ctx, live, view);
  drawCsReadout(ctx, live, missionT, cssW);
}

function prepareCsCanvas(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  const w = Math.max(1, Math.floor(cssW * dpr));
  const h = Math.max(1, Math.floor(cssH * dpr));
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cssW, cssH);
}

function arcSpan(bounds: CrossSectionBounds): { a0: number; a1: number } {
  const ang0 = Math.atan2(bounds.xMin, (bounds.yMin + bounds.yMax) / 2);
  const ang1 = Math.atan2(bounds.xMax, (bounds.yMin + bounds.yMax) / 2);
  return {
    a0: Math.min(ang0, ang1) - 0.002,
    a1: Math.max(ang0, ang1) + 0.002,
  };
}

function drawEarthAndAtmArcs(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  view: ViewTransform,
  span: { a0: number; a1: number },
): void {
  strokeWhiteArc(ctx, view, model.rEarth, span, 1.5, 1);
  strokeWhiteArc(ctx, view, model.rAtm, span, 1, 0.85);
}

function strokeWhiteArc(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  radius: number,
  span: { a0: number; a1: number },
  width: number,
  alpha: number,
): void {
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  strokeArc(ctx, view, radius, span.a0, span.a1);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPadTick(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  view: ViewTransform,
): void {
  const padSurf = padSurfacePoint(model);
  const scale = (model.rEarth + 3) / model.rEarth;
  const padTop = { x: padSurf.x * scale, y: padSurf.y * scale };
  strokeSegment(ctx, worldToCanvas(padSurf, view), worldToCanvas(padTop, view));
}

function strokeSegment(
  ctx: CanvasRenderingContext2D,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
): void {
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
}

function padSurfacePoint(model: CrossSectionModel): PlanePoint {
  const padWorld: PlanePoint = { x: 0, y: model.rEarth };
  const padRef = model.boosterTrail[0] ?? model.shipTrail[0] ?? padWorld;
  const L = Math.hypot(padRef.x, padRef.y) || model.rEarth;
  return {
    x: padRef.x * (model.rEarth / L),
    y: padRef.y * (model.rEarth / L),
  };
}

function drawCsLabels(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  view: ViewTransform,
  span: { a0: number; a1: number },
): void {
  setCsLabelStyle(ctx);
  fillEarthSurfaceLabel(ctx, model, view, span);
  fillAtmLabel(ctx, model, view, span);
  ctx.globalAlpha = 1;
}

function setCsLabelStyle(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.7;
}

function fillEarthSurfaceLabel(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  view: ViewTransform,
  span: { a0: number; a1: number },
): void {
  const midAng = (span.a0 + span.a1) / 2;
  const p = worldToCanvas(polarOnRadius(model.rEarth - 18, midAng), view);
  ctx.fillText("Earth surface", p.x, p.y);
}

function fillAtmLabel(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  view: ViewTransform,
  span: { a0: number; a1: number },
): void {
  const p = worldToCanvas(polarOnRadius(model.rAtm + 8, span.a1 - 0.01), view);
  ctx.fillText(`Atmosphere ${ATM_H_MAX_KM} km`, p.x, p.y);
}

function polarOnRadius(r: number, a: number): PlanePoint {
  return { x: r * Math.sin(a), y: r * Math.cos(a) };
}

function drawCsTrails(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  missionT: number,
  view: ViewTransform,
): void {
  strokeCsTrail(ctx, view, trailUpTo(model.shipTrail, missionT), 1.25, 0.35);
  strokeCsTrail(ctx, view, trailUpTo(model.boosterTrail, missionT), 1.6, 0.9);
}

function strokeCsTrail(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  trail: PlanePoint[],
  width: number,
  alpha: number,
): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = alpha;
  strokeTrail(ctx, view, trail);
  ctx.globalAlpha = 1;
}

function drawStageMark(
  ctx: CanvasRenderingContext2D,
  model: CrossSectionModel,
  missionT: number,
  view: ViewTransform,
): void {
  if (model.stageT == null || missionT < model.stageT) return;
  const stPt = trailPointAt(model.boosterTrail, model.stageT);
  if (!stPt) return;
  paintStageMark(ctx, worldToCanvas(stPt, view));
}

function paintStageMark(
  ctx: CanvasRenderingContext2D,
  c: { x: number; y: number },
): void {
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = "10px ui-monospace, SF Mono, Menlo, monospace";
  ctx.globalAlpha = 0.75;
  ctx.fillText("hot-stage", c.x + 6, c.y - 6);
  ctx.globalAlpha = 1;
}

function drawLiveIcons(
  ctx: CanvasRenderingContext2D,
  live: CrossSectionLive,
  view: ViewTransform,
): void {
  if (!live.staged && live.ship) {
    drawStackLaunchIcon(ctx, worldToCanvas(live.ship, view));
    return;
  }
  if (live.ship) {
    drawShipIcon(ctx, worldToCanvas(live.ship, view), 0.55);
  }
  if (live.booster && live.boosterFade > 0.02) {
    drawBoosterIcon(ctx, worldToCanvas(live.booster, view), live.boosterFade);
  }
}

function drawCsReadout(
  ctx: CanvasRenderingContext2D,
  live: CrossSectionLive,
  missionT: number,
  cssW: number,
): void {
  setCsReadoutStyle(ctx);
  fillCsReadoutLines(ctx, live, missionT);
  fillCsLegend(ctx, cssW, live.recoveryProfile);
}

function setCsReadoutStyle(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

function fillCsLegend(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  recovery: RecoveryProfile = "chopsticks",
): void {
  ctx.textAlign = "right";
  ctx.globalAlpha = 0.8;
  ctx.fillText("white trails · true scale · launch plane", cssW - 12, 10);
  const dest = recovery === "gulf" ? "Gulf soft-land" : "chopsticks";
  ctx.fillText(`Booster path: liftoff → ${dest}`, cssW - 12, 25);
  ctx.globalAlpha = 1;
}

function fillCsReadoutLines(
  ctx: CanvasRenderingContext2D,
  live: CrossSectionLive,
  missionT: number,
): void {
  const lines = csReadoutLines(live, missionT);
  let ly = 10;
  for (const line of lines) {
    ctx.fillText(line, 12, ly);
    ly += 15;
  }
}

function csReadoutLines(live: CrossSectionLive, missionT: number): string[] {
  const lines = [`t = ${formatMissionClock(missionT)}`];
  if (live.booster) {
    lines.push(altRangeLine("Booster ", live.boosterAltKm, live.boosterRangeKm));
  }
  if (live.ship) lines.push(shipStackReadout(live));
  return lines;
}

function altRangeLine(prefix: string, alt: number, range: number): string {
  return `${prefix} alt ${fmtKm(alt)}  range ${fmtKm(range)}`;
}

function shipStackReadout(live: CrossSectionLive): string {
  const prefix = live.staged ? "Ship    " : "Stack   ";
  return altRangeLine(prefix, live.shipAltKm, live.shipRangeKm);
}

function strokeArc(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  radius: number,
  a0: number,
  a1: number,
): void {
  for (let i = 0; i <= 64; i++) {
    const a = a0 + ((a1 - a0) * i) / 64;
    const p = worldToCanvas(
      { x: radius * Math.sin(a), y: radius * Math.cos(a) },
      view,
    );
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

function strokeTrail(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  trail: PlanePoint[],
): void {
  if (trail.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < trail.length; i++) {
    const c = worldToCanvas(trail[i]!, view);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  }
  ctx.stroke();
}

function trailPointAt(
  trail: TimedPlanePoint[],
  t: number,
): PlanePoint | null {
  if (trail.length === 0) return null;
  return nearestTrailPoint(trail, t);
}

function nearestTrailPoint(trail: TimedPlanePoint[], t: number): PlanePoint {
  let best = trail[0]!;
  let bestD = Math.abs(best.t - t);
  for (const p of trail) {
    const d = Math.abs(p.t - t);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  const km = pickCsScaleKm(view, cssW);
  const geom = csScaleGeom(view, cssW, cssH, km);
  paintCsScaleTicks(ctx, geom);
  paintCsScaleLabel(ctx, geom, `${km} km`);
}

function pickCsScaleKm(view: ViewTransform, cssW: number): number {
  for (const c of [50, 20, 10, 5]) {
    if (c * view.scale < cssW * 0.28) return c;
  }
  return 20;
}

function csScaleGeom(
  view: ViewTransform,
  cssW: number,
  cssH: number,
  km: number,
): { x0: number; x1: number; y: number } {
  const px = km * view.scale;
  const x1 = cssW - 16;
  return { x0: x1 - px, x1, y: cssH - 18 };
}

function paintCsScaleTicks(
  ctx: CanvasRenderingContext2D,
  g: { x0: number; x1: number; y: number },
): void {
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  pathCsScale(ctx, g);
  ctx.stroke();
}

function pathCsScale(
  ctx: CanvasRenderingContext2D,
  g: { x0: number; x1: number; y: number },
): void {
  ctx.moveTo(g.x0, g.y);
  ctx.lineTo(g.x1, g.y);
  ctx.moveTo(g.x0, g.y - 4);
  ctx.lineTo(g.x0, g.y + 4);
  ctx.moveTo(g.x1, g.y - 4);
  ctx.lineTo(g.x1, g.y + 4);
}

function paintCsScaleLabel(
  ctx: CanvasRenderingContext2D,
  g: { x0: number; x1: number; y: number },
  label: string,
): void {
  ctx.font = "10px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, (g.x0 + g.x1) / 2, g.y - 6);
}

function fmtKm(km: number): string {
  if (!Number.isFinite(km)) return "—";
  if (Math.abs(km) < 1) return `${(km * 1000).toFixed(0)} m`;
  return `${km.toFixed(1)} km`;
}

function formatMissionClock(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  if (m < 60) return `T+${m}:${sec.toFixed(1).padStart(4, "0")}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `T+${h}h ${String(mm).padStart(2, "0")}m`;
}

/**
 * Stage state from samples (first staged sample). Pure; no Three.js.
 */
export function stageStateFromSamples(samples: Sample[]): StageState | null {
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

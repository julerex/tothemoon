/**
 * Earth-centric 2-D trajectories looking down the ecliptic normal.
 *
 * Theater frame is heliocentric **ecliptic J2000** (XY = ecliptic plane).
 * This map drops the component along ecliptic +Z (axis ⟂ Earth's orbital
 * plane) so craft and Moon paths lie in that plane. Black & white, true scale.
 * Pure helpers are scrub-safe; canvas draw is live.
 */

import { R_EARTH, R_MOON, A_EM } from "../physics/constants";
import { bodyPositions, osculatingMoonOrbitPoints } from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import type { Sample } from "../physics/missionTypes";
import { dot, type V3, v3 } from "../physics/vec3";

/** 2-D point in the ecliptic plane (km), looking from ecliptic north. */
export type PolarPoint = { x: number; y: number };

export type TimedPolarPoint = PolarPoint & { t: number };

export type PolarBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

/**
 * Orthonormal frame: e1, e2 span the ecliptic plane; n = ecliptic north (+Z).
 * Looking from +n, +x = e1 (ecliptic X), +y = e2 (ecliptic Y).
 */
export type PolarBasis = {
  n: V3;
  e1: V3;
  e2: V3;
};

export type PolarTrajectoryModel = {
  basis: PolarBasis;
  /** Ship / stack path (Earth-relative, ecliptic projection). */
  shipTrail: TimedPolarPoint[];
  /** Moon path over the same mission window. */
  moonTrail: TimedPolarPoint[];
  bounds: PolarBounds;
  rEarth: number;
  rMoon: number;
  /** Mean Earth–Moon distance (km) — reference ring. */
  aEm: number;
};

export type PolarLive = {
  ship: PolarPoint | null;
  moon: PolarPoint | null;
  shipR: number;
  moonR: number;
  t: number;
};

export type ViewTransform = {
  scale: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  dpr: number;
};

const _rel = v3();

/**
 * Fixed theater basis: look along ecliptic +Z (perpendicular to the ecliptic).
 * e1 = ecliptic +X, e2 = ecliptic +Y, n = ecliptic +Z.
 *
 * Named `polarBasisLookingNorth` for API stability; “north” here means
 * ecliptic north, not Earth's geographic pole.
 */
export function polarBasisLookingNorth(): PolarBasis {
  return {
    n: v3(0, 0, 1),
    e1: v3(1, 0, 0),
    e2: v3(0, 1, 0),
  };
}

/**
 * Project an Earth-relative inertial vector into the ecliptic plane.
 * Drops the ecliptic-normal component (z in the theater frame).
 */
export function projectEarthCentricPolar(
  earthRel: V3,
  basis: PolarBasis,
  out: PolarPoint = { x: 0, y: 0 },
): PolarPoint {
  out.x = dot(earthRel, basis.e1);
  out.y = dot(earthRel, basis.e2);
  return out;
}

/**
 * Earth-relative craft position at a sample (heliocentric sample − Earth).
 */
export function craftEarthRel(
  sample: Sample,
  out: V3 = v3(),
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  const b = bodyPositions(sample.t, epoch);
  out.x = sample.pos.x - b.earth.x;
  out.y = sample.pos.y - b.earth.y;
  out.z = sample.pos.z - b.earth.z;
  return out;
}

/** Moon − Earth at mission time t. */
export function moonEarthRel(
  t: number,
  out: V3 = v3(),
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  const b = bodyPositions(t, epoch);
  out.x = b.moon.x - b.earth.x;
  out.y = b.moon.y - b.earth.y;
  out.z = b.moon.z - b.earth.z;
  return out;
}

/**
 * Build polar trails from baked samples. Downsamples for draw performance
 * while keeping first/last and phase edges.
 */
export function buildPolarTrajectoryModel(
  samples: Sample[],
  maxPoints = 1800,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): PolarTrajectoryModel | null {
  if (samples.length < 2) return null;
  const basis = polarBasisLookingNorth();
  const shipTrail: TimedPolarPoint[] = [];
  const moonTrail: TimedPolarPoint[] = [];
  const maxR = fillPolarTrails(samples, basis, shipTrail, moonTrail, maxPoints, epoch);
  return finishPolarModel(basis, shipTrail, moonTrail, maxR);
}

function finishPolarModel(
  basis: PolarBasis,
  shipTrail: TimedPolarPoint[],
  moonTrail: TimedPolarPoint[],
  maxR: number,
): PolarTrajectoryModel {
  return {
    basis,
    shipTrail,
    moonTrail,
    bounds: polarBoundsFromMaxR(maxR),
    rEarth: R_EARTH,
    rMoon: R_MOON,
    aEm: A_EM,
  };
}

function fillPolarTrails(
  samples: Sample[],
  basis: PolarBasis,
  shipTrail: TimedPolarPoint[],
  moonTrail: TimedPolarPoint[],
  maxPoints: number,
  epoch: EphemerisEpoch,
): number {
  const maxR = samplePolarLoop(samples, basis, shipTrail, moonTrail, maxPoints, epoch);
  return Math.max(maxR, expandMaxRForMoonOrbit(samples, basis, epoch));
}

function samplePolarLoop(
  samples: Sample[],
  basis: PolarBasis,
  shipTrail: TimedPolarPoint[],
  moonTrail: TimedPolarPoint[],
  maxPoints: number,
  epoch: EphemerisEpoch,
): number {
  const n = samples.length;
  const stride = Math.max(1, Math.ceil(n / maxPoints));
  let maxR = R_EARTH;
  for (let i = 0; i < n; i++) {
    if (!shouldKeepPolarSample(samples, i, n, stride)) continue;
    maxR = Math.max(maxR, pushPolarSample(samples[i]!, basis, shipTrail, moonTrail, epoch));
  }
  return maxR;
}

function shouldKeepPolarSample(
  samples: Sample[],
  i: number,
  n: number,
  stride: number,
): boolean {
  if (i === 0 || i === n - 1 || i % stride === 0) return true;
  return i > 0 && samples[i - 1]!.phase !== samples[i]!.phase;
}

function pushPolarSample(
  s: Sample,
  basis: PolarBasis,
  shipTrail: TimedPolarPoint[],
  moonTrail: TimedPolarPoint[],
  epoch: EphemerisEpoch,
): number {
  craftEarthRel(s, _rel, epoch);
  const sp = projectEarthCentricPolar(_rel, basis);
  shipTrail.push({ x: sp.x, y: sp.y, t: s.t });
  moonEarthRel(s.t, _rel, epoch);
  const mp = projectEarthCentricPolar(_rel, basis);
  moonTrail.push({ x: mp.x, y: mp.y, t: s.t });
  return Math.max(Math.hypot(sp.x, sp.y), Math.hypot(mp.x, mp.y), A_EM);
}

function expandMaxRForMoonOrbit(
  samples: Sample[],
  basis: PolarBasis,
  epoch: EphemerisEpoch,
): number {
  let maxR = 0;
  const n = samples.length;
  for (const t of [samples[0]!.t, samples[n - 1]!.t]) {
    for (const p of osculatingMoonOrbitPoints(t, epoch, 64)) {
      const mp = projectEarthCentricPolar(p, basis);
      maxR = Math.max(maxR, Math.hypot(mp.x, mp.y));
    }
  }
  return maxR;
}

function polarBoundsFromMaxR(maxR: number): PolarBounds {
  const pad = maxR * 0.08 + R_EARTH;
  return {
    xMin: -maxR - pad,
    xMax: maxR + pad,
    yMin: -maxR - pad,
    yMax: maxR + pad,
  };
}

/** Live ship/moon equatorial positions at mission time t. */
export function livePolar(
  model: PolarTrajectoryModel,
  samples: Sample[],
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): PolarLive {
  const shipPt = liveShipPolar(model, samples, t, epoch);
  moonEarthRel(t, _rel, epoch);
  const moonPt = projectEarthCentricPolar(_rel, model.basis);
  return packPolarLive(shipPt, moonPt, t);
}

function packPolarLive(
  shipPt: PolarPoint | null,
  moonPt: PolarPoint,
  t: number,
): PolarLive {
  return {
    ship: shipPt, moon: moonPt, t,
    shipR: shipPt ? Math.hypot(shipPt.x, shipPt.y) : 0,
    moonR: Math.hypot(moonPt.x, moonPt.y),
  };
}

function liveShipPolar(
  model: PolarTrajectoryModel,
  samples: Sample[],
  t: number,
  epoch: EphemerisEpoch,
): PolarPoint | null {
  if (samples.length === 0) return sampleTrailAt(model.shipTrail, t);
  const s = sampleAtTime(samples, t);
  if (!s) return sampleTrailAt(model.shipTrail, t);
  craftEarthRel(s, _rel, epoch);
  return projectEarthCentricPolar(_rel, model.basis);
}

function sampleAtTime(samples: Sample[], t: number): Sample | null {
  if (samples.length === 0) return null;
  if (t <= samples[0]!.t) return samples[0]!;
  const last = samples[samples.length - 1]!;
  if (t >= last.t) return last;
  return interpolateSample(samples, t);
}

function interpolateSample(samples: Sample[], t: number): Sample {
  const { lo, hi } = binarySearchTime(samples, t, (s) => s.t);
  const a = samples[lo]!;
  const b = samples[hi]!;
  return { ...a, t, pos: lerpPos(a.pos, b.pos, lerpU(a.t, b.t, t)), vel: a.vel };
}

function lerpPos(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  u: number,
): { x: number; y: number; z: number } {
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
  };
}

function binarySearchTime<T>(
  arr: T[],
  t: number,
  getT: (x: T) => number,
): { lo: number; hi: number } {
  let lo = 0;
  let hi = arr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (getT(arr[mid]!) <= t) lo = mid;
    else hi = mid;
  }
  return { lo, hi };
}

function lerpU(t0: number, t1: number, t: number): number {
  const dt = t1 - t0;
  return dt > 1e-12 ? (t - t0) / dt : 0;
}

function sampleTrailAt(
  trail: TimedPolarPoint[],
  t: number,
): PolarPoint | null {
  if (trail.length === 0) return null;
  if (t <= trail[0]!.t) return { x: trail[0]!.x, y: trail[0]!.y };
  const last = trail[trail.length - 1]!;
  if (t >= last.t) return { x: last.x, y: last.y };
  return lerpTrailPoint(trail, t);
}

function lerpTrailPoint(
  trail: TimedPolarPoint[],
  t: number,
): PolarPoint {
  const { lo, hi } = binarySearchTime(trail, t, (p) => p.t);
  const a = trail[lo]!;
  const b = trail[hi]!;
  const u = lerpU(a.t, b.t, t);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/**
 * Trail points up through missionT (for progressive path draw).
 * When missionT falls between samples, appends a linearly interpolated
 * endpoint so the stroked path meets the live marker instead of stopping
 * short at the previous sample.
 */
export function trailUpTo(
  trail: TimedPolarPoint[],
  missionT: number,
): TimedPolarPoint[] {
  if (trail.length === 0) return [];
  if (missionT <= trail[0]!.t) {
    const first = trail[0]!;
    return [{ x: first.x, y: first.y, t: first.t }];
  }
  if (missionT >= trail[trail.length - 1]!.t) return trail.slice();
  return trailUpToInterior(trail, missionT);
}

function trailUpToInterior(
  trail: TimedPolarPoint[],
  missionT: number,
): TimedPolarPoint[] {
  const { lo, hi } = binarySearchTime(trail, missionT, (p) => p.t);
  const a = trail[lo]!;
  const out = trail.slice(0, lo + 1);
  appendInterpTip(out, a, trail[hi]!, missionT);
  return out;
}

function appendInterpTip(
  out: TimedPolarPoint[],
  a: TimedPolarPoint,
  b: TimedPolarPoint,
  missionT: number,
): void {
  if (missionT <= a.t + 1e-12) return;
  const u = lerpU(a.t, b.t, missionT);
  out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, t: missionT });
}

/**
 * Project the osculating geocentric lunar orbit at mission time t into the
 * ecliptic plane. The live Moon always lies on this closed curve.
 */
export function projectedMoonOrbit(
  basis: PolarBasis,
  t: number,
  samples = 128,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): PolarPoint[] {
  const pts3 = osculatingMoonOrbitPoints(t, epoch, samples);
  const out: PolarPoint[] = [];
  for (const p of pts3) out.push(projectEarthCentricPolar(p, basis));
  return out;
}

export function fitPolarView(
  bounds: PolarBounds,
  cssW: number,
  cssH: number,
  dpr: number,
  padPx = 40,
): ViewTransform {
  const w = Math.max(1, cssW);
  const h = Math.max(1, cssH);
  const side = Math.max(
    Math.max(bounds.xMax - bounds.xMin, 1e-3),
    Math.max(bounds.yMax - bounds.yMin, 1e-3),
  );
  const scale = Math.min((w - 2 * padPx) / side, (h - 2 * padPx) / side);
  return polarViewOrigin(bounds, w, h, scale, dpr);
}

function polarViewOrigin(
  bounds: PolarBounds,
  w: number,
  h: number,
  scale: number,
  dpr: number,
): ViewTransform {
  const cx = (bounds.xMin + bounds.xMax) / 2;
  const cy = (bounds.yMin + bounds.yMax) / 2;
  return { scale, originX: w / 2 - cx * scale, originY: h / 2 + cy * scale, width: w, height: h, dpr };
}

export function worldToCanvas(
  p: PolarPoint,
  view: ViewTransform,
): { x: number; y: number } {
  return {
    x: view.originX + p.x * view.scale,
    y: view.originY - p.y * view.scale,
  };
}

/** Draw Earth-centric polar trajectories (B&W). */
export function drawPolarTrajectories(
  ctx: CanvasRenderingContext2D,
  model: PolarTrajectoryModel,
  live: PolarLive,
  missionT: number,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  preparePolarCanvas(ctx, cssW, cssH, dpr);
  const view = fitPolarView(model.bounds, cssW, cssH, dpr);
  paintPolarScene(ctx, model, live, missionT, view, cssW, cssH);
}

function paintPolarScene(
  ctx: CanvasRenderingContext2D,
  model: PolarTrajectoryModel,
  live: PolarLive,
  missionT: number,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  const c0 = worldToCanvas({ x: 0, y: 0 }, view);
  drawMoonOrbitRing(ctx, model, missionT, view);
  const earthPx = drawEarthDisk(ctx, model, c0, view);
  drawEclipticAxes(ctx, model, c0, view);
  drawMoonTrails(ctx, model, live, missionT, view);
  drawShipTrails(ctx, model, live, missionT, view);
  drawLiveMarkers(ctx, model, live, c0, earthPx, view);
  drawPolarScaleBar(ctx, view, cssW, cssH);
  drawPolarReadout(ctx, live, missionT, cssW);
}

function preparePolarCanvas(
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

function drawMoonOrbitRing(
  ctx: CanvasRenderingContext2D,
  model: PolarTrajectoryModel,
  missionT: number,
  view: ViewTransform,
): void {
  const moonOrbit = projectedMoonOrbit(model.basis, missionT, 160);
  ctx.beginPath();
  strokePolyline(ctx, view, moonOrbit);
  strokeDashedWhite(ctx, 0.28, 1.1, [6, 8]);
}

function strokeDashedWhite(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  width: number,
  dash: number[],
): void {
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  pts: PolarPoint[],
): void {
  for (let i = 0; i < pts.length; i++) {
    const c = worldToCanvas(pts[i]!, view);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  }
}

function drawEarthDisk(
  ctx: CanvasRenderingContext2D,
  model: PolarTrajectoryModel,
  c0: { x: number; y: number },
  view: ViewTransform,
): number {
  const earthPx = Math.max(2.5, model.rEarth * view.scale);
  ctx.beginPath();
  ctx.arc(c0.x, c0.y, earthPx, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0a";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return earthPx;
}

function drawEclipticAxes(
  ctx: CanvasRenderingContext2D,
  model: PolarTrajectoryModel,
  c0: { x: number; y: number },
  view: ViewTransform,
): void {
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  const axisR = Math.min(model.aEm * 0.15, model.bounds.xMax * 0.2);
  const px = worldToCanvas({ x: axisR, y: 0 }, view);
  const py = worldToCanvas({ x: 0, y: axisR }, view);
  strokeAxisLines(ctx, c0, px, py);
  labelAxes(ctx, px, py);
  ctx.globalAlpha = 1;
}

function strokeAxisLines(
  ctx: CanvasRenderingContext2D,
  c0: { x: number; y: number },
  px: { x: number; y: number },
  py: { x: number; y: number },
): void {
  ctx.beginPath();
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(px.x, px.y);
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(py.x, py.y);
  ctx.stroke();
}

function labelAxes(
  ctx: CanvasRenderingContext2D,
  px: { x: number; y: number },
  py: { x: number; y: number },
): void {
  ctx.font = "10px ui-monospace, SF Mono, Menlo, monospace";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("+X", px.x + 4, px.y);
  ctx.fillText("+Y", py.x + 4, py.y);
}

function progressiveTrail(
  full: TimedPolarPoint[],
  livePt: PolarPoint | null,
  missionT: number,
): { full: TimedPolarPoint[]; soFar: TimedPolarPoint[] } {
  const soFar = trailUpTo(full, missionT);
  if (livePt) tipTrailToLive(soFar, livePt, missionT);
  return { full, soFar };
}

function tipTrailToLive(
  soFar: TimedPolarPoint[],
  live: PolarPoint,
  missionT: number,
): void {
  const tip = soFar[soFar.length - 1];
  if (!tip || Math.hypot(tip.x - live.x, tip.y - live.y) > 1e-6) {
    soFar.push({ x: live.x, y: live.y, t: missionT });
  }
}

function drawMoonTrails(
  ctx: CanvasRenderingContext2D,
  model: PolarTrajectoryModel,
  live: PolarLive,
  missionT: number,
  view: ViewTransform,
): void {
  const trails = progressiveTrail(model.moonTrail, live.moon, missionT);
  strokeDimFullThenDashed(ctx, view, trails, 1.1, 0.2, 0.85);
}

function drawShipTrails(
  ctx: CanvasRenderingContext2D,
  model: PolarTrajectoryModel,
  live: PolarLive,
  missionT: number,
  view: ViewTransform,
): void {
  const trails = progressiveTrail(model.shipTrail, live.ship, missionT);
  strokeDimFullThenSolid(ctx, view, trails, 1.15, 0.22, 1.5, 0.95);
}

function strokeDimFullThenDashed(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  trails: { full: TimedPolarPoint[]; soFar: TimedPolarPoint[] },
  width: number,
  dimA: number,
  brightA: number,
): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = dimA;
  strokeTrail(ctx, view, trails.full);
  ctx.globalAlpha = brightA;
  ctx.setLineDash([3, 4]);
  strokeTrail(ctx, view, trails.soFar);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function strokeDimFullThenSolid(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  trails: { full: TimedPolarPoint[]; soFar: TimedPolarPoint[] },
  wDim: number,
  dimA: number,
  wBright: number,
  brightA: number,
): void {
  ctx.lineWidth = wDim;
  ctx.globalAlpha = dimA;
  strokeTrail(ctx, view, trails.full);
  ctx.globalAlpha = brightA;
  ctx.lineWidth = wBright;
  strokeTrail(ctx, view, trails.soFar);
  ctx.globalAlpha = 1;
}

function drawLiveMarkers(
  ctx: CanvasRenderingContext2D,
  model: PolarTrajectoryModel,
  live: PolarLive,
  c0: { x: number; y: number },
  earthPx: number,
  view: ViewTransform,
): void {
  if (live.moon) drawLiveMoon(ctx, live.moon, model.rMoon, view);
  if (live.ship) drawLiveShip(ctx, live.ship, view);
  labelEarth(ctx, c0, earthPx);
}

function drawLiveMoon(
  ctx: CanvasRenderingContext2D,
  moon: PolarPoint,
  rMoon: number,
  view: ViewTransform,
): void {
  const m = worldToCanvas(moon, view);
  const moonPx = Math.max(3, rMoon * view.scale);
  ctx.beginPath();
  ctx.arc(m.x, m.y, moonPx, 0, Math.PI * 2);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.25;
  ctx.stroke();
  fillBodyLabel(ctx, "Moon", m.x + moonPx + 5, m.y);
}

function drawLiveShip(
  ctx: CanvasRenderingContext2D,
  ship: PolarPoint,
  view: ViewTransform,
): void {
  const s = worldToCanvas(ship, view);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  fillBodyLabel(ctx, "Ship", s.x + 7, s.y);
}

function fillBodyLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
): void {
  ctx.fillStyle = "#fff";
  ctx.font = "11px Helvetica Neue, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

function labelEarth(
  ctx: CanvasRenderingContext2D,
  c0: { x: number; y: number },
  earthPx: number,
): void {
  ctx.fillStyle = "#fff";
  ctx.font = "11px Helvetica Neue, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.globalAlpha = 0.85;
  ctx.fillText("Earth", c0.x, c0.y + earthPx + 4);
  ctx.globalAlpha = 1;
}

function drawPolarReadout(
  ctx: CanvasRenderingContext2D,
  live: PolarLive,
  missionT: number,
  cssW: number,
): void {
  setMonoReadoutStyle(ctx);
  ctx.globalAlpha = 0.9;
  fillPolarLeftReadout(ctx, live, missionT);
  ctx.textAlign = "right";
  ctx.globalAlpha = 0.75;
  fillPolarRightReadout(ctx, cssW);
  ctx.globalAlpha = 1;
}

function setMonoReadoutStyle(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

function fillPolarLeftReadout(
  ctx: CanvasRenderingContext2D,
  live: PolarLive,
  missionT: number,
): void {
  ctx.fillText("Earth-centric · ecliptic plane view", 12, 10);
  ctx.fillText(`t = ${formatMissionClock(missionT)}`, 12, 26);
  if (live.ship) ctx.fillText(`Ship  r = ${fmtRange(live.shipR)}`, 12, 42);
  ctx.fillText(`Moon  r = ${fmtRange(live.moonR)}`, 12, 58);
}

function fillPolarRightReadout(
  ctx: CanvasRenderingContext2D,
  cssW: number,
): void {
  ctx.fillText("solid: ship · dashed: Moon path", cssW - 12, 10);
  ctx.fillText("ring: Moon orbit (osculating)", cssW - 12, 26);
  ctx.fillText("true scale · look along ecliptic +Z", cssW - 12, 42);
}

function strokeTrail(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  trail: PolarPoint[],
): void {
  if (trail.length < 2) return;
  ctx.beginPath();
  strokePolyline(ctx, view, trail);
  ctx.stroke();
}

function drawPolarScaleBar(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  const km = pickScaleKm([100_000, 50_000, 20_000, 10_000, 5000], view, cssW, 50_000);
  const geom = scaleBarGeom(view, cssW, cssH, km);
  paintScaleBarTicks(ctx, geom);
  paintScaleBarLabel(ctx, geom, km >= 1000 ? `${(km / 1000).toFixed(0)} Mm` : `${km} km`);
}

function pickScaleKm(
  candidates: number[],
  view: ViewTransform,
  cssW: number,
  fallback: number,
): number {
  for (const c of candidates) {
    if (c * view.scale < cssW * 0.28) return c;
  }
  return fallback;
}

type ScaleBarGeom = { x0: number; x1: number; y: number };

function scaleBarGeom(
  view: ViewTransform,
  cssW: number,
  cssH: number,
  km: number,
): ScaleBarGeom {
  const px = km * view.scale;
  const x1 = cssW - 16;
  return { x0: x1 - px, x1, y: cssH - 18 };
}

function paintScaleBarTicks(
  ctx: CanvasRenderingContext2D,
  g: ScaleBarGeom,
): void {
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  pathScaleBar(ctx, g);
  ctx.stroke();
}

function pathScaleBar(ctx: CanvasRenderingContext2D, g: ScaleBarGeom): void {
  ctx.moveTo(g.x0, g.y);
  ctx.lineTo(g.x1, g.y);
  ctx.moveTo(g.x0, g.y - 4);
  ctx.lineTo(g.x0, g.y + 4);
  ctx.moveTo(g.x1, g.y - 4);
  ctx.lineTo(g.x1, g.y + 4);
}

function paintScaleBarLabel(
  ctx: CanvasRenderingContext2D,
  g: ScaleBarGeom,
  label: string,
): void {
  ctx.font = "10px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, (g.x0 + g.x1) / 2, g.y - 6);
}

function fmtRange(km: number): string {
  if (!Number.isFinite(km)) return "—";
  if (km >= 1000) return `${(km / 1000).toFixed(1)} Mm`;
  return `${km.toFixed(0)} km`;
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

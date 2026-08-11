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
  // Theater ecliptic J2000: XY = ecliptic, +Z = ecliptic north
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
export function craftEarthRel(sample: Sample, out: V3 = v3()): V3 {
  const b = bodyPositions(sample.t);
  out.x = sample.pos.x - b.earth.x;
  out.y = sample.pos.y - b.earth.y;
  out.z = sample.pos.z - b.earth.z;
  return out;
}

/** Moon − Earth at mission time t. */
export function moonEarthRel(t: number, out: V3 = v3()): V3 {
  const b = bodyPositions(t);
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
): PolarTrajectoryModel | null {
  if (samples.length < 2) return null;
  const basis = polarBasisLookingNorth();
  const shipTrail: TimedPolarPoint[] = [];
  const moonTrail: TimedPolarPoint[] = [];

  const n = samples.length;
  const stride = Math.max(1, Math.ceil(n / maxPoints));
  let maxR = R_EARTH;

  for (let i = 0; i < n; i++) {
    const s = samples[i]!;
    const keep =
      i === 0 ||
      i === n - 1 ||
      i % stride === 0 ||
      (i > 0 && samples[i - 1]!.phase !== s.phase);
    if (!keep) continue;

    craftEarthRel(s, _rel);
    const sp = projectEarthCentricPolar(_rel, basis);
    shipTrail.push({ x: sp.x, y: sp.y, t: s.t });
    maxR = Math.max(maxR, Math.hypot(sp.x, sp.y));

    moonEarthRel(s.t, _rel);
    const mp = projectEarthCentricPolar(_rel, basis);
    moonTrail.push({ x: mp.x, y: mp.y, t: s.t });
    maxR = Math.max(maxR, Math.hypot(mp.x, mp.y), A_EM);
  }

  // Frame the osculating lunar orbit (may reach past the mission-arc moon trail)
  for (const t of [samples[0]!.t, samples[n - 1]!.t]) {
    for (const p of osculatingMoonOrbitPoints(t, 64)) {
      const mp = projectEarthCentricPolar(p, basis);
      maxR = Math.max(maxR, Math.hypot(mp.x, mp.y));
    }
  }

  const pad = maxR * 0.08 + R_EARTH;
  const bounds: PolarBounds = {
    xMin: -maxR - pad,
    xMax: maxR + pad,
    yMin: -maxR - pad,
    yMax: maxR + pad,
  };

  return {
    basis,
    shipTrail,
    moonTrail,
    bounds,
    rEarth: R_EARTH,
    rMoon: R_MOON,
    aEm: A_EM,
  };
}

/** Live ship/moon equatorial positions at mission time t. */
export function livePolar(
  model: PolarTrajectoryModel,
  samples: Sample[],
  t: number,
): PolarLive {
  // Prefer exact sample interpolation for ship when available
  let shipPt = sampleTrailAt(model.shipTrail, t);
  if (samples.length > 0) {
    const s = sampleAtTime(samples, t);
    if (s) {
      craftEarthRel(s, _rel);
      shipPt = projectEarthCentricPolar(_rel, model.basis);
    }
  }
  moonEarthRel(t, _rel);
  const moonPt = projectEarthCentricPolar(_rel, model.basis);
  return {
    ship: shipPt,
    moon: moonPt,
    shipR: shipPt ? Math.hypot(shipPt.x, shipPt.y) : 0,
    moonR: Math.hypot(moonPt.x, moonPt.y),
    t,
  };
}

function sampleAtTime(samples: Sample[], t: number): Sample | null {
  if (samples.length === 0) return null;
  if (t <= samples[0]!.t) return samples[0]!;
  const last = samples[samples.length - 1]!;
  if (t >= last.t) return last;
  // Binary search
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo]!;
  const b = samples[hi]!;
  const dt = b.t - a.t;
  const u = dt > 1e-12 ? (t - a.t) / dt : 0;
  return {
    ...a,
    t,
    pos: {
      x: a.pos.x + (b.pos.x - a.pos.x) * u,
      y: a.pos.y + (b.pos.y - a.pos.y) * u,
      z: a.pos.z + (b.pos.z - a.pos.z) * u,
    },
    vel: a.vel,
  };
}

function sampleTrailAt(
  trail: TimedPolarPoint[],
  t: number,
): PolarPoint | null {
  if (trail.length === 0) return null;
  if (t <= trail[0]!.t) return { x: trail[0]!.x, y: trail[0]!.y };
  const last = trail[trail.length - 1]!;
  if (t >= last.t) return { x: last.x, y: last.y };
  let lo = 0;
  let hi = trail.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trail[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = trail[lo]!;
  const b = trail[hi]!;
  const dt = b.t - a.t;
  const u = dt > 1e-12 ? (t - a.t) / dt : 0;
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
  };
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
  const first = trail[0]!;
  if (missionT <= first.t) {
    return [{ x: first.x, y: first.y, t: first.t }];
  }
  const last = trail[trail.length - 1]!;
  if (missionT >= last.t) {
    return trail.slice();
  }
  // Binary search: lo = last index with t ≤ missionT
  let lo = 0;
  let hi = trail.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trail[mid]!.t <= missionT) lo = mid;
    else hi = mid;
  }
  const a = trail[lo]!;
  const b = trail[hi]!;
  const out = trail.slice(0, lo + 1);
  if (missionT > a.t + 1e-12) {
    const dt = b.t - a.t;
    const u = dt > 1e-12 ? (missionT - a.t) / dt : 0;
    out.push({
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      t: missionT,
    });
  }
  return out;
}

/**
 * Project the osculating geocentric lunar orbit at mission time t into the
 * ecliptic plane. The live Moon always lies on this closed curve.
 */
export function projectedMoonOrbit(
  basis: PolarBasis,
  t: number,
  samples = 128,
): PolarPoint[] {
  const pts3 = osculatingMoonOrbitPoints(t, samples);
  const out: PolarPoint[] = [];
  for (const p of pts3) {
    out.push(projectEarthCentricPolar(p, basis));
  }
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
  const bw = Math.max(bounds.xMax - bounds.xMin, 1e-3);
  const bh = Math.max(bounds.yMax - bounds.yMin, 1e-3);
  // Isotropic: square frame around Earth
  const side = Math.max(bw, bh);
  const scale = Math.min((w - 2 * padPx) / side, (h - 2 * padPx) / side);
  // Center of bounds maps to canvas center
  const cx = (bounds.xMin + bounds.xMax) / 2;
  const cy = (bounds.yMin + bounds.yMax) / 2;
  const originX = w / 2 - cx * scale;
  const originY = h / 2 + cy * scale; // y flips (canvas down)
  return { scale, originX, originY, width: w, height: h, dpr };
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
  const w = Math.max(1, Math.floor(cssW * dpr));
  const h = Math.max(1, Math.floor(cssH * dpr));
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cssW, cssH);

  const view = fitPolarView(model.bounds, cssW, cssH, dpr);
  const c0 = worldToCanvas({ x: 0, y: 0 }, view);

  // Osculating lunar orbit (ecliptic projection) — always through the Moon
  const moonOrbit = projectedMoonOrbit(model.basis, missionT, 160);
  ctx.beginPath();
  for (let i = 0; i < moonOrbit.length; i++) {
    const c = worldToCanvas(moonOrbit[i]!, view);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  }
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 1.1;
  ctx.setLineDash([6, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Earth disk
  const earthPx = Math.max(2.5, model.rEarth * view.scale);
  ctx.beginPath();
  ctx.arc(c0.x, c0.y, earthPx, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0a";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ecliptic +X / +Y axis ticks
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  const axisR = Math.min(model.aEm * 0.15, model.bounds.xMax * 0.2);
  const px = worldToCanvas({ x: axisR, y: 0 }, view);
  const py = worldToCanvas({ x: 0, y: axisR }, view);
  ctx.beginPath();
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(px.x, px.y);
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(py.x, py.y);
  ctx.stroke();
  ctx.font = "10px ui-monospace, SF Mono, Menlo, monospace";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("+X", px.x + 4, px.y);
  ctx.fillText("+Y", py.x + 4, py.y);
  ctx.globalAlpha = 1;

  // Moon trail (full path, dim) + progressive (ends at live Moon)
  const moonFull = model.moonTrail;
  const moonSoFar = trailUpTo(model.moonTrail, missionT);
  if (live.moon) {
    const tip = moonSoFar[moonSoFar.length - 1];
    if (
      !tip ||
      Math.hypot(tip.x - live.moon.x, tip.y - live.moon.y) > 1e-6
    ) {
      moonSoFar.push({ x: live.moon.x, y: live.moon.y, t: missionT });
    }
  }
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = 0.2;
  strokeTrail(ctx, view, moonFull);
  ctx.globalAlpha = 0.85;
  ctx.setLineDash([3, 4]);
  strokeTrail(ctx, view, moonSoFar);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Ship trail (progressive ends at live ship)
  const shipFull = model.shipTrail;
  const shipSoFar = trailUpTo(model.shipTrail, missionT);
  if (live.ship) {
    const tip = shipSoFar[shipSoFar.length - 1];
    if (
      !tip ||
      Math.hypot(tip.x - live.ship.x, tip.y - live.ship.y) > 1e-6
    ) {
      shipSoFar.push({ x: live.ship.x, y: live.ship.y, t: missionT });
    }
  }
  ctx.lineWidth = 1.15;
  ctx.globalAlpha = 0.22;
  strokeTrail(ctx, view, shipFull);
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 1.5;
  strokeTrail(ctx, view, shipSoFar);
  ctx.globalAlpha = 1;

  // Live Moon
  if (live.moon) {
    const m = worldToCanvas(live.moon, view);
    const moonPx = Math.max(3, model.rMoon * view.scale);
    ctx.beginPath();
    ctx.arc(m.x, m.y, moonPx, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "11px Helvetica Neue, Helvetica, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Moon", m.x + moonPx + 5, m.y);
  }

  // Live ship
  if (live.ship) {
    const s = worldToCanvas(live.ship, view);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "11px Helvetica Neue, Helvetica, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Ship", s.x + 7, s.y);
  }

  // Earth label
  ctx.fillStyle = "#fff";
  ctx.font = "11px Helvetica Neue, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.globalAlpha = 0.85;
  ctx.fillText("Earth", c0.x, c0.y + earthPx + 4);
  ctx.globalAlpha = 1;

  // Scale bar
  drawPolarScaleBar(ctx, view, cssW, cssH);

  // Readout
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.globalAlpha = 0.9;
  ctx.fillText("Earth-centric · ecliptic plane view", 12, 10);
  ctx.fillText(`t = ${formatMissionClock(missionT)}`, 12, 26);
  if (live.ship) {
    ctx.fillText(`Ship  r = ${fmtRange(live.shipR)}`, 12, 42);
  }
  ctx.fillText(`Moon  r = ${fmtRange(live.moonR)}`, 12, 58);
  ctx.globalAlpha = 1;

  ctx.textAlign = "right";
  ctx.globalAlpha = 0.75;
  ctx.fillText("solid: ship · dashed: Moon path", cssW - 12, 10);
  ctx.fillText("ring: Moon orbit (osculating)", cssW - 12, 26);
  ctx.fillText("true scale · look along ecliptic +Z", cssW - 12, 42);
  ctx.globalAlpha = 1;
}

function strokeTrail(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  trail: PolarPoint[],
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

function drawPolarScaleBar(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  const candidates = [100_000, 50_000, 20_000, 10_000, 5000];
  let km = 50_000;
  for (const c of candidates) {
    if (c * view.scale < cssW * 0.28) {
      km = c;
      break;
    }
  }
  const px = km * view.scale;
  const x1 = cssW - 16;
  const x0 = x1 - px;
  const y = cssH - 18;
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.moveTo(x0, y - 4);
  ctx.lineTo(x0, y + 4);
  ctx.moveTo(x1, y - 4);
  ctx.lineTo(x1, y + 4);
  ctx.stroke();
  ctx.font = "10px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const label =
    km >= 1000 ? `${(km / 1000).toFixed(0)} Mm` : `${km} km`;
  ctx.fillText(label, (x0 + x1) / 2, y - 6);
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

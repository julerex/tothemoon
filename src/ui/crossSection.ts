/**
 * Ascent / return to launch site cross-section: true-scale Earth arc + atmosphere shell in the
 * Starbase launch plane (mesh-local up × east).
 *
 * Black & white diagram for reading booster altitude vs downrange from liftoff
 * through chopsticks catch. Pure helpers are scrub-safe; canvas draw is live.
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
  /** Booster: stacked path + return to launch site recovery to chopsticks. */
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
};

const _local = v3();
const _rel = v3();

/**
 * Mesh-local orthonormal basis at Starbase: up = pad radial, east = due east.
 * Fixed for the spinning Earth mesh (ground-relative diagram).
 */
export function launchPlaneBasis(): LaunchPlaneBasis {
  const pad = v3();
  geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, R_EARTH, pad);
  const L = len(pad) || 1;
  const up = v3(pad.x / L, pad.y / L, pad.z / L);

  const pad2 = v3();
  geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON + 1e-4, R_EARTH, pad2);
  const east = v3(pad2.x - pad.x, pad2.y - pad.y, pad2.z - pad.z);
  const eL = len(east) || 1;
  east.x /= eL;
  east.y /= eL;
  east.z /= eL;
  // Re-orthogonalize east ⟂ up
  const d = east.x * up.x + east.y * up.y + east.z * up.z;
  east.x -= up.x * d;
  east.y -= up.y * d;
  east.z -= up.z * d;
  const eL2 = len(east) || 1;
  east.x /= eL2;
  east.y /= eL2;
  east.z /= eL2;

  return { up, east };
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
  out.x =
    _local.x * basis.east.x +
    _local.y * basis.east.y +
    _local.z * basis.east.z;
  out.y =
    _local.x * basis.up.x + _local.y * basis.up.y + _local.z * basis.up.z;
  return out;
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

function expandBounds(
  b: CrossSectionBounds,
  p: PlanePoint,
  pad = 0,
): void {
  b.xMin = Math.min(b.xMin, p.x - pad);
  b.xMax = Math.max(b.xMax, p.x + pad);
  b.yMin = Math.min(b.yMin, p.y - pad);
  b.yMax = Math.max(b.yMax, p.y + pad);
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
  const rEarth = R_EARTH;
  const rAtm = R_EARTH + ATM_H_MAX_KM;
  const shipTrail: TimedPlanePoint[] = [];
  const boosterTrail: TimedPlanePoint[] = [];

  const stageT = stage?.t ?? null;
  const pt = { x: 0, y: 0 };

  // Stacked ascent → stage-out (shared path for ship + booster)
  let lastShipT = -Infinity;
  for (const s of samples) {
    if (stageT != null && s.t > stageT + 1e-6) break;
    // Subsample dense ascent packs (~keep ≤ ~4 Hz equivalent)
    if (s.t - lastShipT < 0.35 && s.t !== stageT) continue;
    projectToLaunchPlane(s.pos, s.t, basis, pt, epoch);
    const q = { x: pt.x, y: pt.y, t: s.t };
    shipTrail.push(q);
    boosterTrail.push({ ...q });
    lastShipT = s.t;
  }

  // Short ship path after stage while still near the booster envelope
  // (not full low Earth orbit — that would blow the true-scale frame)
  if (stageT != null) {
    const maxShipT = stageT + 45;
    for (const s of samples) {
      if (s.t <= stageT) continue;
      if (s.t > maxShipT) break;
      if (s.t - lastShipT < 0.5) continue;
      projectToLaunchPlane(s.pos, s.t, basis, pt, epoch);
      // Drop once ship clearly leaves the return to launch site theater box
      if (Math.abs(pt.x) > 160 || Math.hypot(pt.x, pt.y) > R_EARTH + 160) {
        break;
      }
      shipTrail.push({ x: pt.x, y: pt.y, t: s.t });
      lastShipT = s.t;
    }
  }

  // Booster recovery path after stage-out (chopsticks RTLS or gulf)
  if (stage) {
    const kfs = buildBoosterKeyframes(stage, recovery, epoch);
    const vis = boosterVisibleS(recoverySchedule(recovery));
    const dt = 1.0;
    for (let age = 0; age <= vis; age += dt) {
      const rec = sampleBoosterRecovery(stage, age, kfs, recovery, epoch);
      if (rec.phase === "done" || rec.fade < 0.02) {
        if (age > LANDING_HOLD_CUT) break;
        continue;
      }
      const t = stage.t + age;
      // sampleBoosterRecovery aliases scratch — copy pos
      const pos = v3(rec.pos.x, rec.pos.y, rec.pos.z);
      projectToLaunchPlane(pos, t, basis, pt, epoch);
      boosterTrail.push({ x: pt.x, y: pt.y, t });
    }
  }

  // Bounds: primarily booster return to launch site envelope (diagram’s purpose) + ship in-frame
  const bounds: CrossSectionBounds = {
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  };
  for (const p of boosterTrail) expandBounds(bounds, p);
  for (const p of shipTrail) expandBounds(bounds, p);

  if (!Number.isFinite(bounds.xMin)) {
    // Fallback pad view
    bounds.xMin = -20;
    bounds.xMax = 120;
    bounds.yMin = rEarth - 5;
    bounds.yMax = rAtm + 20;
  } else {
    // Include atmosphere arc over the angular span of the diagram
    const angMin = Math.atan2(bounds.xMin, Math.max(bounds.yMin, 1));
    const angMax = Math.atan2(bounds.xMax, Math.max(bounds.yMin, 1));
    const nArc = 24;
    for (let i = 0; i <= nArc; i++) {
      const a = angMin + ((angMax - angMin) * i) / nArc;
      expandBounds(bounds, {
        x: rAtm * Math.sin(a),
        y: rAtm * Math.cos(a),
      });
      expandBounds(bounds, {
        x: rEarth * Math.sin(a),
        y: rEarth * Math.cos(a),
      });
    }
    // Pad breathing room
    const padX = 12;
    const padY = 8;
    bounds.xMin -= padX;
    bounds.xMax += padX;
    bounds.yMin = Math.min(bounds.yMin, rEarth - 4) - padY * 0.25;
    bounds.yMax += padY;
  }

  return {
    basis,
    shipTrail,
    boosterTrail,
    stageT,
    bounds,
    rAtm,
    rEarth,
  };
}

/** Age past which we stop extending the return to launch site trail after fade. */
const LANDING_HOLD_CUT = 320;

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
  const basis = model.basis;
  const shipPt: PlanePoint = { x: 0, y: 0 };
  const boosterPt: PlanePoint = { x: 0, y: 0 };

  // Interpolate ship from samples (same binary search spirit as TrajectoryCache)
  const shipPos = samplePosAt(samples, t);
  let ship: PlanePoint | null = null;
  if (shipPos) {
    projectToLaunchPlane(shipPos, t, basis, shipPt, epoch);
    ship = { x: shipPt.x, y: shipPt.y };
  }

  let booster: PlanePoint | null = null;
  let boosterFade = 0;
  let staged = false;

  if (stage && t + 1e-9 >= stage.t) {
    staged = true;
    const age = t - stage.t;
    const rec = sampleBoosterRecovery(
      stage,
      age,
      keyframes ?? undefined,
      recovery,
      epoch,
    );
    boosterFade = rec.fade;
    if (rec.phase !== "done" && rec.fade >= 0.02) {
      const pos = v3(rec.pos.x, rec.pos.y, rec.pos.z);
      projectToLaunchPlane(pos, t, basis, boosterPt, epoch);
      booster = { x: boosterPt.x, y: boosterPt.y };
    }
  } else if (ship) {
    // Stacked: booster co-located with ship
    booster = { x: ship.x, y: ship.y };
    boosterFade = 1;
  }

  const shipAlt = ship ? planeAltitudeKm(ship, model.rEarth) : 0;
  const boosterAlt = booster ? planeAltitudeKm(booster, model.rEarth) : 0;
  const shipRange = ship ? surfaceArcKm(ship, model.rEarth) : 0;
  const boosterRange = booster ? surfaceArcKm(booster, model.rEarth) : 0;

  return {
    ship,
    booster,
    staged,
    boosterFade,
    shipAltKm: shipAlt,
    boosterAltKm: boosterAlt,
    shipRangeKm: shipRange,
    boosterRangeKm: boosterRange,
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

  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo]!;
  const b = samples[hi]!;
  const f = (t - a.t) / (b.t - a.t || 1);
  return v3(
    a.pos.x + (b.pos.x - a.pos.x) * f,
    a.pos.y + (b.pos.y - a.pos.y) * f,
    a.pos.z + (b.pos.z - a.pos.z) * f,
  );
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
  const usedW = bw * scale;
  const usedH = bh * scale;
  // Center the content
  const originX = (w - usedW) / 2 - bounds.xMin * scale;
  const originY = (h - usedH) / 2 + bounds.yMax * scale; // y flips
  return { scale, originX, originY, width: w, height: h, dpr };
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
  const w = Math.max(1, Math.floor(cssW * dpr));
  const h = Math.max(1, Math.floor(cssH * dpr));
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cssW, cssH);

  const view = fitView(model.bounds, cssW, cssH, dpr);
  const { rEarth, rAtm, bounds } = model;

  // Angular span for arcs
  const ang0 = Math.atan2(bounds.xMin, (bounds.yMin + bounds.yMax) / 2);
  const ang1 = Math.atan2(bounds.xMax, (bounds.yMin + bounds.yMax) / 2);
  const a0 = Math.min(ang0, ang1) - 0.002;
  const a1 = Math.max(ang0, ang1) + 0.002;

  // Earth surface arc
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  strokeArc(ctx, view, rEarth, a0, a1);
  ctx.stroke();

  // Atmosphere upper edge
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  strokeArc(ctx, view, rAtm, a0, a1);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Radial tick at pad (Starbase)
  const padWorld: PlanePoint = { x: 0, y: rEarth };
  // Use actual pad projection from first trail point if available
  const padRef = model.boosterTrail[0] ?? model.shipTrail[0] ?? padWorld;
  const padSurf: PlanePoint = {
    x: padRef.x * (rEarth / (Math.hypot(padRef.x, padRef.y) || rEarth)),
    y: padRef.y * (rEarth / (Math.hypot(padRef.x, padRef.y) || rEarth)),
  };
  const padTop: PlanePoint = {
    x: padSurf.x * ((rEarth + 3) / rEarth),
    y: padSurf.y * ((rEarth + 3) / rEarth),
  };
  const p0 = worldToCanvas(padSurf, view);
  const p1 = worldToCanvas(padTop, view);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();

  // Labels
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const midAng = (a0 + a1) / 2;
  const earthLabel = worldToCanvas(
    {
      x: (rEarth - 18) * Math.sin(midAng),
      y: (rEarth - 18) * Math.cos(midAng),
    },
    view,
  );
  ctx.globalAlpha = 0.7;
  ctx.fillText("Earth surface", earthLabel.x, earthLabel.y);
  const atmLabel = worldToCanvas(
    {
      x: (rAtm + 8) * Math.sin(a1 - 0.01),
      y: (rAtm + 8) * Math.cos(a1 - 0.01),
    },
    view,
  );
  ctx.fillText(`Atmosphere ${ATM_H_MAX_KM} km`, atmLabel.x, atmLabel.y);
  ctx.globalAlpha = 1;

  // Scale bar (true scale)
  drawScaleBar(ctx, view, cssW, cssH);

  // Trails up to now
  const boosterSoFar = trailUpTo(model.boosterTrail, missionT);
  const shipSoFar = trailUpTo(model.shipTrail, missionT);

  ctx.lineWidth = 1.25;
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = 0.35;
  strokeTrail(ctx, view, shipSoFar);
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1.6;
  strokeTrail(ctx, view, boosterSoFar);
  ctx.globalAlpha = 1;

  // Stage mark on booster path
  if (model.stageT != null && missionT >= model.stageT) {
    const stPt = trailPointAt(model.boosterTrail, model.stageT);
    if (stPt) {
      const c = worldToCanvas(stPt, view);
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
  }

  // Live icons
  if (live.ship) {
    drawShipIcon(ctx, worldToCanvas(live.ship, view), live.staged ? 0.55 : 1);
  }
  if (live.booster && live.boosterFade > 0.02) {
    // Offset slightly when stacked so both icons read
    const c = worldToCanvas(live.booster, view);
    if (!live.staged && live.ship) {
      c.x -= 5;
    }
    drawBoosterIcon(ctx, c, live.boosterFade);
  }

  // Readout strip
  ctx.fillStyle = "#fff";
  ctx.font = "11px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const lines: string[] = [
    `t = ${formatMissionClock(missionT)}`,
  ];
  if (live.booster) {
    lines.push(
      `Booster  alt ${fmtKm(live.boosterAltKm)}  range ${fmtKm(live.boosterRangeKm)}`,
    );
  }
  if (live.ship && live.staged) {
    lines.push(
      `Ship     alt ${fmtKm(live.shipAltKm)}  range ${fmtKm(live.shipRangeKm)}`,
    );
  } else if (live.ship && !live.staged) {
    lines.push(
      `Stack    alt ${fmtKm(live.shipAltKm)}  range ${fmtKm(live.shipRangeKm)}`,
    );
  }
  let ly = 10;
  for (const line of lines) {
    ctx.fillText(line, 12, ly);
    ly += 15;
  }

  // Legend
  ctx.textAlign = "right";
  ctx.globalAlpha = 0.8;
  ctx.fillText("white trails · true scale · launch plane", cssW - 12, 10);
  ctx.fillText("Booster path: liftoff → chopsticks", cssW - 12, 25);
  ctx.globalAlpha = 1;
}

function strokeArc(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  radius: number,
  a0: number,
  a1: number,
): void {
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
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
  let best = trail[0]!;
  let bestD = Math.abs(best.t - t);
  for (const p of trail) {
    const d = Math.abs(p.t - t);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** Super Heavy silhouette (taller rectangle + engines). */
function drawBoosterIcon(
  ctx: CanvasRenderingContext2D,
  c: { x: number; y: number },
  fade: number,
): void {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.globalAlpha = Math.max(0.15, fade);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.25;
  // Body
  ctx.strokeRect(-3, -14, 6, 26);
  // Grid-fin ticks
  ctx.beginPath();
  ctx.moveTo(-5, -8);
  ctx.lineTo(-3, -8);
  ctx.moveTo(3, -8);
  ctx.lineTo(5, -8);
  ctx.moveTo(-5, 6);
  ctx.lineTo(-3, 6);
  ctx.moveTo(3, 6);
  ctx.lineTo(5, 6);
  ctx.stroke();
  // Label
  ctx.font = "9px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("B", 8, 0);
  ctx.restore();
}

/** Starship silhouette (nose cone + body). */
function drawShipIcon(
  ctx: CanvasRenderingContext2D,
  c: { x: number; y: number },
  alpha: number,
): void {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(3.5, -4);
  ctx.lineTo(3.5, 10);
  ctx.lineTo(-3.5, 10);
  ctx.lineTo(-3.5, -4);
  ctx.closePath();
  ctx.stroke();
  ctx.font = "9px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("S", 8, 0);
  ctx.restore();
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  cssW: number,
  cssH: number,
): void {
  // Prefer 50 km bar if it fits, else 20 / 10
  const candidates = [50, 20, 10, 5];
  let km = 20;
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
  ctx.fillText(`${km} km`, (x0 + x1) / 2, y - 6);
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

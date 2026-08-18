/**
 * Canvas paint for Earth-centric ecliptic-plane trajectory diagrams.
 */

import {
  formatMissionClock,
  paintScaleBarLabel,
  paintScaleBarTicks,
  pickScaleKm,
  prepareDiagramCanvas,
  scaleBarGeom,
  worldToCanvas,
  type ViewTransform,
} from "./canvasDiagram";
import {
  fitPolarView,
  projectedMoonOrbit,
  trailUpTo,
  type PolarLive,
  type PolarPoint,
  type PolarTrajectoryModel,
  type TimedPolarPoint,
} from "./polarTrajectoriesGeometry";

export { worldToCanvas };

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
  prepareDiagramCanvas(ctx, cssW, cssH, dpr);
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

function fmtRange(km: number): string {
  if (!Number.isFinite(km)) return "—";
  if (km >= 1000) return `${(km / 1000).toFixed(1)} Mm`;
  return `${km.toFixed(0)} km`;
}

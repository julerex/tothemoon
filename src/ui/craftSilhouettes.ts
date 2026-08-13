/**
 * White line-art craft glyphs for the ascent / return-to-launch-site
 * cross-section dashboard.
 *
 * The stacked Super Heavy + Starship marker follows the schematic launch
 * elevation (ogive nose, canards, aft flaps, hot-stage crown, grid fins,
 * landing chines, engine bells, thin exhaust). Separated stages reuse the
 * same strokes so the live marker stays consistent after hot-stage.
 *
 * Local coords: origin at mid-stack, +x right, +y down (canvas). Units are
 * CSS pixels at scale 1.
 */

export type CraftPt = { x: number; y: number };

/**
 * Stacked launch glyph layout (CSS px, y down, origin at vehicle mid-body).
 * Width includes aft flaps; height includes the launch exhaust.
 */
export const STACK_LAUNCH = {
  bodyHalfW: 4.2,
  noseY: -28,
  shoulderY: -20.5,
  canardY: -24.2,
  canardTipX: 8.4,
  aftFlapTopY: -9.2,
  aftFlapBotY: -3.4,
  aftFlapTipX: 13.2,
  shipBaseY: -3.6,
  crownY: -3.1,
  gridFinY: -1.15,
  gridFinTipX: 9.2,
  boostTopY: -3.0,
  chineTopY: 9.5,
  boostBotY: 22.5,
  engineTipY: 26.2,
  plumeEndY: 36.5,
} as const;

/** Bounding box of the stacked launch glyph at scale 1. */
export function stackLaunchBounds(): {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
} {
  const { aftFlapTipX, noseY, plumeEndY } = STACK_LAUNCH;
  return { xMin: -aftFlapTipX, xMax: aftFlapTipX, yMin: noseY, yMax: plumeEndY };
}

/** Draw Super Heavy + Starship stacked at launch (with exhaust). */
export function drawStackLaunchIcon(
  ctx: CanvasRenderingContext2D,
  c: CraftPt,
  alpha = 1,
): void {
  withCraftStroke(ctx, c, alpha, () => {
    strokeStarship(ctx);
    strokeBooster(ctx, { crown: true, plume: true });
  });
  labelCraft(ctx, c, "Stack", STACK_LAUNCH.aftFlapTipX + 5, alpha);
}

/** Starship-only silhouette (post stage-out). */
export function drawShipIcon(
  ctx: CanvasRenderingContext2D,
  c: CraftPt,
  alpha = 1,
): void {
  const mid = (STACK_LAUNCH.noseY + STACK_LAUNCH.shipBaseY) / 2;
  withCraftStroke(ctx, c, alpha, () => {
    ctx.translate(0, -mid);
    strokeStarship(ctx);
  });
  labelCraft(ctx, c, "S", STACK_LAUNCH.aftFlapTipX * 0.55 + 6, alpha);
}

/** Super Heavy-only silhouette (recovery / post stage-out). */
export function drawBoosterIcon(
  ctx: CanvasRenderingContext2D,
  c: CraftPt,
  alpha = 1,
): void {
  const mid = (STACK_LAUNCH.boostTopY + STACK_LAUNCH.boostBotY) / 2;
  withCraftStroke(ctx, c, alpha, () => {
    ctx.translate(0, -mid);
    strokeBooster(ctx, { crown: true, plume: false });
  });
  labelCraft(ctx, c, "B", STACK_LAUNCH.gridFinTipX + 4, alpha);
}

function withCraftStroke(
  ctx: CanvasRenderingContext2D,
  c: CraftPt,
  alpha: number,
  draw: () => void,
): void {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.globalAlpha = Math.max(0.15, alpha);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.15;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  draw();
  ctx.restore();
}

function labelCraft(
  ctx: CanvasRenderingContext2D,
  c: CraftPt,
  letter: string,
  dx: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0.15, alpha);
  ctx.fillStyle = "#fff";
  ctx.font = "9px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, c.x + dx, c.y);
  ctx.restore();
}

function strokeStarship(ctx: CanvasRenderingContext2D): void {
  const L = STACK_LAUNCH;
  const w = L.bodyHalfW;
  strokeNose(ctx, w, L.noseY, L.shoulderY);
  strokeCanards(ctx, w, L.canardY, L.canardTipX);
  strokeBodySides(ctx, w, L.shoulderY, L.shipBaseY);
  strokeAftFlaps(ctx, w, L.aftFlapTopY, L.aftFlapBotY, L.aftFlapTipX);
  ctx.beginPath();
  ctx.moveTo(-w, L.shipBaseY);
  ctx.lineTo(w, L.shipBaseY);
  ctx.stroke();
  strokeShipEngines(ctx, w, L.shipBaseY);
}

function strokeNose(
  ctx: CanvasRenderingContext2D,
  w: number,
  noseY: number,
  shoulderY: number,
): void {
  ctx.beginPath();
  ctx.moveTo(-w, shoulderY);
  ctx.quadraticCurveTo(-w * 0.22, noseY + 3.2, 0, noseY);
  ctx.quadraticCurveTo(w * 0.22, noseY + 3.2, w, shoulderY);
  ctx.stroke();
}

function strokeCanards(
  ctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  tipX: number,
): void {
  strokePoly(ctx, [
    [-w, y - 1.1],
    [-tipX, y + 0.35],
    [-w, y + 1.4],
  ]);
  strokePoly(ctx, [
    [w, y - 1.1],
    [tipX, y + 0.35],
    [w, y + 1.4],
  ]);
}

function strokeBodySides(
  ctx: CanvasRenderingContext2D,
  w: number,
  y0: number,
  y1: number,
): void {
  ctx.beginPath();
  ctx.moveTo(-w, y0);
  ctx.lineTo(-w, y1);
  ctx.moveTo(w, y0);
  ctx.lineTo(w, y1);
  ctx.stroke();
}

function strokeAftFlaps(
  ctx: CanvasRenderingContext2D,
  w: number,
  topY: number,
  botY: number,
  tipX: number,
): void {
  strokePoly(ctx, [
    [-w, topY],
    [-tipX, botY + 0.6],
    [-tipX + 2.4, botY + 2.4],
    [-w, botY],
  ]);
  strokePoly(ctx, [
    [w, topY],
    [tipX, botY + 0.6],
    [tipX - 2.4, botY + 2.4],
    [w, botY],
  ]);
}

/** Short parallel ticks at the ship engine skirt. */
function strokeShipEngines(
  ctx: CanvasRenderingContext2D,
  w: number,
  baseY: number,
): void {
  ctx.beginPath();
  const xs = [-w * 0.72, -w * 0.24, w * 0.24, w * 0.72];
  for (const x of xs) {
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY + 2.1);
  }
  ctx.stroke();
}

function strokeBooster(
  ctx: CanvasRenderingContext2D,
  opts: { crown: boolean; plume: boolean },
): void {
  const L = STACK_LAUNCH;
  const w = L.bodyHalfW;
  if (opts.crown) strokeHotStageCrown(ctx, w, L.crownY);
  strokeGridFins(ctx, w, L.gridFinY, L.gridFinTipX);
  strokeBodySides(ctx, w, L.boostTopY, L.boostBotY);
  ctx.beginPath();
  ctx.moveTo(-w, L.boostBotY);
  ctx.lineTo(w, L.boostBotY);
  ctx.stroke();
  strokeLandingChines(ctx, w, L.chineTopY, L.boostBotY);
  strokeEngineBells(ctx, w, L.boostBotY, L.engineTipY);
  if (opts.plume) strokeLaunchPlume(ctx, L.engineTipY, L.plumeEndY);
}

/** Upward sawtooth ring at the hot-stage / interstage. */
function strokeHotStageCrown(
  ctx: CanvasRenderingContext2D,
  w: number,
  y: number,
): void {
  const n = 7;
  const h = 2.15;
  const x0 = -w;
  const span = w * 2;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  for (let i = 0; i < n; i++) {
    const xB = x0 + (span * (i + 0.5)) / n;
    const xC = x0 + (span * (i + 1)) / n;
    ctx.lineTo(xB, y - h);
    ctx.lineTo(xC, y);
  }
  ctx.stroke();
}

function strokeGridFins(
  ctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  tipX: number,
): void {
  ctx.beginPath();
  ctx.moveTo(-w, y);
  ctx.lineTo(-tipX, y);
  ctx.moveTo(-w, y + 1.15);
  ctx.lineTo(-tipX + 0.4, y + 1.15);
  ctx.moveTo(w, y);
  ctx.lineTo(tipX, y);
  ctx.moveTo(w, y + 1.15);
  ctx.lineTo(tipX - 0.4, y + 1.15);
  ctx.stroke();
}

/** Four long vertical landing fins along the lower booster. */
function strokeLandingChines(
  ctx: CanvasRenderingContext2D,
  w: number,
  topY: number,
  botY: number,
): void {
  const outer = w + 2.35;
  const inner = w + 1.05;
  strokeFinPair(ctx, outer, topY, botY);
  strokeFinPair(ctx, inner, topY + 2.4, botY);
}

function strokeFinPair(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  botY: number,
): void {
  ctx.beginPath();
  ctx.moveTo(-x, topY);
  ctx.lineTo(-x, botY);
  ctx.moveTo(x, topY);
  ctx.lineTo(x, botY);
  ctx.stroke();
}

/** Five downward engine-bell triangles. */
function strokeEngineBells(
  ctx: CanvasRenderingContext2D,
  w: number,
  baseY: number,
  tipY: number,
): void {
  const xs = [-w * 0.82, -w * 0.41, 0, w * 0.41, w * 0.82];
  const half = 1.05;
  for (const x of xs) {
    strokePoly(ctx, [
      [x - half, baseY],
      [x, tipY],
      [x + half, baseY],
    ]);
  }
}

/** Six thin exhaust streaks of mixed length (launch plume). */
function strokeLaunchPlume(
  ctx: CanvasRenderingContext2D,
  topY: number,
  endY: number,
): void {
  const span = endY - topY;
  const streaks: ReadonlyArray<readonly [number, number]> = [
    [-3.4, 0.58],
    [-2.05, 0.82],
    [-0.7, 0.7],
    [0.7, 1],
    [2.05, 0.76],
    [3.4, 0.52],
  ];
  ctx.beginPath();
  for (const [x, frac] of streaks) {
    ctx.moveTo(x, topY + 0.4);
    ctx.lineTo(x, topY + span * frac);
  }
  ctx.stroke();
}

function strokePoly(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<readonly [number, number]>): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.stroke();
}

/** Visual KeyMap canvas draw pass. */

import type { KeyCap, KeyRow } from "./visualKeymapLayout";
import { GAP, KEYMAP_ROWS, ROW_GAP, boardSizeUnits, rowWidthUnits } from "./visualKeymapLayout";

type KeymapLayout = {
  unit: number;
  originX: number;
  originY: number;
  boardU: number;
  gapPx: number;
  rowGapPx: number;
  radius: number;
  padBottom: number;
  W: number;
  H: number;
  dpr: number;
};

/**
 * Draw the KeyMap keyboard into a 2-D canvas (device pixels).
 * White strokes / text on pure black — matches cross-section theater style.
 */
export function drawVisualKeymap(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dpr: number,
  rows: readonly KeyRow[] = KEYMAP_ROWS,
): void {
  const layout = prepareKeymapCanvas(ctx, cssW, cssH, dpr, rows);
  paintKeymapBoard(ctx, layout, rows);
  drawMouseLegend(ctx, layout);
}

function prepareKeymapCanvas(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dpr: number,
  rows: readonly KeyRow[],
): KeymapLayout {
  const W = Math.max(1, Math.round(cssW * dpr));
  const H = Math.max(1, Math.round(cssH * dpr));
  resizeCanvasIfNeeded(ctx, W, H);
  clearBlack(ctx, W, H);
  return computeKeymapLayout(W, H, dpr, rows);
}

function resizeCanvasIfNeeded(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
): void {
  if (ctx.canvas.width !== W || ctx.canvas.height !== H) {
    ctx.canvas.width = W;
    ctx.canvas.height = H;
  }
}

function clearBlack(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
}

function computeKeymapLayout(
  W: number,
  H: number,
  dpr: number,
  rows: readonly KeyRow[],
): KeymapLayout {
  const { w: boardU, h: boardH } = boardSizeUnits(rows);
  const unit = keymapUnit(W, H, dpr, boardU, boardH);
  return keymapLayoutFromUnit(W, H, dpr, boardU, boardH, unit);
}

function keymapUnit(
  W: number,
  H: number,
  dpr: number,
  boardU: number,
  boardH: number,
): number {
  const padX = 28 * dpr;
  const padTop = 20 * dpr;
  const padBottom = 48 * dpr;
  return Math.min((W - padX * 2) / boardU, (H - padTop - padBottom) / boardH);
}

function keymapLayoutFromUnit(
  W: number,
  H: number,
  dpr: number,
  boardU: number,
  boardH: number,
  unit: number,
): KeymapLayout {
  const padTop = 20 * dpr;
  const padBottom = 48 * dpr;
  return {
    ...keymapGeometry(W, H, dpr, boardU, boardH, unit, padTop, padBottom),
    padBottom, W, H, dpr,
  };
}

function keymapGeometry(
  W: number, H: number, dpr: number,
  boardU: number, boardH: number, unit: number,
  padTop: number, padBottom: number,
) {
  const availH = H - padTop - padBottom;
  return {
    unit, boardU, gapPx: GAP * unit, rowGapPx: ROW_GAP * unit,
    originX: (W - boardU * unit) * 0.5,
    originY: padTop + (availH - boardH * unit) * 0.35,
    radius: Math.max(3 * dpr, unit * 0.12),
  };
}

function paintKeymapBoard(
  ctx: CanvasRenderingContext2D,
  layout: KeymapLayout,
  rows: readonly KeyRow[],
): void {
  setKeymapStrokeStyle(ctx, layout.dpr);
  let y = layout.originY;
  for (const row of rows) {
    drawKeyRow(ctx, layout, row, y);
    y += layout.unit + layout.rowGapPx;
  }
}

function setKeymapStrokeStyle(
  ctx: CanvasRenderingContext2D,
  dpr: number,
): void {
  ctx.lineWidth = Math.max(1, 1.25 * dpr);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
}

function drawKeyRow(
  ctx: CanvasRenderingContext2D,
  layout: KeymapLayout,
  row: KeyRow,
  y: number,
): void {
  const rowU = rowWidthUnits(row);
  let x = layout.originX + (layout.boardU - rowU) * layout.unit * 0.5;
  for (const key of row) {
    const kw = (key.w ?? 1) * layout.unit;
    drawKeyCap(ctx, layout, key, x, y, kw);
    x += kw + layout.gapPx;
  }
}

function drawKeyCap(
  ctx: CanvasRenderingContext2D,
  layout: KeymapLayout,
  key: KeyCap,
  x: number,
  y: number,
  kw: number,
): void {
  const active = Boolean(key.action);
  const keyH = layout.unit;
  strokeKeyOutline(ctx, x, y, kw, keyH, layout.radius, active);
  if (active) fillKeySoft(ctx, x, y, kw, keyH, layout.radius);
  drawKeyLabels(ctx, layout, key, x, y, kw, keyH, active);
}

function strokeKeyOutline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kw: number,
  keyH: number,
  radius: number,
  active: boolean,
): void {
  ctx.globalAlpha = active ? 1 : 0.35;
  roundRect(ctx, x, y, kw, keyH, radius);
  ctx.stroke();
}

function fillKeySoft(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kw: number,
  keyH: number,
  radius: number,
): void {
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#fff";
  roundRect(ctx, x, y, kw, keyH, radius);
  ctx.fill();
}

function drawKeyLabels(
  ctx: CanvasRenderingContext2D,
  layout: KeymapLayout,
  key: KeyCap,
  x: number,
  y: number,
  kw: number,
  keyH: number,
  active: boolean,
): void {
  ctx.globalAlpha = active ? 1 : 0.4;
  ctx.fillStyle = "#fff";
  const labelSize = Math.min(layout.unit * 0.28, kw * 0.22);
  if (key.action) {
    drawBoundKeyText(ctx, layout, key, x, y, kw, keyH, labelSize);
  } else {
    drawUnboundKeyText(ctx, key.label, x, y, kw, keyH, labelSize);
  }
}

function drawBoundKeyText(
  ctx: CanvasRenderingContext2D,
  layout: KeymapLayout,
  key: KeyCap,
  x: number,
  y: number,
  kw: number,
  keyH: number,
  labelSize: number,
): void {
  fillKeyGlyph(ctx, key.label, x, y, kw, keyH, labelSize, 0.34);
  fillKeyAction(ctx, layout, key.action!, x, y, kw, keyH);
}

function fillKeyGlyph(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  kw: number,
  keyH: number,
  labelSize: number,
  yFrac: number,
): void {
  ctx.font = `600 ${labelSize}px ui-monospace, "Cascadia Code", Menlo, monospace`;
  ctx.fillText(label, x + kw * 0.5, y + keyH * yFrac);
}

function fillKeyAction(
  ctx: CanvasRenderingContext2D,
  layout: KeymapLayout,
  action: string,
  x: number,
  y: number,
  kw: number,
  keyH: number,
): void {
  const actionSize = Math.min(layout.unit * 0.155, kw * 0.14);
  ctx.globalAlpha = 0.85;
  ctx.font = `500 ${actionSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(action, x + kw * 0.5, y + keyH * 0.68, kw - 6 * layout.dpr);
}

function drawUnboundKeyText(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  kw: number,
  keyH: number,
  labelSize: number,
): void {
  ctx.font = `600 ${labelSize}px ui-monospace, "Cascadia Code", Menlo, monospace`;
  ctx.fillText(label, x + kw * 0.5, y + keyH * 0.5);
}

function drawMouseLegend(
  ctx: CanvasRenderingContext2D,
  layout: KeymapLayout,
): void {
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#fff";
  ctx.font = `500 ${11 * layout.dpr}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(MOUSE_LEGEND, layout.W * 0.5, layout.H - layout.padBottom * 0.45);
  ctx.globalAlpha = 1;
}

const MOUSE_LEGEND =
  "Mouse · left-drag orbit  ·  right-drag pan  ·  scroll zoom   ·   double-tap 1–5 frame";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  pathRoundRect(ctx, x, y, w, h, rr);
  ctx.closePath();
}

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rr: number,
): void {
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}

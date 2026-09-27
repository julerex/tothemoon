/** Visual KeyMap canvas draw pass. */

import type { KeyCap, KeyRow } from "./visualKeymapLayout";
import {
  KEYMAP_ROWS,
  ROW_GAP,
  boardSizeUnits,
  keyLegendAlign,
  rowKeySlots,
  rowLiftUnits,
} from "./visualKeymapLayout";

type KeymapLayout = {
  unitX: number;
  unitY: number;
  originX: number;
  originY: number;
  boardU: number;
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
  const padX = 18 * dpr;
  const padTop = 14 * dpr;
  const padBottom = 36 * dpr;
  const unitX = Math.max(1, (W - padX * 2) / boardU);
  const unitY = Math.max(1, (H - padTop - padBottom) / boardH);
  return {
    unitX,
    unitY,
    boardU,
    rowGapPx: ROW_GAP * unitY,
    originX: padX,
    originY: padTop,
    radius: Math.max(3 * dpr, Math.min(unitX, unitY) * 0.12),
    padBottom,
    W,
    H,
    dpr,
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
    y += rowLiftUnits(row) * layout.unitY;
    drawKeyRow(ctx, layout, row, y);
    y += layout.unitY + layout.rowGapPx;
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
  const slots = rowKeySlots(row, layout.boardU);
  for (let i = 0; i < row.length; i++) {
    const slot = slots[i]!;
    const x = layout.originX + slot.x * layout.unitX;
    const kw = slot.w * layout.unitX;
    drawKeyCap(ctx, layout, row[i]!, x, y, kw, i === row.length - 1);
  }
}

function drawKeyCap(
  ctx: CanvasRenderingContext2D,
  layout: KeymapLayout,
  key: KeyCap,
  x: number,
  y: number,
  kw: number,
  trailing: boolean,
): void {
  const active = Boolean(key.action);
  const keyH = (key.h ?? 1) * layout.unitY;
  const top = (key.h ?? 1) < 1 ? y - layout.rowGapPx - keyH : y;
  strokeKeyOutline(ctx, x, top, kw, keyH, layout.radius, active);
  if (active) fillKeySoft(ctx, x, top, kw, keyH, layout.radius);
  drawKeyLabels(ctx, layout, key, x, top, kw, keyH, active, trailing);
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
  trailing: boolean,
): void {
  ctx.globalAlpha = active ? 1 : 0.4;
  ctx.fillStyle = "#fff";
  ctx.textAlign = keyLegendAlign(key.label, trailing);
  const labelSize = Math.min(keyH * 0.28, kw * 0.22);
  const legend = legendBox(key.label, trailing, x, kw, layout.dpr);
  if (key.action) {
    drawBoundKeyText(ctx, key, legend, y, keyH, labelSize);
  } else {
    drawUnboundKeyText(ctx, key.label, legend.anchor, y, keyH, labelSize);
  }
}

/** Anchor and max text width. Side-aligned legends sit inset from that edge of the cap. */
function legendBox(
  label: string,
  trailing: boolean,
  x: number,
  kw: number,
  dpr: number,
): { anchor: number; maxWidth: number } {
  const align = keyLegendAlign(label, trailing);
  const inset = Math.max(8 * dpr, kw * 0.1);
  if (align === "left") {
    return { anchor: x + inset, maxWidth: Math.max(1, kw - inset * 2) };
  }
  if (align === "right") {
    return { anchor: x + kw - inset, maxWidth: Math.max(1, kw - inset * 2) };
  }
  return { anchor: x + kw * 0.5, maxWidth: Math.max(1, kw - 6 * dpr) };
}

function drawBoundKeyText(
  ctx: CanvasRenderingContext2D,
  key: KeyCap,
  legend: { anchor: number; maxWidth: number },
  y: number,
  keyH: number,
  labelSize: number,
): void {
  fillKeyGlyph(ctx, key.label, legend.anchor, y, keyH, labelSize, 0.34);
  fillKeyAction(ctx, key.action!, legend, y, keyH);
}

function fillKeyGlyph(
  ctx: CanvasRenderingContext2D,
  label: string,
  anchor: number,
  y: number,
  keyH: number,
  labelSize: number,
  yFrac: number,
): void {
  ctx.font = `600 ${labelSize}px ui-monospace, "Cascadia Code", Menlo, monospace`;
  ctx.fillText(label, anchor, y + keyH * yFrac);
}

function fillKeyAction(
  ctx: CanvasRenderingContext2D,
  action: string,
  legend: { anchor: number; maxWidth: number },
  y: number,
  keyH: number,
): void {
  const actionSize = Math.min(keyH * 0.155, legend.maxWidth * 0.14);
  ctx.globalAlpha = 0.85;
  ctx.font = `500 ${actionSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(action, legend.anchor, y + keyH * 0.68, legend.maxWidth);
}

function drawUnboundKeyText(
  ctx: CanvasRenderingContext2D,
  label: string,
  anchor: number,
  y: number,
  keyH: number,
  labelSize: number,
): void {
  ctx.font = `600 ${labelSize}px ui-monospace, "Cascadia Code", Menlo, monospace`;
  ctx.fillText(label, anchor, y + keyH * 0.5);
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

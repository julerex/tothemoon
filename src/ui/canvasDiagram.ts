/**
 * Shared 2-D canvas diagram utilities for HUD cross-sections and trajectory maps.
 * World coords: +x right, +y up. Canvas coords: +y down.
 */

/** Axis-aligned world bounds (km). */
export type DiagramBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

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

/** World point → CSS pixel (flips y). */
export function worldToCanvas(
  p: { x: number; y: number },
  view: ViewTransform,
): { x: number; y: number } {
  return {
    x: view.originX + p.x * view.scale,
    y: view.originY - p.y * view.scale,
  };
}

/**
 * Fit bounds into a canvas with equal x/y scale and padding.
 * Origin centers the used bounding box (corner-aligned world min/max).
 */
export function fitBoxView(
  bounds: DiagramBounds,
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
  return boxViewOrigin(bounds, w, h, scale, dpr);
}

function boxViewOrigin(
  bounds: DiagramBounds,
  w: number,
  h: number,
  scale: number,
  dpr: number,
): ViewTransform {
  const usedW = (bounds.xMax - bounds.xMin) * scale;
  const usedH = (bounds.yMax - bounds.yMin) * scale;
  return {
    scale,
    originX: (w - usedW) / 2 - bounds.xMin * scale,
    originY: (h - usedH) / 2 + bounds.yMax * scale,
    width: w,
    height: h,
    dpr,
  };
}

/**
 * Fit bounds using the larger axis span (square framing) and center the world origin.
 */
export function fitCenteredSquareView(
  bounds: DiagramBounds,
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
  const cx = (bounds.xMin + bounds.xMax) / 2;
  const cy = (bounds.yMin + bounds.yMax) / 2;
  return {
    scale,
    originX: w / 2 - cx * scale,
    originY: h / 2 + cy * scale,
    width: w,
    height: h,
    dpr,
  };
}

/** Resize backing store, apply DPR transform, fill black. */
export function prepareDiagramCanvas(
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

export function formatMissionClock(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  if (m < 60) return `T+${m}:${sec.toFixed(1).padStart(4, "0")}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `T+${h}h ${String(mm).padStart(2, "0")}m`;
}

export type ScaleBarGeom = { x0: number; x1: number; y: number };

export function scaleBarGeom(
  view: ViewTransform,
  cssW: number,
  cssH: number,
  km: number,
): ScaleBarGeom {
  const px = km * view.scale;
  const x1 = cssW - 16;
  return { x0: x1 - px, x1, y: cssH - 18 };
}

export function paintScaleBarTicks(
  ctx: CanvasRenderingContext2D,
  g: ScaleBarGeom,
): void {
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(g.x0, g.y);
  ctx.lineTo(g.x1, g.y);
  ctx.moveTo(g.x0, g.y - 4);
  ctx.lineTo(g.x0, g.y + 4);
  ctx.moveTo(g.x1, g.y - 4);
  ctx.lineTo(g.x1, g.y + 4);
  ctx.stroke();
}

export function paintScaleBarLabel(
  ctx: CanvasRenderingContext2D,
  g: ScaleBarGeom,
  label: string,
): void {
  ctx.font = "10px ui-monospace, SF Mono, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, (g.x0 + g.x1) / 2, g.y - 6);
}

export function pickScaleKm(
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

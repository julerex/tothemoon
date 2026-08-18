/**
 * TPS hex-tile canvas painters.
 */

import {
  HEX_TILE_COLS, HEX_TILE_ROWS, TILE_SIDE_MARK,
  hexCellCenter, hexRadiusForMap, hexTileAlbedo, hexTileKind, hexVertex, latticeHash, type HexTileKind,
} from "./hexTileLayout";

/** Stroke a pointy-top hex into `ctx` (path only). */
export function hexPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const p = hexVertex(cx, cy, radius, i);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

export type HexMapCanvases = {
  color: HTMLCanvasElement;
  rough: HTMLCanvasElement;
  bump: HTMLCanvasElement;
  emissive: HTMLCanvasElement;
};

/**
 * Paint the four TPS maps. Grout is darker / rougher / recessed; experiment
 * hexes are white; missing hexes are a sunken underlayer.
 */
export function paintHexTileMaps(maps: HexMapCanvases): void {
  const w = maps.color.width;
  const h = maps.color.height;
  const radius = hexRadiusForMap(w, h);
  const ctxs = hexMapContexts(maps);
  fillHexMapBases(ctxs, w, h);
  paintHexField(ctxs, w, h, radius);
  paintTileSideMark(ctxs.color, w, h);
}

type HexCtxs = {
  color: CanvasRenderingContext2D;
  rough: CanvasRenderingContext2D;
  bump: CanvasRenderingContext2D;
  emissive: CanvasRenderingContext2D;
};

function hexMapContexts(maps: HexMapCanvases): HexCtxs {
  return {
    color: maps.color.getContext("2d")!,
    rough: maps.rough.getContext("2d")!,
    bump: maps.bump.getContext("2d")!,
    emissive: maps.emissive.getContext("2d")!,
  };
}

function fillHexMapBases(ctxs: HexCtxs, w: number, h: number): void {
  ctxs.color.fillStyle = "#121416";
  ctxs.color.fillRect(0, 0, w, h);
  ctxs.rough.fillStyle = "#d0d0d0";
  ctxs.rough.fillRect(0, 0, w, h);
  ctxs.bump.fillStyle = "#2a2a2a";
  ctxs.bump.fillRect(0, 0, w, h);
  ctxs.emissive.fillStyle = "#000000";
  ctxs.emissive.fillRect(0, 0, w, h);
}

function paintHexField(ctxs: HexCtxs, w: number, h: number, radius: number): void {
  const cols = HEX_TILE_COLS + 2;
  const rows = HEX_TILE_ROWS + 2;
  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      paintOneHex(ctxs, col, row, radius, w, h);
    }
  }
}

function paintOneHex(
  ctxs: HexCtxs,
  col: number,
  row: number,
  radius: number,
  w: number,
  h: number,
): void {
  const { cx, cy } = hexCellCenter(col, row, radius);
  if (cx < -radius || cy < -radius || cx > w + radius || cy > h + radius) return;
  const kind = hexTileKind(col, row);
  const inset = kind === "missing" ? radius * 0.72 : radius * 0.92;
  fillHexKind(ctxs, cx, cy, inset, col, row, kind);
  strokeHexGrout(ctxs, cx, cy, radius, kind);
}

function fillHexKind(
  ctxs: HexCtxs,
  cx: number,
  cy: number,
  radius: number,
  col: number,
  row: number,
  kind: HexTileKind,
): void {
  const rgb = hexTileAlbedo(col, row);
  hexPath(ctxs.color, cx, cy, radius);
  ctxs.color.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  ctxs.color.fill();
  hexPath(ctxs.rough, cx, cy, radius);
  ctxs.rough.fillStyle = roughFillForKind(kind, col, row);
  ctxs.rough.fill();
  hexPath(ctxs.bump, cx, cy, radius);
  ctxs.bump.fillStyle = kind === "missing" ? "#141414" : "#c8c8c8";
  ctxs.bump.fill();
  if (kind === "missing") {
    hexPath(ctxs.emissive, cx, cy, radius * 1.05);
    ctxs.emissive.fillStyle = "#3a2214";
    ctxs.emissive.fill();
  }
}

function roughFillForKind(kind: HexTileKind, col: number, row: number): string {
  if (kind === "experiment") return "#8a8a8a";
  if (kind === "missing") return "#f0f0f0";
  const g = 150 + Math.round(latticeHash(col, row, 3) * 40);
  return `rgb(${g},${g},${g})`;
}

function strokeHexGrout(
  ctxs: HexCtxs,
  cx: number,
  cy: number,
  radius: number,
  kind: HexTileKind,
): void {
  const grout = kind === "missing" ? "rgba(70,52,36,0.95)" : "rgba(36,32,30,0.92)";
  hexPath(ctxs.color, cx, cy, radius);
  ctxs.color.strokeStyle = grout;
  ctxs.color.lineWidth = Math.max(1.1, radius * 0.12);
  ctxs.color.stroke();
  hexPath(ctxs.emissive, cx, cy, radius);
  ctxs.emissive.strokeStyle = "rgb(48,28,16)";
  ctxs.emissive.lineWidth = Math.max(1.0, radius * 0.10);
  ctxs.emissive.stroke();
}

function paintTileSideMark(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const x = TILE_SIDE_MARK.u * w;
  const y = TILE_SIDE_MARK.v * h;
  ctx.save();
  ctx.font = `700 ${Math.round(h * 0.028)}px "Arial Narrow", "Helvetica Neue", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(236, 238, 242, 0.92)";
  ctx.fillText(TILE_SIDE_MARK.text, x, y);
  ctx.restore();
}


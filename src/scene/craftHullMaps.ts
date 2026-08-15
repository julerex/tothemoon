/**
 * Photorealism V13 — hull-cam / fin-cam material layout (hex TPS, S40, oil-canning).
 *
 * Pure helpers plus canvas painters. Layout math is deterministic (no
 * `Math.random`) so unit tests can lock tile kinds, stencil placement, and
 * oil-can amplitude. Look target: Flight 13 stills at T+8:21 / T+1:04:55
 * (`assets/flight13-webcast/`).
 *
 * Theater-grade: canvas maps, not 20k tile meshes or a second shader stack.
 *
 * @see craft.ts — applies these maps to the ship / booster materials
 * @see docs/VISUAL_REALISM.md — V13 hull-cam materials
 */

/** Windward hex columns across the TPS arc (fin-cam readable). */
export const HEX_TILE_COLS = 24;

/** Target hex rows along the barrel (nose → engines on the tall map). */
export const HEX_TILE_ROWS = 72;

/** Color / roughness / bump / emissive map size (U × V). */
export const HEX_TILE_MAP_SIZE = { w: 512, h: 1536 } as const;

/**
 * White missing-tile imaging targets (Flight 13 page + post-splash still).
 * `[col, row]` in the {@link HEX_TILE_COLS} × {@link HEX_TILE_ROWS} field.
 */
export const EXPERIMENT_HEXES: readonly (readonly [number, number])[] = [
  [8, 18],
  [11, 29],
  [6, 38],
  [10, 47],
  [7, 56],
];

/**
 * Missing-tile holes (dark underlayer, not gray boxes).
 * Aft-biased so landing-approach / splash stills read the gaps.
 */
export const MISSING_HEXES: readonly (readonly [number, number])[] = [
  [5, 22],
  [12, 33],
  [4, 44],
  [9, 52],
  [7, 61],
];

/** Small "00" stencil on the tiled belly (coast / SECO stills). */
export const TILE_SIDE_MARK = {
  text: "00",
  /** U in 0–1 across the heat-shield arc. */
  u: 0.38,
  /** V in 0–1 (0 = nose end of the map, 1 = engines). */
  v: 0.42,
} as const;

/**
 * Flight 13 ship hull number on the stainless leeward, readable from fin cam.
 * Angle uses the craft `(sin θ, cos θ)` barrel convention (θ = 0 is +Y belly).
 */
export const SHIP_HULL_MARK = {
  text: "S40",
  /** Radians from +Y toward +X (starboard steel, just past the TPS chine). */
  ang: Math.PI * 0.58,
  /** Fraction of ship height from the engines (0) toward the nose (1). */
  zFrac: 0.50,
  /** Decal width in craft mesh units (~2.6 m). */
  width: 0.066,
  /** Decal height in craft mesh units (~1.1 m). */
  height: 0.028,
} as const;

/** One hex-tile patch on the stainless face of each aft elevon. */
export const AFT_FLAP_STEEL_TILE_PATCHES = 2;

export type HexTileKind = "tile" | "experiment" | "missing";

export type Rgb = { r: number; g: number; b: number };

/**
 * Clamp `x` into `[0, 1]`. Non-finite → 0.
 */
export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

/**
 * Deterministic 0–1 hash from integer lattice coordinates.
 */
export function latticeHash(col: number, row: number, salt = 0): number {
  let n = (col * 73856093) ^ (row * 19349663) ^ (salt * 83492791);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function hexKey(col: number, row: number): string {
  return `${col},${row}`;
}

const EXPERIMENT_SET = new Set(EXPERIMENT_HEXES.map(([c, r]) => hexKey(c, r)));
const MISSING_SET = new Set(MISSING_HEXES.map(([c, r]) => hexKey(c, r)));

/**
 * Kind of one hex cell. Experiment wins over missing if a key were duplicated.
 */
export function hexTileKind(col: number, row: number): HexTileKind {
  const key = hexKey(col, row);
  if (EXPERIMENT_SET.has(key)) return "experiment";
  if (MISSING_SET.has(key)) return "missing";
  return "tile";
}

/**
 * Pointy-top hex radius that fills `w × h` at the exported column/row density.
 */
const SQRT3 = Math.sqrt(3);

export function hexRadiusForMap(
  w: number,
  h: number,
  cols = HEX_TILE_COLS,
  rows = HEX_TILE_ROWS,
): number {
  const byW = w / (cols * SQRT3);
  const byH = h / (rows * 1.5 + 0.5);
  return Math.min(byW, byH);
}

/**
 * Center of a pointy-top hex. Row 0 sits at the nose end of the map (canvas top).
 */
export function hexCellCenter(
  col: number,
  row: number,
  radius: number,
): { cx: number; cy: number } {
  return {
    cx: radius * SQRT3 * (col + 0.5 * (row & 1) + 0.5),
    cy: radius * (1 + row * 1.5),
  };
}

/**
 * One vertex of a pointy-top hex (`i` in 0…5). Side length equals `radius`.
 */
export function hexVertex(
  cx: number,
  cy: number,
  radius: number,
  i: number,
): { x: number; y: number } {
  const a = Math.PI / 6 + i * (Math.PI / 3);
  return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
}

/**
 * How close a column is to the TPS / steel chine (1 = on the edge).
 */
export function hexEdgeFactor(col: number, cols = HEX_TILE_COLS): number {
  if (col <= 1 || col >= cols - 2) return 1;
  if (col <= 2 || col >= cols - 3) return 0.45;
  return 0;
}

/**
 * Per-tile albedo (0–255). Experiment tiles are high-contrast white;
 * missing tiles are a dark underlayer; edge columns run warmer (char).
 */
export function hexTileAlbedo(col: number, row: number): Rgb {
  const kind = hexTileKind(col, row);
  if (kind === "experiment") return { r: 232, g: 234, b: 238 };
  if (kind === "missing") return { r: 14, g: 12, b: 12 };
  return hexBodyAlbedo(col, row);
}

function hexBodyAlbedo(col: number, row: number): Rgb {
  const n = 16 + Math.round(latticeHash(col, row, 1) * 14);
  const toast = latticeHash(col, row, 2) > 0.82 ? 10 : 0;
  const edge = hexEdgeFactor(col);
  const r = Math.min(255, n + toast + Math.round(edge * 18));
  const g = Math.min(255, n + 1 + Math.round(toast * 0.5) + Math.round(edge * 8));
  const b = Math.min(255, n + 2 + Math.round(edge * 4));
  return { r, g, b };
}

/**
 * Residual grout / tile-gap glow after plasma decays into descent.
 * Landing-approach stills (T+1:04:55) keep a faint warm grout without sprites.
 */
export function tileGroutGlow(plasma: number, phase: string | undefined): number {
  const p = clamp01(plasma);
  if (phase === "descent" || phase === "splashdown") return Math.max(p, 0.14);
  if (phase === "entry") return Math.max(p, 0.05);
  return p;
}

/**
 * Low-frequency stainless panel ripple (oil-canning) in 0–1.
 * Breaks cylindrical reflections at fin-cam range.
 */
export function oilCanHeight(u: number, v: number): number {
  const uu = u - Math.floor(u);
  const vv = v - Math.floor(v);
  const panels = Math.sin(uu * Math.PI * 10) * Math.sin(vv * Math.PI * 7);
  const ripple =
    Math.sin(uu * Math.PI * 3.4 + vv * 5.1) * Math.cos(vv * Math.PI * 2.8 + uu * 1.7);
  const lobe = Math.sin(uu * Math.PI * 2) * 0.12;
  return clamp01(0.5 + 0.30 * panels + 0.16 * ripple + lobe);
}

/**
 * Additive temper-color on stainless (webcast heat-tint / oil-slick).
 * Small RGB in 0–1; stronger near mid-barrel chines.
 */
export function stainlessHeatTint(u: number, v: number): Rgb {
  const uu = u - Math.floor(u);
  const vv = v - Math.floor(v);
  const band = Math.sin(uu * Math.PI * 6 + vv * 2.2) * Math.sin(vv * Math.PI * 3 + 0.4);
  const chine = Math.pow(Math.sin(uu * Math.PI * 2), 2);
  const amp = 0.14 + 0.10 * chine;
  const cool = Math.max(0, band) * amp;
  const warm = Math.max(0, -band) * amp;
  return {
    r: warm * 1.15 + cool * 0.15,
    g: warm * 0.35 + cool * 0.28,
    b: warm * 0.08 + cool * 0.95,
  };
}

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

/**
 * Paint S40 (or any hull stencil) onto a small decal canvas.
 */
export function paintHullMarkDecal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(18, 20, 22, 0.18)";
  ctx.fillRect(w * 0.04, h * 0.18, w * 0.92, h * 0.64);
  ctx.font = `800 ${Math.round(h * 0.62)}px "Arial Black", "Impact", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#141618";
  ctx.fillText(text, w * 0.5, h * 0.52);
}

/**
 * Sample oil-canning + heat tint into stainless color / roughness / bump maps.
 */
export function paintStainlessPhotoreal(
  color: CanvasRenderingContext2D,
  rough: CanvasRenderingContext2D,
  bump: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const img = color.getImageData(0, 0, w, h);
  const bumpImg = bump.createImageData(w, h);
  const data = img.data;
  const bdata = bumpImg.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) paintStainlessTexel(data, bdata, x, y, w, h);
  }
  color.putImageData(img, 0, 0);
  bump.putImageData(bumpImg, 0, 0);
  paintOilCanRough(rough, w, h);
}

function paintStainlessTexel(
  data: Uint8ClampedArray,
  bdata: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const u = x / w;
  const v = y / h;
  const oil = oilCanHeight(u, v);
  const tint = stainlessHeatTint(u, v);
  const i = (y * w + x) * 4;
  const valley = (oil - 0.5) * 36;
  data[i] = clampByte((data[i] ?? 196) + valley + tint.r * 255);
  data[i + 1] = clampByte((data[i + 1] ?? 200) + valley + tint.g * 255);
  data[i + 2] = clampByte((data[i + 2] ?? 204) + valley + tint.b * 255);
  const bh = Math.round(oil * 255);
  bdata[i] = bh;
  bdata[i + 1] = bh;
  bdata[i + 2] = bh;
  bdata[i + 3] = 255;
}

function paintOilCanRough(rough: CanvasRenderingContext2D, w: number, h: number): void {
  const img = rough.getImageData(0, 0, w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const oil = oilCanHeight(x / w, y / h);
      const i = (y * w + x) * 4;
      const g = clampByte((data[i] ?? 106) + (0.5 - oil) * 40);
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
    }
  }
  rough.putImageData(img, 0, 0);
}

function clampByte(n: number): number {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n | 0;
}

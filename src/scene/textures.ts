/**
 * Procedural canvas textures — no external assets required.
 */

/** Equirectangular map: x = lon (−180…180), y = lat (−90…90). */
function lonLatToXy(
  lon: number,
  lat: number,
  w: number,
  h: number,
): [number, number] {
  const x = ((lon + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return [x, y];
}

function fillContinent(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ring: readonly (readonly [number, number])[],
  fill: string | CanvasGradient,
): void {
  if (ring.length < 3) return;
  ctx.beginPath();
  pathContinentRing(ctx, w, h, ring);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Trace lon/lat ring into current path (move + lines). */
function pathContinentRing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ring: readonly (readonly [number, number])[],
): void {
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i]!;
    const [x, y] = lonLatToXy(lon, lat, w, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

/** Soft radial brush in equirectangular space (lat/lon degrees). */
function softBlob(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lon: number,
  lat: number,
  rLon: number,
  rLat: number,
  color: string,
): void {
  const [x, y] = lonLatToXy(lon, lat, w, h);
  const rx = (rLon / 360) * w;
  const ry = (rLat / 180) * h;
  fillSoftEllipse(ctx, x, y, rx, ry, color);
}

/** Radial gradient ellipse fill at pixel center. */
function fillSoftEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Blank canvas with explicit pixel size. */
function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Create 2:1 equirectangular canvas + 2d context. */
function makeEquirectCanvas(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
} {
  const w = size;
  const h = Math.round(size / 2);
  const canvas = makeCanvas(w, h);
  return { canvas, ctx: canvas.getContext("2d")!, w, h };
}

const AFRICA_RING: readonly (readonly [number, number])[] = [
  [-17, 35],
  [-5, 36],
  [10, 37],
  [25, 32],
  [32, 31],
  [43, 12],
  [51, 12],
  [43, -5],
  [40, -15],
  [35, -25],
  [32, -30],
  [20, -35],
  [18, -28],
  [12, -18],
  [10, -5],
  [5, 5],
  [-5, 5],
  [-10, 12],
  [-17, 15],
  [-17, 28],
];

const EUROPE_RING: readonly (readonly [number, number])[] = [
  [-10, 36],
  [-9, 43],
  [-5, 48],
  [0, 50],
  [5, 58],
  [12, 60],
  [20, 55],
  [30, 55],
  [40, 48],
  [40, 42],
  [30, 40],
  [28, 36],
  [20, 36],
  [10, 38],
  [0, 38],
];

const ASIA_RING: readonly (readonly [number, number])[] = [
  [40, 42],
  [45, 48],
  [55, 55],
  [70, 60],
  [90, 65],
  [120, 55],
  [140, 50],
  [145, 45],
  [135, 35],
  [120, 30],
  [110, 20],
  [100, 15],
  [95, 8],
  [80, 8],
  [70, 20],
  [60, 25],
  [50, 30],
  [45, 35],
];

const INDIA_RING: readonly (readonly [number, number])[] = [
  [68, 24],
  [72, 28],
  [78, 32],
  [88, 28],
  [88, 22],
  [82, 12],
  [78, 8],
  [72, 12],
  [70, 18],
];

const AUSTRALIA_RING: readonly (readonly [number, number])[] = [
  [113, -20],
  [120, -14],
  [130, -12],
  [140, -14],
  [148, -20],
  [150, -28],
  [145, -38],
  [135, -36],
  [125, -34],
  [116, -34],
  [114, -26],
];

const N_AMERICA_RING: readonly (readonly [number, number])[] = [
  [-168, 66],
  [-140, 70],
  [-120, 72],
  [-90, 70],
  [-70, 68],
  [-55, 60],
  [-60, 50],
  [-70, 45],
  [-75, 40],
  [-80, 30],
  [-90, 28],
  [-100, 22],
  [-110, 25],
  [-120, 35],
  [-125, 45],
  [-130, 55],
  [-150, 60],
  [-165, 60],
];

const GREENLAND_RING: readonly (readonly [number, number])[] = [
  [-55, 60],
  [-45, 62],
  [-40, 70],
  [-45, 78],
  [-55, 80],
  [-65, 76],
  [-60, 68],
];

const S_AMERICA_RING: readonly (readonly [number, number])[] = [
  [-80, 12],
  [-70, 12],
  [-60, 5],
  [-50, 0],
  [-40, -5],
  [-35, -10],
  [-40, -20],
  [-50, -25],
  [-60, -30],
  [-70, -40],
  [-70, -50],
  [-68, -55],
  [-72, -50],
  [-75, -40],
  [-78, -20],
  [-80, -5],
  [-82, 5],
];

const LAND = "#2f7a3e";
const LAND_DRY = "#8a9a4a";
const LAND_TUNDRA = "#6b8f6a";
const ICE = "#e8f0fa";

/** Deep ocean base with latitude darkening. */
function paintOceanBase(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, "#1a4d7a");
  ocean.addColorStop(0.15, "#0c4a7c");
  ocean.addColorStop(0.5, "#0a3a68");
  ocean.addColorStop(0.85, "#0c4a7c");
  ocean.addColorStop(1, "#1a4d7a");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);
}

/** Subtle bathymetry / gyre variation. */
function paintBathymetry(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < 40; i++) {
    softBlob(ctx, w, h, -180 + Math.random() * 360, -50 + Math.random() * 100,
      25 + Math.random() * 40, 12 + Math.random() * 20,
      `rgba(20, 90, 140, ${0.08 + Math.random() * 0.12})`);
  }
}

/** Africa landmass + Sahara / savanna blobs. */
function paintAfrica(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillContinent(ctx, w, h, AFRICA_RING, LAND);
  softBlob(ctx, w, h, 20, 20, 28, 14, "rgba(194, 164, 106, 0.75)");
  softBlob(ctx, w, h, 25, -5, 18, 12, "rgba(70, 130, 70, 0.35)");
}

function paintEurope(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillContinent(ctx, w, h, EUROPE_RING, LAND_TUNDRA);
}

/** Asia landmass + interior dry / highland cues. */
function paintAsia(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillContinent(ctx, w, h, ASIA_RING, LAND);
  softBlob(ctx, w, h, 90, 45, 40, 18, "rgba(60, 110, 55, 0.4)");
  softBlob(ctx, w, h, 55, 25, 22, 12, "rgba(194, 164, 106, 0.55)");
  softBlob(ctx, w, h, 105, 28, 18, 10, "rgba(180, 150, 90, 0.4)");
  softBlob(ctx, w, h, 78, 22, 14, 10, "rgba(100, 90, 70, 0.35)");
}

function paintIndia(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillContinent(ctx, w, h, INDIA_RING, LAND);
}

/** SE Asia island hints. */
function paintSeAsia(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  softBlob(ctx, w, h, 115, 5, 20, 8, "rgba(47, 122, 62, 0.85)");
  softBlob(ctx, w, h, 125, -2, 18, 6, "rgba(47, 122, 62, 0.7)");
  softBlob(ctx, w, h, 140, -5, 12, 5, "rgba(47, 122, 62, 0.55)");
}

function paintAustralia(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillContinent(ctx, w, h, AUSTRALIA_RING, LAND_DRY);
  softBlob(ctx, w, h, 132, -25, 16, 10, "rgba(194, 164, 106, 0.55)");
}

/** North America + plains / Rockies cues. */
function paintNorthAmerica(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillContinent(ctx, w, h, N_AMERICA_RING, LAND);
  softBlob(ctx, w, h, -100, 50, 30, 14, "rgba(55, 120, 60, 0.45)");
  softBlob(ctx, w, h, -110, 40, 22, 12, "rgba(140, 150, 80, 0.4)");
  softBlob(ctx, w, h, -115, 38, 10, 16, "rgba(90, 90, 70, 0.35)");
}

function paintGreenland(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillContinent(ctx, w, h, GREENLAND_RING, ICE);
}

/** Mexico / Central America blobs. */
function paintCentralAmerica(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  softBlob(ctx, w, h, -100, 20, 12, 8, "rgba(70, 130, 60, 0.8)");
  softBlob(ctx, w, h, -85, 12, 8, 6, "rgba(47, 122, 62, 0.7)");
}

/** South America + Amazon / Andes cues. */
function paintSouthAmerica(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillContinent(ctx, w, h, S_AMERICA_RING, LAND);
  softBlob(ctx, w, h, -60, -5, 18, 14, "rgba(30, 100, 45, 0.55)");
  softBlob(ctx, w, h, -68, -25, 10, 18, "rgba(90, 85, 60, 0.4)");
}

/** Antarctica ice sheet + soft edge. */
function paintAntarctica(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = ICE;
  ctx.fillRect(0, h * 0.88, w, h * 0.12);
  const ant = ctx.createLinearGradient(0, h * 0.82, 0, h * 0.92);
  ant.addColorStop(0, "rgba(232, 240, 250, 0)");
  ant.addColorStop(1, "rgba(232, 240, 250, 1)");
  ctx.fillStyle = ant;
  ctx.fillRect(0, h * 0.82, w, h * 0.1);
}

/** Arctic fringe gradient. */
function paintArctic(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const arc = ctx.createLinearGradient(0, 0, 0, h * 0.12);
  arc.addColorStop(0, "rgba(220, 235, 250, 0.95)");
  arc.addColorStop(0.6, "rgba(180, 210, 230, 0.35)");
  arc.addColorStop(1, "rgba(180, 210, 230, 0)");
  ctx.fillStyle = arc;
  ctx.fillRect(0, 0, w, h * 0.12);
}

/** Specular-ish ocean glints. */
function paintOceanGlints(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < 25; i++) {
    softBlob(ctx, w, h, -180 + Math.random() * 360, -40 + Math.random() * 80,
      8 + Math.random() * 20, 4 + Math.random() * 10, "rgba(80, 160, 220, 0.08)");
  }
}

/** Fine grain noise on earth albedo. */
function paintEarthGrain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  sprinkle(ctx, w, h, Math.floor(w * h * 0.015), "rgba(255,255,255,0.03)");
  sprinkle(ctx, w, h, Math.floor(w * h * 0.01), "rgba(0,0,0,0.04)");
}

/** Old World landmasses. */
function paintOldWorld(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  paintAfrica(ctx, w, h);
  paintEurope(ctx, w, h);
  paintAsia(ctx, w, h);
  paintIndia(ctx, w, h);
  paintSeAsia(ctx, w, h);
  paintAustralia(ctx, w, h);
}

/** New World landmasses. */
function paintNewWorld(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  paintNorthAmerica(ctx, w, h);
  paintGreenland(ctx, w, h);
  paintCentralAmerica(ctx, w, h);
  paintSouthAmerica(ctx, w, h);
}

/** All continent outlines + regional blobs. */
function paintContinents(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  paintOldWorld(ctx, w, h);
  paintNewWorld(ctx, w, h);
}

/**
 * Blue-marble style equirectangular Earth (simplified continent outlines).
 * Poles at top/bottom; 0° lon at texture center-left seam (standard).
 */
export function makeEarthTexture(size = 1024): HTMLCanvasElement {
  const { canvas, ctx, w, h } = makeEquirectCanvas(size);
  paintOceanBase(ctx, w, h);
  paintBathymetry(ctx, w, h);
  paintContinents(ctx, w, h);
  paintAntarctica(ctx, w, h);
  paintArctic(ctx, w, h);
  paintOceanGlints(ctx, w, h);
  paintEarthGrain(ctx, w, h);
  return canvas;
}

/** Per-pixel roughness from albedo RGB. */
function earthRoughFromRgb(r: number, g: number, b: number): number {
  const blueDom = b > r + 15 && b > g;
  const ice = r > 180 && g > 190 && b > 200;
  return ice ? 200 : blueDom ? 55 : 175;
}

/** Remap albedo ImageData to grayscale roughness. */
function remapEarthRoughness(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    const rough = earthRoughFromRgb(d[i]!, d[i + 1]!, d[i + 2]!);
    d[i] = rough;
    d[i + 1] = rough;
    d[i + 2] = rough;
    d[i + 3] = 255;
  }
}

/**
 * Roughness map from an albedo canvas: oceans smoother, land/ice rougher.
 * Pass the same canvas used for the color map so features align.
 */
export function makeEarthRoughnessMap(albedo: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx, w, h } = cloneCanvas(albedo);
  ctx.drawImage(albedo, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  remapEarthRoughness(img.data);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Same-size blank canvas as source. */
function cloneCanvas(src: HTMLCanvasElement): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
} {
  const w = src.width;
  const h = src.height;
  const canvas = makeCanvas(w, h);
  return { canvas, ctx: canvas.getContext("2d")!, w, h };
}

/** Highland base gradient (far side slightly brighter). */
function paintMoonBase(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, "#c2bbb0");
  base.addColorStop(0.25, "#d0c9bc");
  base.addColorStop(0.5, "#c4bdb0");
  base.addColorStop(0.75, "#d0c9bc");
  base.addColorStop(1, "#c2bbb0");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
}

/** Latitude shading (poles a bit brighter / frost-hint). */
function paintMoonPoles(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const poles = ctx.createLinearGradient(0, 0, 0, h);
  poles.addColorStop(0, "rgba(238, 234, 225, 0.28)");
  poles.addColorStop(0.12, "rgba(230, 228, 220, 0)");
  poles.addColorStop(0.88, "rgba(230, 228, 220, 0)");
  poles.addColorStop(1, "rgba(238, 234, 225, 0.28)");
  ctx.fillStyle = poles;
  ctx.fillRect(0, 0, w, h);
}

/** Far-side highland mottling. */
function paintMoonFarHighlands(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < 55; i++) {
    const lon = Math.random() < 0.5 ? -180 + Math.random() * 70 : 110 + Math.random() * 70;
    softBlob(ctx, w, h, lon, -50 + Math.random() * 100, 8 + Math.random() * 22,
      6 + Math.random() * 16,
      `rgba(${195 + Math.random() * 40}, ${190 + Math.random() * 35}, ${178 + Math.random() * 30}, 0.32)`);
  }
}

/** Mare floor + darker core + soft rim brightening. */
function paintMare(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lon: number,
  lat: number,
  rLon: number,
  rLat: number,
  alpha = 0.78,
): void {
  softBlob(ctx, w, h, lon, lat, rLon, rLat, `rgba(52, 48, 44, ${alpha})`);
  softBlob(ctx, w, h, lon, lat, rLon * 0.7, rLat * 0.7, `rgba(38, 36, 32, ${alpha * 0.6})`);
  softBlob(ctx, w, h, lon, lat + rLat * 0.15, rLon * 1.05, rLat * 0.35, "rgba(210, 205, 195, 0.08)");
}

type MareSpec = readonly [number, number, number, number, number];

const NEAR_MARIA: readonly MareSpec[] = [
  [-40, 18, 42, 28, 0.85], [-16, 33, 22, 16, 0.88], [18, 28, 14, 12, 0.82],
  [20, 8, 16, 12, 0.8], [50, -4, 14, 12, 0.78], [35, -15, 10, 9, 0.76],
  [59, 17, 11, 9, 0.82], [-15, -20, 14, 11, 0.78], [-38, -24, 11, 9, 0.76],
  [0, 56, 50, 8, 0.62], [-5, 15, 8, 6, 0.58], [5, -5, 7, 5, 0.52],
];

const FAR_MARIA: readonly MareSpec[] = [
  [148, 27, 9, 7, 0.62], [100, -20, 8, 6, 0.48],
];

function paintMariaList(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  list: readonly MareSpec[],
): void {
  for (const [lon, lat, rLon, rLat, a] of list) {
    paintMare(ctx, w, h, lon, lat, rLon, rLat, a);
  }
}

/** Near-side + far-side maria. */
function paintAllMaria(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  paintMariaList(ctx, w, h, NEAR_MARIA);
  paintMariaList(ctx, w, h, FAR_MARIA);
}

/** Imbrium rim / SPA / south polar highland cues. */
function paintMoonBasins(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  softBlob(ctx, w, h, -16, 20, 30, 22, "rgba(220, 215, 200, 0.2)");
  softBlob(ctx, w, h, 180, -50, 40, 25, "rgba(70, 65, 58, 0.28)");
  softBlob(ctx, w, h, 0, -82, 35, 10, "rgba(225, 220, 210, 0.18)");
  softBlob(ctx, w, h, 20, -78, 12, 6, "rgba(90, 85, 78, 0.15)");
}

/** Crater floor fill. */
function paintCraterFloor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  deep: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(32, 30, 28, ${deep})`;
  ctx.fill();
}

/** Baked shadow crescent inside crater. */
function paintCraterShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  deep: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.2, y + ry * 0.1, rx * 0.7, ry * 0.75, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(18, 16, 14, ${deep * 0.45})`;
  ctx.fill();
}

/** Rim highlight stroke. */
function paintCraterRim(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  deep: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.2, y - ry * 0.18, rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(240, 235, 220, ${0.35 + deep * 0.45})`;
  ctx.lineWidth = Math.max(1.2, rx * 0.16);
  ctx.stroke();
}

/** Outer ejecta ring stroke. */
function paintCraterEjecta(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  deep: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 1.35, ry * 1.35, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(225, 218, 205, ${0.08 + deep * 0.12})`;
  ctx.lineWidth = Math.max(1, rx * 0.08);
  ctx.stroke();
}

/** Named-ish crater (rim + floor + shadow + ejecta). */
function paintCrater(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lon: number,
  lat: number,
  rDeg: number,
  deep = 0.35,
): void {
  const [x, y] = lonLatToXy(lon, lat, w, h);
  const rx = (rDeg / 360) * w;
  const ry = (rDeg / 180) * h;
  paintCraterFloor(ctx, x, y, rx, ry, deep);
  paintCraterShadow(ctx, x, y, rx, ry, deep);
  paintCraterRim(ctx, x, y, rx, ry, deep);
  paintCraterEjecta(ctx, x, y, rx, ry, deep);
}

type CraterSpec = readonly [number, number, number, number];

const MAJOR_CRATERS: readonly CraterSpec[] = [
  [-20, 10, 4.5, 0.48], [-11, -43, 5.5, 0.52], [-3, 34, 4, 0.42],
  [22, -11, 3.5, 0.42], [-9, 13, 3.2, 0.38], [32, 2, 3, 0.35],
  [-60, -15, 3.5, 0.36], [100, 20, 4, 0.38], [-140, -30, 5, 0.42],
  [160, 40, 3.5, 0.36], [0, -70, 3.2, 0.4], [15, -75, 2.5, 0.35],
];

function paintMajorCraters(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (const [lon, lat, r, d] of MAJOR_CRATERS) {
    paintCrater(ctx, w, h, lon, lat, r, d);
  }
}

/** One Tycho ray segment. */
function paintTychoRay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  i: number,
  w: number,
): void {
  const a = (i / 14) * Math.PI * 2 + 0.2;
  const len = (0.09 + (i % 3) * 0.045) * w;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.55);
  ctx.stroke();
}

/** Tycho ray system (simplified). */
function paintTychoRays(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const [cx, cy] = lonLatToXy(-11, -43, w, h);
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = "#efe9df";
  ctx.lineWidth = Math.max(1, w * 0.0022);
  for (let i = 0; i < 14; i++) paintTychoRay(ctx, cx, cy, i, w);
  ctx.restore();
}

/** Random smaller craters. */
function paintRandomCraters(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < 260; i++) {
    const lon = -180 + Math.random() * 360;
    const lat = -80 + Math.random() * 160;
    paintCrater(ctx, w, h, lon, lat, 0.55 + Math.random() * 2.4, 0.14 + Math.random() * 0.3);
  }
}

/** Fine grain micro-relief. */
function paintMoonGrain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  sprinkle(ctx, w, h, Math.floor(w * h * 0.025), "rgba(0,0,0,0.06)");
  sprinkle(ctx, w, h, Math.floor(w * h * 0.015), "rgba(255,255,255,0.05)");
}

/**
 * Equirectangular Moon albedo (simplified but recognizable).
 * Longitude 0° = center of the near side (tidally locked toward Earth).
 * Major maria placed at approximate selenographic coordinates.
 *
 * V2: stronger mare/highland and crater-rim contrast so low-sun landing
 * (waning gibbous) reads relief without a normal map.
 */
/** Base albedo + poles + far highlands. */
function paintMoonFoundation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  paintMoonBase(ctx, w, h);
  paintMoonPoles(ctx, w, h);
  paintMoonFarHighlands(ctx, w, h);
}

/** Maria, basins, major + random craters, rays, grain. */
function paintMoonDetail(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  paintAllMaria(ctx, w, h);
  paintMoonBasins(ctx, w, h);
  paintMajorCraters(ctx, w, h);
  paintTychoRays(ctx, w, h);
  paintRandomCraters(ctx, w, h);
  paintMoonGrain(ctx, w, h);
}

export function makeMoonTexture(size = 1024): HTMLCanvasElement {
  const { canvas, ctx, w, h } = makeEquirectCanvas(size);
  paintMoonFoundation(ctx, w, h);
  paintMoonDetail(ctx, w, h);
  return canvas;
}

/** Continuous mare→highland roughness from luminance. */
function moonRoughFromLum(lum: number): number {
  const t = Math.max(0, Math.min(1, (lum - 40) / 180));
  return Math.round(130 + t * 100);
}

function remapMoonRoughness(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
    const rough = moonRoughFromLum(lum);
    d[i] = rough;
    d[i + 1] = rough;
    d[i + 2] = rough;
    d[i + 3] = 255;
  }
}

/**
 * Roughness from moon albedo: continuous mare→highland gradient (V2).
 * Maria slightly smoother; bright highlands + rims rougher for low-sun glints.
 */
export function makeMoonRoughnessMap(albedo: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx, w, h } = cloneCanvas(albedo);
  ctx.drawImage(albedo, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  remapMoonRoughness(img.data);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Color stops for sun corona disc. */
function sunGlowStops(g: CanvasGradient): void {
  g.addColorStop(0, "rgba(255, 255, 250, 1)");
  g.addColorStop(0.08, "rgba(255, 244, 180, 0.95)");
  g.addColorStop(0.22, "rgba(255, 200, 80, 0.55)");
  g.addColorStop(0.45, "rgba(255, 140, 40, 0.18)");
  g.addColorStop(0.7, "rgba(255, 100, 20, 0.05)");
  g.addColorStop(1, "rgba(255, 80, 0, 0)");
}

/** Soft radial disc gradient for sun glow. */
function paintSunGlow(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size * 0.5;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  sunGlowStops(g);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** Soft radial disc for sun corona / lens-flare shine (additive sprites). */
export function makeSunGlowTexture(size = 256): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paintSunGlow(canvas.getContext("2d")!, size);
  return canvas;
}

/** One faint field star. */
function paintFieldStar(ctx: CanvasRenderingContext2D, size: number): void {
  const x = Math.random() * size;
  const y = Math.random() * size;
  const r = Math.random() < 0.92 ? 0.4 + Math.random() * 0.8 : 1.2 + Math.random() * 1.6;
  const a = 0.35 + Math.random() * 0.65;
  const hue = Math.random() < 0.85 ? 210 : Math.random() < 0.5 ? 40 : 0;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${hue}, 40%, ${70 + Math.random() * 30}%, ${a})`;
  ctx.fill();
}

function paintFieldStars(ctx: CanvasRenderingContext2D, size: number): void {
  for (let i = 0; i < 2500; i++) paintFieldStar(ctx, size);
}

/** One brighter star with soft halo. */
function paintBrightStar(ctx: CanvasRenderingContext2D, size: number): void {
  const x = Math.random() * size;
  const y = Math.random() * size;
  const g = ctx.createRadialGradient(x, y, 0, x, y, 3 + Math.random() * 4);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
}

function paintBrightStars(ctx: CanvasRenderingContext2D, size: number): void {
  for (let i = 0; i < 40; i++) paintBrightStar(ctx, size);
}

export function makeStarTexture(size = 1024): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#03050c";
  ctx.fillRect(0, 0, size, size);
  paintFieldStars(ctx, size);
  paintBrightStars(ctx, size);
  return canvas;
}

/** Major metro / corridor anchors: [lon, lat, intensity 0–1]. */
const NIGHT_CITIES: readonly (readonly [number, number, number])[] = [
  [-74.0, 40.7, 1.0],
  [-87.6, 41.9, 0.85],
  [-118.2, 34.0, 0.95],
  [-122.4, 37.8, 0.7],
  [-95.4, 29.8, 0.75],
  [-80.2, 25.8, 0.7],
  [-97.7, 30.3, 0.55],
  [-99.1, 19.4, 0.9],
  [-46.6, -23.5, 0.9],
  [-43.2, -22.9, 0.75],
  [-70.6, -33.4, 0.55],
  [-58.4, -34.6, 0.7],
  [-0.1, 51.5, 0.95],
  [2.3, 48.9, 0.9],
  [13.4, 52.5, 0.85],
  [12.5, 41.9, 0.7],
  [4.9, 52.4, 0.65],
  [-3.7, 40.4, 0.7],
  [37.6, 55.8, 0.9],
  [28.9, 41.0, 0.75],
  [31.2, 30.0, 0.8],
  [3.1, 36.8, 0.5],
  [18.4, -33.9, 0.55],
  [28.0, -26.2, 0.65],
  [55.3, 25.2, 0.7],
  [46.7, 24.7, 0.55],
  [77.2, 28.6, 0.95],
  [72.9, 19.1, 0.95],
  [88.4, 22.6, 0.75],
  [80.3, 13.1, 0.7],
  [100.5, 13.8, 0.75],
  [106.8, -6.2, 0.9],
  [103.8, 1.3, 0.7],
  [121.5, 31.2, 1.0],
  [116.4, 39.9, 0.95],
  [113.3, 23.1, 0.85],
  [114.2, 22.3, 0.85],
  [139.7, 35.7, 1.0],
  [135.5, 34.7, 0.8],
  [126.9, 37.6, 0.85],
  [121.0, 14.6, 0.7],
  [151.2, -33.9, 0.75],
  [144.9, -37.8, 0.7],
];

/** Warm core + halo + hot white for one city. */
function paintCityLights(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lon: number,
  lat: number,
  intensity: number,
): void {
  softBlob(ctx, w, h, lon, lat, 4 + intensity * 6, 2.5 + intensity * 3.5,
    `rgba(255, 210, 140, ${0.55 + intensity * 0.4})`);
  softBlob(ctx, w, h, lon, lat, 10 + intensity * 12, 6 + intensity * 8,
    `rgba(255, 160, 80, ${0.12 + intensity * 0.18})`);
  softBlob(ctx, w, h, lon, lat, 1.2 + intensity * 1.5, 0.8 + intensity,
    `rgba(255, 245, 220, ${0.7 + intensity * 0.25})`);
}

function paintAllCities(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (const [lon, lat, intensity] of NIGHT_CITIES) {
    paintCityLights(ctx, w, h, lon, lat, intensity);
  }
}

/** Scatter softBlob lights in a lon/lat box. */
function paintLightCorridor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: number,
  lon0: number,
  lonSpan: number,
  lat0: number,
  latSpan: number,
  rgb: string,
  a0: number,
  aSpan: number,
): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + Math.random() * aSpan;
    softBlob(ctx, w, h, lon0 + Math.random() * lonSpan, lat0 + Math.random() * latSpan,
      2 + Math.random() * 4, 1.2 + Math.random() * 2.5, `rgba(${rgb}, ${a})`);
  }
}

/** Regional night-light corridors. */
function paintLightCorridors(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  paintLightCorridor(ctx, w, h, 28, -90, 22, 30, 15, "255, 190, 110", 0.12, 0.2);
  paintLightCorridor(ctx, w, h, 22, -5, 25, 42, 12, "255, 200, 130", 0.1, 0.18);
  paintLightCorridor(ctx, w, h, 18, 72, 18, 18, 14, "255, 180, 100", 0.12, 0.2);
  paintLightCorridor(ctx, w, h, 24, 110, 30, 22, 20, "255, 195, 120", 0.12, 0.22);
}

/**
 * Equirectangular Earth night lights (emissive map).
 * Warm city glints over major metro clusters + sparse scatter on land bands.
 * Theater-grade — not census or VIIRS; black where empty so day side stays dark.
 */
export function makeEarthNightLightsTexture(size = 1024): HTMLCanvasElement {
  const { canvas, ctx, w, h } = makeEquirectCanvas(size);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  paintAllCities(ctx, w, h);
  paintLightCorridors(ctx, w, h);
  sprinkle(ctx, w, h, Math.floor(w * h * 0.0008), "rgba(255,200,120,0.35)");
  return canvas;
}

function sprinkle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: number,
  color: string,
): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
}

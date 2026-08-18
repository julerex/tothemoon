/**
 * Procedural Earth equirectangular albedo and roughness maps.
 */

import {
  cloneCanvas,
  fillContinent,
  makeEquirectCanvas,
  softBlob,
  sprinkle,
} from "./textureCanvas";

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

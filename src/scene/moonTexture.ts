/**
 * Procedural Moon equirectangular albedo and roughness maps.
 */

import {
  cloneCanvas,
  lonLatToXy,
  makeEquirectCanvas,
  softBlob,
  sprinkle,
} from "./textureCanvas";

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

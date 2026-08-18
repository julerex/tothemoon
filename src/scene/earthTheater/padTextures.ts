/** Canvas texture factories for Starbase pad decals, steam, and surrounds. */
import * as THREE from "three";

function paintPlateAlpha(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size);
  const fade = 0.08;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = Math.abs(x / (size - 1) - 0.5) * 2;
      const nz = Math.abs(y / (size - 1) - 0.5) * 2;
      const rim = Math.max(nx, nz);
      const a = rim <= 1 - fade ? 255 : Math.round(255 * (1 - rim) / fade);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function makePlateAlphaTexture(): THREE.CanvasTexture {
  const map = makeSizedCanvasTexture(256, paintPlateAlpha);
  map.colorSpace = THREE.NoColorSpace;
  return map;
}

function paintGroundBloom(ctx: CanvasRenderingContext2D, size: number): void {
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, "rgba(255, 200, 140, 0.9)");
  g.addColorStop(0.3, "rgba(255, 120, 60, 0.35)");
  g.addColorStop(0.65, "rgba(255, 80, 40, 0.08)");
  g.addColorStop(1, "rgba(255, 60, 30, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

export function makeGroundBloomSprite(): THREE.Sprite {
  const map = makeSizedCanvasTexture(64, paintGroundBloom);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  }));
}
function makeSizedCanvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext("2d")!, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function paintSteam(ctx: CanvasRenderingContext2D, size: number): void {
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, "rgba(230, 235, 240, 0.85)");
  g.addColorStop(0.4, "rgba(200, 210, 220, 0.35)");
  g.addColorStop(1, "rgba(180, 190, 200, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

export function makeSteamTexture(): THREE.CanvasTexture {
  return makeSizedCanvasTexture(64, paintSteam);
}

/**
 * Irregular radial scorch for OLM apron / trench floor / OLM top (visual V3).
 *
 * Theater-grade procedural map — fixed blotch positions so scrub/recreate is
 * stable. Not a photo texture; cheap and pipeline-free.
 */
const SCORCH_BLOTCHES: readonly (readonly [number, number, number, number])[] = [
  [0.35, 0.4, 0.14, 0.55], [0.62, 0.55, 0.12, 0.45], [0.48, 0.28, 0.1, 0.4],
  [0.55, 0.7, 0.11, 0.35], [0.28, 0.58, 0.09, 0.5], [0.7, 0.38, 0.1, 0.38],
];

function paintScorchBase(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const base = ctx.createRadialGradient(cx, cx, 4, cx, cx, size * 0.48);
  base.addColorStop(0, "rgba(18, 16, 14, 0.95)");
  base.addColorStop(0.35, "rgba(42, 36, 30, 0.75)");
  base.addColorStop(0.65, "rgba(70, 60, 48, 0.4)");
  base.addColorStop(1, "rgba(90, 80, 65, 0)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
}

function fillRadialDisc(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function paintScorchBlotch(
  ctx: CanvasRenderingContext2D, size: number, ux: number, uy: number, ur: number, a: number,
): void {
  fillRadialDisc(
    ctx, ux * size, uy * size, ur * size,
    `rgba(12, 10, 8, ${a})`, "rgba(20, 18, 14, 0)",
  );
}

function paintScorch(ctx: CanvasRenderingContext2D, size: number): void {
  paintScorchBase(ctx, size);
  for (const [ux, uy, ur, a] of SCORCH_BLOTCHES) paintScorchBlotch(ctx, size, ux, uy, ur, a);
}

export function makeScorchTexture(): THREE.CanvasTexture {
  return makeSizedCanvasTexture(128, paintScorch);
}

/** Soft coastal scrub blotches (fixed seeds — scrub-stable recreate). */
const SCRUB_TERRAIN_BLOTS: readonly (readonly [number, number, number, string])[] = [
  [0.32, 0.38, 0.28, "rgba(154, 138, 104, 0.95)"],
  [0.68, 0.28, 0.24, "rgba(122, 106, 78, 0.9)"],
  [0.28, 0.68, 0.26, "rgba(176, 160, 128, 0.88)"],
  [0.72, 0.62, 0.22, "rgba(154, 138, 104, 0.9)"],
  [0.5, 0.52, 0.3, "rgba(138, 122, 90, 0.75)"],
  [0.42, 0.22, 0.18, "rgba(122, 106, 78, 0.85)"],
  [0.78, 0.45, 0.2, "rgba(176, 160, 128, 0.8)"],
  [0.55, 0.78, 0.22, "rgba(122, 106, 78, 0.88)"],
];

function paintScrubTerrain(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = "#8a7a5c";
  ctx.fillRect(0, 0, size, size);
  for (const [ux, uy, ur, color] of SCRUB_TERRAIN_BLOTS) {
    const x = ux * size;
    const y = uy * size;
    const r = ur * size;
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(138, 122, 92, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function makeScrubTerrainTexture(): THREE.CanvasTexture {
  return makeSizedCanvasTexture(256, paintScrubTerrain);
}

/**
 * Soft green-gray water / deluge runoff stain for apron decals.
 * Used as a transparent map on thin ground planes around the OLM.
 */
function fillWaterBlob(
  ctx: CanvasRenderingContext2D, size: number,
  x0: number, y0: number, r0: number, x1: number, y1: number, r1: number,
  stops: [number, string][],
): void {
  const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function paintWaterStain(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  fillWaterBlob(ctx, size, 32, 28, 2, 32, 34, 28, [
    [0, "rgba(90, 110, 95, 0.7)"], [0.45, "rgba(70, 85, 75, 0.4)"], [1, "rgba(60, 70, 60, 0)"],
  ]);
  fillWaterBlob(ctx, size, 40, 40, 1, 38, 42, 18, [
    [0, "rgba(80, 95, 85, 0.45)"], [1, "rgba(60, 70, 60, 0)"],
  ]);
}

export function makeWaterStainTexture(): THREE.CanvasTexture {
  return makeSizedCanvasTexture(64, paintWaterStain);
}

/**
 * Soft additive shimmer for trench heat haze.
 * No real refraction — a warm gradient billboard as a theater cue only.
 */
function paintHeatHaze(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(32, 40, 2, 32, 28, 28);
  g.addColorStop(0, "rgba(255, 220, 180, 0.55)");
  g.addColorStop(0.4, "rgba(255, 180, 120, 0.2)");
  g.addColorStop(0.75, "rgba(255, 140, 80, 0.06)");
  g.addColorStop(1, "rgba(255, 100, 40, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

export function makeHeatHazeTexture(): THREE.CanvasTexture {
  return makeSizedCanvasTexture(64, paintHeatHaze);
}

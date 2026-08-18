/**
 * Stainless hull decal + oil-canning maps.
 */

import { oilCanHeight, stainlessHeatTint } from "./hexTileLayout";

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

/**
 * Shared canvas helpers for procedural equirectangular textures.
 */

/** Equirectangular map: x = lon (−180…180), y = lat (−90…90). */
export function lonLatToXy(
  lon: number,
  lat: number,
  w: number,
  h: number,
): [number, number] {
  const x = ((lon + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return [x, y];
}

export function fillContinent(
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
export function pathContinentRing(
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
export function softBlob(
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
export function fillSoftEllipse(
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
export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Create 2:1 equirectangular canvas + 2d context. */
export function makeEquirectCanvas(size: number): {
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

/** Same-size blank canvas as source. */
export function cloneCanvas(src: HTMLCanvasElement): {
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

export function sprinkle(
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

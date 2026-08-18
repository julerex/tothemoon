/**
 * Procedural sunlit ocean canvas maps for the splash plate.
 */

export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function paintSeaBase(
  ctx: CanvasRenderingContext2D,
  size: number,
  cx: number,
  cy: number,
  r: number,
): void {
  const g = ctx.createRadialGradient(cx, cy, r * 0.06, cx, cy, r);
  g.addColorStop(0, "rgba(78, 142, 168, 1)");
  g.addColorStop(0.22, "rgba(58, 122, 150, 0.98)");
  g.addColorStop(0.52, "rgba(42, 102, 132, 0.94)");
  g.addColorStop(0.78, "rgba(30, 78, 108, 0.58)");
  g.addColorStop(1, "rgba(18, 52, 76, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function paintSeaMottle(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
): void {
  ctx.globalCompositeOperation = "overlay";
  for (let i = 0; i < 56; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rx = (0.035 + rng() * 0.11) * size;
    const ry = rx * (0.35 + rng() * 0.5);
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    const light = rng() > 0.42;
    g.addColorStop(
      0,
      light ? "rgba(186, 224, 236, 0.42)" : "rgba(16, 44, 64, 0.4)",
    );
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintSwellBand(
  ctx: CanvasRenderingContext2D,
  size: number,
  band: number,
  i: number,
  n: number,
): void {
  const angle = 0.18 + band * 0.41;
  const y0 = ((i + 0.28) / n) * size;
  const light = (i + band) % 2 === 0;
  ctx.strokeStyle = light ? "rgba(228, 246, 255, 0.28)" : "rgba(22, 52, 72, 0.2)";
  ctx.lineWidth = size * (0.007 + band * 0.002);
  ctx.beginPath();
  ctx.moveTo(0, y0);
  for (let x = 0; x <= size; x += 6) {
    const wobble =
      Math.sin(x * 0.055 + i * 0.7 + band) * size * 0.012 +
      Math.sin(x * 0.13 + band * 2) * size * 0.005;
    const y = y0 + Math.sin(angle) * (x - size * 0.5) * 0.08 + wobble;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function paintSeaSwell(
  ctx: CanvasRenderingContext2D,
  size: number,
): void {
  ctx.globalCompositeOperation = "soft-light";
  for (let band = 0; band < 3; band++) {
    const n = 20 + band * 10;
    for (let i = 0; i < n; i++) paintSwellBand(ctx, size, band, i, n);
  }
}

function paintFoamFleck(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
): void {
  const x = rng() * size;
  const y = rng() * size;
  const len = (0.018 + rng() * 0.05) * size;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rng() - 0.5) * 0.8);
  ctx.strokeStyle = `rgba(236, 248, 255, ${0.12 + rng() * 0.18})`;
  ctx.lineWidth = 1 + rng() * 1.4;
  ctx.beginPath();
  ctx.moveTo(-len * 0.5, 0);
  ctx.quadraticCurveTo(0, (rng() - 0.5) * 3, len * 0.5, 0);
  ctx.stroke();
  ctx.restore();
}

function paintSeaFoam(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
): void {
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 90; i++) paintFoamFleck(ctx, size, rng);
}

function paintSeaEdgeFade(
  ctx: CanvasRenderingContext2D,
  size: number,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.globalCompositeOperation = "destination-in";
  const a = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  a.addColorStop(0, "rgba(0,0,0,1)");
  a.addColorStop(0.58, "rgba(0,0,0,0.94)");
  a.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
}

/** Sky-reflected morning sea with swell bands and foam flecks. */
export function paintSunlitOcean(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.5;
  const rng = makeRng(0x5ea1e55);
  paintSeaBase(ctx, size, cx, cy, r);
  paintSeaMottle(ctx, size, rng);
  paintSeaSwell(ctx, size);
  paintSeaFoam(ctx, size, rng);
  paintSeaEdgeFade(ctx, size, cx, cy, r);
}

function paintRipplePixel(
  data: Uint8ClampedArray,
  i: number,
  j: number,
  size: number,
): void {
  const u = i / size;
  const v = j / size;
  const twoPi = Math.PI * 2;
  const h =
    0.5 +
    0.22 * Math.sin(u * twoPi * 4) * Math.sin(v * twoPi * 3) +
    0.16 * Math.sin(u * twoPi * 7 + v * twoPi * 2) +
    0.1 * Math.sin(v * twoPi * 11 + u * twoPi);
  const k = (j * size + i) * 4;
  const g = Math.round(Math.max(0, Math.min(1, h)) * 255);
  data[k] = g;
  data[k + 1] = g;
  data[k + 2] = g;
  data[k + 3] = 255;
}

/** Seamless wavelet tile (integer cycles) for repeating near-field chop. */
export function paintRippleTile(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) paintRipplePixel(img.data, i, j, size);
  }
  ctx.putImageData(img, 0, 0);
}


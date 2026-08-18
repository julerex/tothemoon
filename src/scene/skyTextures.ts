/**
 * Procedural sun glow and star-field canvas textures.
 */

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

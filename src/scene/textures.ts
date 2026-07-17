/**
 * Procedural canvas textures — no external assets required.
 */

export function makeEarthTexture(size = 512): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Ocean base
  const ocean = ctx.createLinearGradient(0, 0, size, size);
  ocean.addColorStop(0, "#0a3d6e");
  ocean.addColorStop(0.5, "#0c4a7a");
  ocean.addColorStop(1, "#08355f");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, size, size);

  // Continents (soft blobs)
  const landColors = ["#2d6b3a", "#3a7d45", "#4a8c52", "#6b8f4a", "#8a9a5c"];
  seedBlobs(ctx, size, 28, landColors, 0.08, 0.22);

  // Ice caps
  ctx.fillStyle = "rgba(230, 240, 255, 0.85)";
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.06, size * 0.42, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.94, size * 0.4, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cloud wisps
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  seedBlobs(ctx, size, 18, ["rgba(255,255,255,0.2)"], 0.04, 0.14, true);

  // Subtle noise
  sprinkle(ctx, size, 4000, "rgba(255,255,255,0.04)");

  return canvas;
}

export function makeMoonTexture(size = 512): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#b0aaa0";
  ctx.fillRect(0, 0, size, size);

  // Mare (dark patches)
  seedBlobs(ctx, size, 16, ["#6e6a62", "#7a756c", "#5c584f"], 0.06, 0.2);

  // Highlands
  seedBlobs(ctx, size, 20, ["#c4bfb4", "#d0cbc0"], 0.03, 0.1);

  // Craters
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = (0.008 + Math.random() * 0.035) * size;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(40, 38, 35, ${0.15 + Math.random() * 0.25})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.85, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(220, 215, 205, ${0.15 + Math.random() * 0.2})`;
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.stroke();
  }

  sprinkle(ctx, size, 6000, "rgba(0,0,0,0.06)");
  return canvas;
}

/** Soft radial disc for sun corona / lens-flare shine (additive sprites). */
export function makeSunGlowTexture(size = 256): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size * 0.5;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, "rgba(255, 255, 250, 1)");
  g.addColorStop(0.08, "rgba(255, 244, 180, 0.95)");
  g.addColorStop(0.22, "rgba(255, 200, 80, 0.55)");
  g.addColorStop(0.45, "rgba(255, 140, 40, 0.18)");
  g.addColorStop(0.7, "rgba(255, 100, 20, 0.05)");
  g.addColorStop(1, "rgba(255, 80, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function makeStarTexture(size = 1024): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#03050c";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2500; i++) {
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

  // A few brighter stars
  for (let i = 0; i < 40; i++) {
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

  return canvas;
}

function seedBlobs(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  colors: string[],
  minR: number,
  maxR: number,
  soft = false,
): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = (minR + Math.random() * (maxR - minR)) * size;
    const color = colors[Math.floor(Math.random() * colors.length)]!;
    if (soft) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = color;
    }
    ctx.beginPath();
    // Irregular blob via multi-ellipse
    for (let k = 0; k < 3; k++) {
      const ox = (Math.random() - 0.5) * r * 0.6;
      const oy = (Math.random() - 0.5) * r * 0.6;
      ctx.ellipse(x + ox, y + oy, r * (0.5 + Math.random() * 0.5), r * (0.4 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function sprinkle(
  ctx: CanvasRenderingContext2D,
  size: number,
  n: number,
  color: string,
): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
}

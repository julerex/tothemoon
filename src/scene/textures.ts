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
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i]!;
    const [x, y] = lonLatToXy(lon, lat, w, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
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
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Blue-marble style equirectangular Earth (simplified continent outlines).
 * Poles at top/bottom; 0° lon at texture center-left seam (standard).
 */
export function makeEarthTexture(size = 1024): HTMLCanvasElement {
  const w = size;
  const h = Math.round(size / 2); // 2:1 equirectangular
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Deep ocean base with latitude darkening
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, "#1a4d7a");
  ocean.addColorStop(0.15, "#0c4a7c");
  ocean.addColorStop(0.5, "#0a3a68");
  ocean.addColorStop(0.85, "#0c4a7c");
  ocean.addColorStop(1, "#1a4d7a");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);

  // Subtle bathymetry / gyre variation
  for (let i = 0; i < 40; i++) {
    softBlob(
      ctx,
      w,
      h,
      -180 + Math.random() * 360,
      -50 + Math.random() * 100,
      25 + Math.random() * 40,
      12 + Math.random() * 20,
      `rgba(20, 90, 140, ${0.08 + Math.random() * 0.12})`,
    );
  }

  // --- Continents (lon, lat rings; coarse but recognizable) ---
  const land = "#2f7a3e";
  const landDry = "#8a9a4a";
  const landTundra = "#6b8f6a";
  const ice = "#e8f0fa";

  // Africa
  fillContinent(
    ctx,
    w,
    h,
    [
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
    ],
    land,
  );
  softBlob(ctx, w, h, 20, 20, 28, 14, "rgba(194, 164, 106, 0.75)"); // Sahara
  softBlob(ctx, w, h, 25, -5, 18, 12, "rgba(70, 130, 70, 0.35)");

  // Europe
  fillContinent(
    ctx,
    w,
    h,
    [
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
    ],
    landTundra,
  );

  // Asia
  fillContinent(
    ctx,
    w,
    h,
    [
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
    ],
    land,
  );
  softBlob(ctx, w, h, 90, 45, 40, 18, "rgba(60, 110, 55, 0.4)");
  softBlob(ctx, w, h, 55, 25, 22, 12, "rgba(194, 164, 106, 0.55)"); // Middle East / Central Asia dry
  softBlob(ctx, w, h, 105, 28, 18, 10, "rgba(180, 150, 90, 0.4)"); // Gobi-ish
  softBlob(ctx, w, h, 78, 22, 14, 10, "rgba(100, 90, 70, 0.35)"); // Himalaya shade

  // India
  fillContinent(
    ctx,
    w,
    h,
    [
      [68, 24],
      [72, 28],
      [78, 32],
      [88, 28],
      [88, 22],
      [82, 12],
      [78, 8],
      [72, 12],
      [70, 18],
    ],
    land,
  );

  // SE Asia / Indonesia hints
  softBlob(ctx, w, h, 115, 5, 20, 8, "rgba(47, 122, 62, 0.85)");
  softBlob(ctx, w, h, 125, -2, 18, 6, "rgba(47, 122, 62, 0.7)");
  softBlob(ctx, w, h, 140, -5, 12, 5, "rgba(47, 122, 62, 0.55)");

  // Australia
  fillContinent(
    ctx,
    w,
    h,
    [
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
    ],
    landDry,
  );
  softBlob(ctx, w, h, 132, -25, 16, 10, "rgba(194, 164, 106, 0.55)");

  // North America
  fillContinent(
    ctx,
    w,
    h,
    [
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
    ],
    land,
  );
  softBlob(ctx, w, h, -100, 50, 30, 14, "rgba(55, 120, 60, 0.45)");
  softBlob(ctx, w, h, -110, 40, 22, 12, "rgba(140, 150, 80, 0.4)"); // plains
  softBlob(ctx, w, h, -115, 38, 10, 16, "rgba(90, 90, 70, 0.35)"); // Rockies shade
  // Greenland
  fillContinent(
    ctx,
    w,
    h,
    [
      [-55, 60],
      [-45, 62],
      [-40, 70],
      [-45, 78],
      [-55, 80],
      [-65, 76],
      [-60, 68],
    ],
    ice,
  );
  // Mexico / Central America
  softBlob(ctx, w, h, -100, 20, 12, 8, "rgba(70, 130, 60, 0.8)");
  softBlob(ctx, w, h, -85, 12, 8, 6, "rgba(47, 122, 62, 0.7)");

  // South America
  fillContinent(
    ctx,
    w,
    h,
    [
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
    ],
    land,
  );
  softBlob(ctx, w, h, -60, -5, 18, 14, "rgba(30, 100, 45, 0.55)"); // Amazon
  softBlob(ctx, w, h, -68, -25, 10, 18, "rgba(90, 85, 60, 0.4)"); // Andes shade

  // Antarctica ice sheet
  ctx.fillStyle = ice;
  ctx.fillRect(0, h * 0.88, w, h * 0.12);
  // Soft edge
  const ant = ctx.createLinearGradient(0, h * 0.82, 0, h * 0.92);
  ant.addColorStop(0, "rgba(232, 240, 250, 0)");
  ant.addColorStop(1, "rgba(232, 240, 250, 1)");
  ctx.fillStyle = ant;
  ctx.fillRect(0, h * 0.82, w, h * 0.1);

  // Arctic fringe
  const arc = ctx.createLinearGradient(0, 0, 0, h * 0.12);
  arc.addColorStop(0, "rgba(220, 235, 250, 0.95)");
  arc.addColorStop(0.6, "rgba(180, 210, 230, 0.35)");
  arc.addColorStop(1, "rgba(180, 210, 230, 0)");
  ctx.fillStyle = arc;
  ctx.fillRect(0, 0, w, h * 0.12);

  // Specular-ish ocean glints (subtle brightening)
  for (let i = 0; i < 25; i++) {
    softBlob(
      ctx,
      w,
      h,
      -180 + Math.random() * 360,
      -40 + Math.random() * 80,
      8 + Math.random() * 20,
      4 + Math.random() * 10,
      "rgba(80, 160, 220, 0.08)",
    );
  }

  // Fine grain
  sprinkle(ctx, w, h, Math.floor(w * h * 0.015), "rgba(255,255,255,0.03)");
  sprinkle(ctx, w, h, Math.floor(w * h * 0.01), "rgba(0,0,0,0.04)");

  return canvas;
}

/**
 * Roughness map from an albedo canvas: oceans smoother, land/ice rougher.
 * Pass the same canvas used for the color map so features align.
 */
export function makeEarthRoughnessMap(albedo: HTMLCanvasElement): HTMLCanvasElement {
  const w = albedo.width;
  const h = albedo.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(albedo, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    const blueDom = b > r + 15 && b > g;
    const ice = r > 180 && g > 190 && b > 200;
    const rough = ice ? 200 : blueDom ? 55 : 175;
    d[i] = rough;
    d[i + 1] = rough;
    d[i + 2] = rough;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Thin white cloud layer (transparent background). */
export function makeEarthCloudTexture(size = 1024): HTMLCanvasElement {
  const w = size;
  const h = Math.round(size / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 90; i++) {
    const lon = -180 + Math.random() * 360;
    const lat = -55 + Math.random() * 110;
    const [x, y] = lonLatToXy(lon, lat, w, h);
    const rx = (0.04 + Math.random() * 0.12) * w;
    const ry = (0.015 + Math.random() * 0.05) * h;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    const a = 0.12 + Math.random() * 0.35;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (Math.random() - 0.5) * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ITCZ / band hints
  for (let i = 0; i < 8; i++) {
    const y = h * (0.42 + Math.random() * 0.16);
    const g = ctx.createLinearGradient(0, y - 8, 0, y + 8);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${0.08 + Math.random() * 0.1})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 10, w, 20);
  }

  return canvas;
}

/**
 * Equirectangular Moon albedo (simplified but recognizable).
 * Longitude 0° = center of the near side (tidally locked toward Earth).
 * Major maria placed at approximate selenographic coordinates.
 */
export function makeMoonTexture(size = 1024): HTMLCanvasElement {
  const w = size;
  const h = Math.round(size / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Highland base — far side slightly brighter
  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, "#b8b2a6"); // far side edge
  base.addColorStop(0.25, "#c4beb2");
  base.addColorStop(0.5, "#b5afa3"); // near-side center
  base.addColorStop(0.75, "#c4beb2");
  base.addColorStop(1, "#b8b2a6");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Latitude shading (poles a bit brighter / frost-hint)
  const poles = ctx.createLinearGradient(0, 0, 0, h);
  poles.addColorStop(0, "rgba(230, 228, 220, 0.22)");
  poles.addColorStop(0.12, "rgba(230, 228, 220, 0)");
  poles.addColorStop(0.88, "rgba(230, 228, 220, 0)");
  poles.addColorStop(1, "rgba(230, 228, 220, 0.22)");
  ctx.fillStyle = poles;
  ctx.fillRect(0, 0, w, h);

  // Far-side highland mottling (fewer maria)
  for (let i = 0; i < 50; i++) {
    const lon = Math.random() < 0.5 ? -180 + Math.random() * 70 : 110 + Math.random() * 70;
    softBlob(
      ctx,
      w,
      h,
      lon,
      -50 + Math.random() * 100,
      8 + Math.random() * 22,
      6 + Math.random() * 16,
      `rgba(${180 + Math.random() * 40}, ${175 + Math.random() * 35}, ${165 + Math.random() * 30}, 0.25)`,
    );
  }

  const mare = (lon: number, lat: number, rLon: number, rLat: number, alpha = 0.72) => {
    softBlob(ctx, w, h, lon, lat, rLon, rLat, `rgba(72, 68, 62, ${alpha})`);
    softBlob(ctx, w, h, lon, lat, rLon * 0.65, rLat * 0.65, `rgba(58, 55, 50, ${alpha * 0.55})`);
  };

  // --- Near-side maria (approx lon/lat) ---
  mare(-40, 18, 42, 28, 0.78); // Oceanus Procellarum
  mare(-16, 33, 22, 16, 0.8); // Mare Imbrium
  mare(18, 28, 14, 12, 0.75); // Mare Serenitatis
  mare(20, 8, 16, 12, 0.72); // Mare Tranquillitatis
  mare(50, -4, 14, 12, 0.7); // Mare Fecunditatis
  mare(35, -15, 10, 9, 0.68); // Mare Nectaris
  mare(59, 17, 11, 9, 0.74); // Mare Crisium
  mare(-15, -20, 14, 11, 0.7); // Mare Nubium
  mare(-38, -24, 11, 9, 0.68); // Mare Humorum
  mare(0, 56, 50, 8, 0.55); // Mare Frigoris (band)
  mare(-5, 15, 8, 6, 0.5); // Sinus Aestuum / Medii area
  mare(5, -5, 7, 5, 0.45); // Mare Vaporum-ish

  // Far-side spots
  mare(148, 27, 9, 7, 0.55); // Mare Moscoviense-ish
  mare(100, -20, 8, 6, 0.4);

  // Highlands brightening around Imbrium rim / south pole Aitken hint
  softBlob(ctx, w, h, -16, 20, 30, 22, "rgba(200, 195, 185, 0.12)");
  softBlob(ctx, w, h, 180, -50, 40, 25, "rgba(90, 85, 78, 0.2)"); // SPA basin darkening

  // Named-ish craters (rim + floor)
  const crater = (
    lon: number,
    lat: number,
    rDeg: number,
    deep = 0.35,
  ): void => {
    const [x, y] = lonLatToXy(lon, lat, w, h);
    const rx = (rDeg / 360) * w;
    const ry = (rDeg / 180) * h;
    // Floor
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(40, 38, 35, ${deep})`;
    ctx.fill();
    // Rim highlight
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.15, y - ry * 0.15, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(230, 225, 215, ${0.25 + deep * 0.4})`;
    ctx.lineWidth = Math.max(1, rx * 0.12);
    ctx.stroke();
  };

  crater(-20, 10, 4.5, 0.4); // Copernicus
  crater(-11, -43, 5.5, 0.45); // Tycho
  crater(-3, 34, 4, 0.35); // Aristillus area
  crater(22, -11, 3.5, 0.35); // Theophilus
  crater(-9, 13, 3.2, 0.3); // Eratosthenes
  crater(32, 2, 3, 0.28); // Plinius area
  crater(-60, -15, 3.5, 0.3);
  crater(100, 20, 4, 0.32); // far side
  crater(-140, -30, 5, 0.35);
  crater(160, 40, 3.5, 0.3);

  // Tycho ray system (simplified)
  {
    const [cx, cy] = lonLatToXy(-11, -43, w, h);
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = "#e8e4dc";
    ctx.lineWidth = Math.max(1, w * 0.002);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2;
      const len = (0.08 + (i % 3) * 0.04) * w;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.55);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Random smaller craters
  for (let i = 0; i < 220; i++) {
    const lon = -180 + Math.random() * 360;
    const lat = -80 + Math.random() * 160;
    crater(lon, lat, 0.6 + Math.random() * 2.2, 0.12 + Math.random() * 0.25);
  }

  // Fine grain
  sprinkle(ctx, w, h, Math.floor(w * h * 0.02), "rgba(0,0,0,0.05)");
  sprinkle(ctx, w, h, Math.floor(w * h * 0.012), "rgba(255,255,255,0.04)");

  return canvas;
}

/** Roughness from moon albedo: maria slightly smoother, highlands rougher. */
export function makeMoonRoughnessMap(albedo: HTMLCanvasElement): HTMLCanvasElement {
  const w = albedo.width;
  const h = albedo.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(albedo, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
    // Darker maria → slightly lower roughness; highlands high
    const rough = lum < 100 ? 150 : 210;
    d[i] = rough;
    d[i + 1] = rough;
    d[i + 2] = rough;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
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

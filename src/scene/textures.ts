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

/**
 * White cloud deck (transparent background).
 * Higher core/edge contrast for LEO limb readability (visual V2).
 */
export function makeEarthCloudTexture(size = 1024): HTMLCanvasElement {
  const w = size;
  const h = Math.round(size / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  // Soft cyclonic / cellular decks — denser cores, sharp fade (LEO contrast)
  for (let i = 0; i < 110; i++) {
    const lon = -180 + Math.random() * 360;
    const lat = -55 + Math.random() * 110;
    const [x, y] = lonLatToXy(lon, lat, w, h);
    const rx = (0.035 + Math.random() * 0.13) * w;
    const ry = (0.012 + Math.random() * 0.055) * h;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    const a = 0.22 + Math.random() * 0.55;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.35, `rgba(248,250,255,${a * 0.7})`);
    g.addColorStop(0.7, `rgba(255,255,255,${a * 0.28})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (Math.random() - 0.5) * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Brighter cloud tops (sun-catching highlights for LEO)
  for (let i = 0; i < 35; i++) {
    const lon = -180 + Math.random() * 360;
    const lat = -40 + Math.random() * 80;
    softBlob(
      ctx,
      w,
      h,
      lon,
      lat,
      3 + Math.random() * 10,
      1.5 + Math.random() * 5,
      `rgba(255,255,255,${0.15 + Math.random() * 0.25})`,
    );
  }

  // ITCZ / band hints — slightly stronger so equatorial LEO reads structure
  for (let i = 0; i < 10; i++) {
    const y = h * (0.42 + Math.random() * 0.16);
    const g = ctx.createLinearGradient(0, y - 10, 0, y + 10);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${0.12 + Math.random() * 0.14})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 12, w, 24);
  }

  return canvas;
}

/**
 * Equirectangular Moon albedo (simplified but recognizable).
 * Longitude 0° = center of the near side (tidally locked toward Earth).
 * Major maria placed at approximate selenographic coordinates.
 *
 * V2: stronger mare/highland and crater-rim contrast so low-sun landing
 * (waning gibbous) reads relief without a normal map.
 */
export function makeMoonTexture(size = 1024): HTMLCanvasElement {
  const w = size;
  const h = Math.round(size / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Highland base — far side slightly brighter; overall lift for low-sun read
  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, "#c2bbb0"); // far side edge
  base.addColorStop(0.25, "#d0c9bc");
  base.addColorStop(0.5, "#c4bdb0"); // near-side center
  base.addColorStop(0.75, "#d0c9bc");
  base.addColorStop(1, "#c2bbb0");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Latitude shading (poles a bit brighter / frost-hint)
  const poles = ctx.createLinearGradient(0, 0, 0, h);
  poles.addColorStop(0, "rgba(238, 234, 225, 0.28)");
  poles.addColorStop(0.12, "rgba(230, 228, 220, 0)");
  poles.addColorStop(0.88, "rgba(230, 228, 220, 0)");
  poles.addColorStop(1, "rgba(238, 234, 225, 0.28)");
  ctx.fillStyle = poles;
  ctx.fillRect(0, 0, w, h);

  // Far-side highland mottling (fewer maria) — brighter for contrast
  for (let i = 0; i < 55; i++) {
    const lon = Math.random() < 0.5 ? -180 + Math.random() * 70 : 110 + Math.random() * 70;
    softBlob(
      ctx,
      w,
      h,
      lon,
      -50 + Math.random() * 100,
      8 + Math.random() * 22,
      6 + Math.random() * 16,
      `rgba(${195 + Math.random() * 40}, ${190 + Math.random() * 35}, ${178 + Math.random() * 30}, 0.32)`,
    );
  }

  const mare = (lon: number, lat: number, rLon: number, rLat: number, alpha = 0.78) => {
    // Deeper floors so maria punch under low sun
    softBlob(ctx, w, h, lon, lat, rLon, rLat, `rgba(52, 48, 44, ${alpha})`);
    softBlob(ctx, w, h, lon, lat, rLon * 0.7, rLat * 0.7, `rgba(38, 36, 32, ${alpha * 0.6})`);
    // Soft rim brightening (scarp / highland contact)
    softBlob(
      ctx,
      w,
      h,
      lon,
      lat + rLat * 0.15,
      rLon * 1.05,
      rLat * 0.35,
      "rgba(210, 205, 195, 0.08)",
    );
  };

  // --- Near-side maria (approx lon/lat) — deeper alpha for low-sun ---
  mare(-40, 18, 42, 28, 0.85); // Oceanus Procellarum
  mare(-16, 33, 22, 16, 0.88); // Mare Imbrium
  mare(18, 28, 14, 12, 0.82); // Mare Serenitatis
  mare(20, 8, 16, 12, 0.8); // Mare Tranquillitatis
  mare(50, -4, 14, 12, 0.78); // Mare Fecunditatis
  mare(35, -15, 10, 9, 0.76); // Mare Nectaris
  mare(59, 17, 11, 9, 0.82); // Mare Crisium
  mare(-15, -20, 14, 11, 0.78); // Mare Nubium
  mare(-38, -24, 11, 9, 0.76); // Mare Humorum
  mare(0, 56, 50, 8, 0.62); // Mare Frigoris (band)
  mare(-5, 15, 8, 6, 0.58); // Sinus Aestuum / Medii area
  mare(5, -5, 7, 5, 0.52); // Mare Vaporum-ish

  // Far-side spots
  mare(148, 27, 9, 7, 0.62); // Mare Moscoviense-ish
  mare(100, -20, 8, 6, 0.48);

  // Highlands brightening around Imbrium rim / south pole Aitken hint
  softBlob(ctx, w, h, -16, 20, 30, 22, "rgba(220, 215, 200, 0.2)");
  softBlob(ctx, w, h, 180, -50, 40, 25, "rgba(70, 65, 58, 0.28)"); // SPA basin darkening
  // South polar highland / Malapert approach contrast
  softBlob(ctx, w, h, 0, -82, 35, 10, "rgba(225, 220, 210, 0.18)");
  softBlob(ctx, w, h, 20, -78, 12, 6, "rgba(90, 85, 78, 0.15)");

  // Named-ish craters (rim + floor) — stronger rims for low-sun relief
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
    ctx.fillStyle = `rgba(32, 30, 28, ${deep})`;
    ctx.fill();
    // Shadow crescent (baked low-sun cue — sun from +X in texture space-ish)
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.2, y + ry * 0.1, rx * 0.7, ry * 0.75, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(18, 16, 14, ${deep * 0.45})`;
    ctx.fill();
    // Rim highlight (sunward)
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.2, y - ry * 0.18, rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(240, 235, 220, ${0.35 + deep * 0.45})`;
    ctx.lineWidth = Math.max(1.2, rx * 0.16);
    ctx.stroke();
    // Outer ejecta brightening
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 1.35, ry * 1.35, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(225, 218, 205, ${0.08 + deep * 0.12})`;
    ctx.lineWidth = Math.max(1, rx * 0.08);
    ctx.stroke();
  };

  crater(-20, 10, 4.5, 0.48); // Copernicus
  crater(-11, -43, 5.5, 0.52); // Tycho
  crater(-3, 34, 4, 0.42); // Aristillus area
  crater(22, -11, 3.5, 0.42); // Theophilus
  crater(-9, 13, 3.2, 0.38); // Eratosthenes
  crater(32, 2, 3, 0.35); // Plinius area
  crater(-60, -15, 3.5, 0.36);
  crater(100, 20, 4, 0.38); // far side
  crater(-140, -30, 5, 0.42);
  crater(160, 40, 3.5, 0.36);
  // Near-south landmarks for landing theater
  crater(0, -70, 3.2, 0.4);
  crater(15, -75, 2.5, 0.35);

  // Tycho ray system (simplified) — slightly stronger for low-sun
  {
    const [cx, cy] = lonLatToXy(-11, -43, w, h);
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#efe9df";
    ctx.lineWidth = Math.max(1, w * 0.0022);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const len = (0.09 + (i % 3) * 0.045) * w;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.55);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Random smaller craters
  for (let i = 0; i < 260; i++) {
    const lon = -180 + Math.random() * 360;
    const lat = -80 + Math.random() * 160;
    crater(lon, lat, 0.55 + Math.random() * 2.4, 0.14 + Math.random() * 0.3);
  }

  // Fine grain (micro-relief)
  sprinkle(ctx, w, h, Math.floor(w * h * 0.025), "rgba(0,0,0,0.06)");
  sprinkle(ctx, w, h, Math.floor(w * h * 0.015), "rgba(255,255,255,0.05)");

  return canvas;
}

/**
 * Roughness from moon albedo: continuous mare→highland gradient (V2).
 * Maria slightly smoother; bright highlands + rims rougher for low-sun glints.
 */
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
    // Continuous: dark maria ~130, mid ~180, bright highlands/rims ~230
    const t = Math.max(0, Math.min(1, (lum - 40) / 180));
    const rough = Math.round(130 + t * 100);
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

/**
 * Equirectangular Earth night lights (emissive map).
 * Warm city glints over major metro clusters + sparse scatter on land bands.
 * Theater-grade — not census or VIIRS; black where empty so day side stays dark.
 */
export function makeEarthNightLightsTexture(size = 1024): HTMLCanvasElement {
  const w = size;
  const h = Math.round(size / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  // Major metro / corridor anchors: [lon, lat, intensity 0–1]
  const cities: readonly (readonly [number, number, number])[] = [
    // Americas
    [-74.0, 40.7, 1.0], // NYC
    [-87.6, 41.9, 0.85], // Chicago
    [-118.2, 34.0, 0.95], // LA
    [-122.4, 37.8, 0.7], // SF Bay
    [-95.4, 29.8, 0.75], // Houston / Gulf
    [-80.2, 25.8, 0.7], // Miami
    [-97.7, 30.3, 0.55], // Austin / Texas corridor
    [-99.1, 19.4, 0.9], // Mexico City
    [-46.6, -23.5, 0.9], // São Paulo
    [-43.2, -22.9, 0.75], // Rio
    [-70.6, -33.4, 0.55], // Santiago
    [-58.4, -34.6, 0.7], // Buenos Aires
    // Europe
    [-0.1, 51.5, 0.95], // London
    [2.3, 48.9, 0.9], // Paris
    [13.4, 52.5, 0.85], // Berlin
    [12.5, 41.9, 0.7], // Rome
    [4.9, 52.4, 0.65], // Amsterdam
    [-3.7, 40.4, 0.7], // Madrid
    [37.6, 55.8, 0.9], // Moscow
    [28.9, 41.0, 0.75], // Istanbul
    // Africa / Middle East
    [31.2, 30.0, 0.8], // Cairo
    [3.1, 36.8, 0.5], // Algiers
    [18.4, -33.9, 0.55], // Cape Town
    [28.0, -26.2, 0.65], // Johannesburg
    [55.3, 25.2, 0.7], // Dubai
    [46.7, 24.7, 0.55], // Riyadh
    // Asia
    [77.2, 28.6, 0.95], // Delhi
    [72.9, 19.1, 0.95], // Mumbai
    [88.4, 22.6, 0.75], // Kolkata
    [80.3, 13.1, 0.7], // Chennai
    [100.5, 13.8, 0.75], // Bangkok
    [106.8, -6.2, 0.9], // Jakarta
    [103.8, 1.3, 0.7], // Singapore
    [121.5, 31.2, 1.0], // Shanghai
    [116.4, 39.9, 0.95], // Beijing
    [113.3, 23.1, 0.85], // Guangzhou
    [114.2, 22.3, 0.85], // Hong Kong
    [139.7, 35.7, 1.0], // Tokyo
    [135.5, 34.7, 0.8], // Osaka
    [126.9, 37.6, 0.85], // Seoul
    [121.0, 14.6, 0.7], // Manila
    // Oceania
    [151.2, -33.9, 0.75], // Sydney
    [144.9, -37.8, 0.7], // Melbourne
  ];

  for (const [lon, lat, intensity] of cities) {
    // Core warm glow
    softBlob(
      ctx,
      w,
      h,
      lon,
      lat,
      4 + intensity * 6,
      2.5 + intensity * 3.5,
      `rgba(255, 210, 140, ${0.55 + intensity * 0.4})`,
    );
    // Wider dim halo
    softBlob(
      ctx,
      w,
      h,
      lon,
      lat,
      10 + intensity * 12,
      6 + intensity * 8,
      `rgba(255, 160, 80, ${0.12 + intensity * 0.18})`,
    );
    // Hot white core
    softBlob(
      ctx,
      w,
      h,
      lon,
      lat,
      1.2 + intensity * 1.5,
      0.8 + intensity,
      `rgba(255, 245, 220, ${0.7 + intensity * 0.25})`,
    );
  }

  // US East Coast / Midwest corridor scatter
  for (let i = 0; i < 28; i++) {
    softBlob(
      ctx,
      w,
      h,
      -90 + Math.random() * 22,
      30 + Math.random() * 15,
      2 + Math.random() * 4,
      1.2 + Math.random() * 2.5,
      `rgba(255, 190, 110, ${0.12 + Math.random() * 0.2})`,
    );
  }
  // Western Europe band
  for (let i = 0; i < 22; i++) {
    softBlob(
      ctx,
      w,
      h,
      -5 + Math.random() * 25,
      42 + Math.random() * 12,
      2 + Math.random() * 3.5,
      1.2 + Math.random() * 2,
      `rgba(255, 200, 130, ${0.1 + Math.random() * 0.18})`,
    );
  }
  // India / Indo-Gangetic
  for (let i = 0; i < 18; i++) {
    softBlob(
      ctx,
      w,
      h,
      72 + Math.random() * 18,
      18 + Math.random() * 14,
      2 + Math.random() * 4,
      1.5 + Math.random() * 2.5,
      `rgba(255, 180, 100, ${0.12 + Math.random() * 0.2})`,
    );
  }
  // East Asia coastal
  for (let i = 0; i < 24; i++) {
    softBlob(
      ctx,
      w,
      h,
      110 + Math.random() * 30,
      22 + Math.random() * 20,
      2 + Math.random() * 4,
      1.5 + Math.random() * 2.5,
      `rgba(255, 195, 120, ${0.12 + Math.random() * 0.22})`,
    );
  }

  // Sparse fine glints (ships / towns) — keep rare so oceans stay black
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

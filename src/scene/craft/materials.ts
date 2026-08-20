import * as THREE from "three";
import {
  HEX_TILE_MAP_SIZE,
  paintHexTileMaps,
  paintStainlessPhotoreal,
} from "../craftHullMaps";

/**
 * Super Heavy barrel stainless. MeshStandard (no anisotropy) so longitudinal
 * chines and the cylinder limb do not bloom into white ridges.
 */
export const BOOSTER_STEEL = {
  color: 0xc8ccd2,
  metalness: 0.62,
  roughness: 0.52,
  bumpScale: 0.32,
} as const;

export type CraftMats = {
  steel: THREE.MeshPhysicalMaterial;
  steelBright: THREE.MeshPhysicalMaterial;
  steelBooster: THREE.MeshStandardMaterial;
  steelDark: THREE.MeshStandardMaterial;
  steelMatte: THREE.MeshStandardMaterial;
  weldMat: THREE.MeshStandardMaterial;
  tile: THREE.MeshStandardMaterial;
  tileEdge: THREE.MeshStandardMaterial;
  tileWear: THREE.MeshStandardMaterial;
  engine: THREE.MeshStandardMaterial;
  engineRim: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  finFrame: THREE.MeshStandardMaterial;
  finLattice: THREE.MeshStandardMaterial;
};

/** Physical stainless body with anisotropy + oil-canning bump. */
function makeSteelPhysical(
  color: number,
  stainless: {
    color: THREE.CanvasTexture;
    roughness: THREE.CanvasTexture;
    bump: THREE.CanvasTexture;
  },
  metalness: number,
  roughness: number,
  anisotropy: number,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    map: stainless.color,
    roughnessMap: stainless.roughness,
    bumpMap: stainless.bump,
    bumpScale: 0.72,
    metalness,
    roughness,
    anisotropy,
    anisotropyRotation: 0,
  });
}

/** Standard metal material helper. */
function makeMetalStd(
  color: number,
  metalness: number,
  roughness: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

/** Mapped tile material (optional V13 roughness / bump / grout emissive). */
function makeTileMat(
  map: THREE.CanvasTexture,
  metalness: number,
  roughness: number,
  extras?: {
    roughnessMap?: THREE.CanvasTexture;
    bumpMap?: THREE.CanvasTexture;
    emissiveMap?: THREE.CanvasTexture;
  },
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    metalness,
    roughness,
    roughnessMap: extras?.roughnessMap,
    bumpMap: extras?.bumpMap,
    bumpScale: extras?.bumpMap ? 0.38 : 0,
    emissiveMap: extras?.emissiveMap,
    emissive: extras?.emissiveMap ? 0xffffff : 0x000000,
    emissiveIntensity: 0,
  });
}

/** Tile / wear materials from heat-shield maps. */
function makeTileMats(): Pick<CraftMats, "tile" | "tileEdge" | "tileWear"> {
  const hex = makeHeatTileMaps();
  return {
    tile: makeTileMat(hex.color, 0.08, 0.86, {
      roughnessMap: hex.rough,
      bumpMap: hex.bump,
      emissiveMap: hex.emissive,
    }),
    tileEdge: makeMetalStd(0x1a1c20, 0.18, 0.82),
    tileWear: makeTileMat(makeHeatTileEdgeWearTexture(), 0.14, 0.78),
  };
}

/** Engine, accent, fin materials. */
function makeDetailMats(): Pick<
  CraftMats,
  "engine" | "engineRim" | "accent" | "finFrame" | "finLattice"
> {
  return {
    engine: makeMetalStd(0x3e3a36, 0.7, 0.4),
    engineRim: makeMetalStd(0x5a5650, 0.78, 0.32),
    accent: makeMetalStd(0x3a424c, 0.58, 0.42),
    finFrame: makeMetalStd(0x1c2026, 0.55, 0.48),
    finLattice: makeMetalStd(0x5a646e, 0.7, 0.38),
  };
}

/** Stainless body + dark/matte/weld metals. */
function makeSteelFamily(stainless: {
  color: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}): Pick<
  CraftMats,
  "steel" | "steelBright" | "steelBooster" | "steelDark" | "steelMatte" | "weldMat"
> {
  const steelBooster = new THREE.MeshStandardMaterial({
    color: BOOSTER_STEEL.color,
    map: stainless.color,
    roughnessMap: stainless.roughness,
    bumpMap: stainless.bump,
    bumpScale: BOOSTER_STEEL.bumpScale,
    metalness: BOOSTER_STEEL.metalness,
    roughness: BOOSTER_STEEL.roughness,
  });
  return {
    steel: makeSteelPhysical(0xd0d4d8, stainless, 0.93, 0.22, 0.86),
    steelBright: makeSteelPhysical(0xe0e6ea, stainless, 0.95, 0.16, 0.90),
    steelBooster,
    steelDark: makeMetalStd(0x6a7078, 0.78, 0.4),
    steelMatte: makeMetalStd(0x9aa0a8, 0.68, 0.42),
    weldMat: makeMetalStd(0xb8c0c8, 0.95, 0.16),
  };
}

/** All craft materials (stainless maps shared). */
export function makeCraftMaterials(): CraftMats {
  return {
    ...makeSteelFamily(makeStainlessMaps(512)),
    ...makeTileMats(),
    ...makeDetailMats(),
  };
}

/** Fill base steel color + roughness canvases. */
function fillStainlessBase(
  cctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  cctx.fillStyle = "#c4c8cc";
  cctx.fillRect(0, 0, w, h);
  rctx.fillStyle = "#6a6a6a";
  rctx.fillRect(0, 0, w, h);
}

/** Circumferential brush streaks. */
function paintStainlessBrush(
  cctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  for (let y = 0; y < h; y++) {
    const n = ((y * 17 + 31) % 13) - 6;
    const lum = 188 + n * 2;
    cctx.fillStyle = `rgb(${lum},${lum + 2},${lum + 4})`;
    cctx.fillRect(0, y, w, 1);
    const rough = 95 + ((y * 13) % 40);
    rctx.fillStyle = `rgb(${rough},${rough},${rough})`;
    rctx.fillRect(0, y, w, 1);
  }
}

function paintStainlessGrain(cctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < w * h * 0.04; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    cctx.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`;
    cctx.fillRect(x, y, 1, 1);
  }
}

function paintOneWeldBand(
  cctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fy: number,
): void {
  const y = fy * h;
  const band = Math.max(2, h * 0.012);
  paintWeldColorBand(cctx, w, y, band);
  paintWeldRoughBand(rctx, w, y, band);
}

function paintWeldColorBand(
  cctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  band: number,
): void {
  const g = cctx.createLinearGradient(0, y - band, 0, y + band);
  g.addColorStop(0, "rgba(180,185,190,0)");
  g.addColorStop(0.35, "rgba(210,216,222,0.55)");
  g.addColorStop(0.5, "rgba(230,236,240,0.75)");
  g.addColorStop(0.65, "rgba(210,216,222,0.55)");
  g.addColorStop(1, "rgba(180,185,190,0)");
  cctx.fillStyle = g;
  cctx.fillRect(0, y - band, w, band * 2);
}

function paintWeldRoughBand(
  rctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  band: number,
): void {
  rctx.fillStyle = "#a8a8a8";
  rctx.fillRect(0, y - band * 1.4, w, band * 0.5);
  rctx.fillStyle = "#404040";
  rctx.fillRect(0, y - band * 0.35, w, band * 0.7);
  rctx.fillStyle = "#a8a8a8";
  rctx.fillRect(0, y + band * 0.9, w, band * 0.5);
}

function paintStainlessWelds(
  cctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  for (const fy of [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92]) {
    paintOneWeldBand(cctx, rctx, w, h, fy);
  }
}

function paintStainlessChines(
  cctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  for (const fx of [0.12, 0.37, 0.62, 0.87]) {
    const x = fx * w;
    cctx.fillStyle = "rgba(255,255,255,0.03)";
    cctx.fillRect(x - 1, 0, 2, h);
    cctx.fillStyle = "rgba(0,0,0,0.05)";
    cctx.fillRect(x + 2, 0, 1, h);
    rctx.fillStyle = "#c0c0c0";
    rctx.fillRect(x - 2, 0, 5, h);
  }
}

export function finishCanvasTexture(
  canvas: HTMLCanvasElement,
  srgb: boolean,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = srgb ? 8 : 4;
  return tex;
}

/**
 * Procedural stainless maps for cylinder UV (U = circumference, V = height).
 * Circumferential brush streaks, weld bands, oil-canning bump, and heat tint
 * for fin-cam close-ups (V13).
 */
export function makeSizedCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function stainlessTextures(
  colorCanvas: HTMLCanvasElement,
  roughCanvas: HTMLCanvasElement,
): { color: THREE.CanvasTexture; roughness: THREE.CanvasTexture } {
  return {
    color: finishCanvasTexture(colorCanvas, true),
    roughness: finishCanvasTexture(roughCanvas, false),
  };
}

function makeStainlessMaps(size = 512): {
  color: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const colorCanvas = makeSizedCanvas(size, size);
  const roughCanvas = makeSizedCanvas(size, size);
  const bumpCanvas = makeSizedCanvas(size, size);
  paintStainlessMaps(colorCanvas, roughCanvas, bumpCanvas, size, size);
  return {
    ...stainlessTextures(colorCanvas, roughCanvas),
    bump: finishCanvasTexture(bumpCanvas, false),
  };
}

function paintStainlessMaps(
  colorCanvas: HTMLCanvasElement,
  roughCanvas: HTMLCanvasElement,
  bumpCanvas: HTMLCanvasElement,
  w: number,
  h: number,
): void {
  const cctx = colorCanvas.getContext("2d")!;
  const rctx = roughCanvas.getContext("2d")!;
  const bctx = bumpCanvas.getContext("2d")!;
  fillStainlessBase(cctx, rctx, w, h);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, w, h);
  paintStainlessBrush(cctx, rctx, w, h);
  paintStainlessGrain(cctx, w, h);
  paintStainlessWelds(cctx, rctx, w, h);
  paintStainlessChines(cctx, rctx, w, h);
  paintStainlessPhotoreal(cctx, rctx, bctx, w, h);
}

function makeHeatTileMaps(): {
  color: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
} {
  const { w, h } = HEX_TILE_MAP_SIZE;
  const color = makeSizedCanvas(w, h);
  const rough = makeSizedCanvas(w, h);
  const bump = makeSizedCanvas(w, h);
  const emissive = makeSizedCanvas(w, h);
  paintHexTileMaps({ color, rough, bump, emissive });
  return {
    color: finishHeatMap(color, true),
    rough: finishHeatMap(rough, false),
    bump: finishHeatMap(bump, false),
    emissive: finishHeatMap(emissive, true),
  };
}

function finishHeatMap(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  if (srgb) map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return map;
}

function paintEdgeWearBase(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, "#1a1410");
  base.addColorStop(0.35, "#3a3228");
  base.addColorStop(0.55, "#5a5040");
  base.addColorStop(0.75, "#2a2620");
  base.addColorStop(1, "#12141a");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
}

function paintEdgeWearStreaks(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    const a = 0.08 + Math.random() * 0.2;
    ctx.fillStyle =
      Math.random() < 0.4 ? `rgba(180,160,120,${a})` : `rgba(20,18,16,${a + 0.1})`;
    ctx.fillRect(x, 0, 1 + Math.random() * 2, h);
  }
}

function paintEdgeWearChips(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < 12; i++) {
    const y = (i / 12) * h + Math.random() * 8;
    ctx.fillStyle = i % 3 === 0 ? "#b8bcc4" : "#2c2824";
    ctx.fillRect(w * 0.25, y, w * 0.5, 3 + Math.random() * 4);
  }
}

/**
 * Narrow edge-wear strip texture (ablated / soot streak) for windward trims.
 */
function makeHeatTileEdgeWearTexture(): THREE.CanvasTexture {
  const canvas = makeSizedCanvas(64, 256);
  const ctx = canvas.getContext("2d")!;
  paintEdgeWearBase(ctx, 64, 256);
  paintEdgeWearStreaks(ctx, 64, 256);
  paintEdgeWearChips(ctx, 64, 256);
  return finishHeatMap(canvas);
}

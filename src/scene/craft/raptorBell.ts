/**
 * Raptor 3 bell mesh (theater-grade).
 *
 * Flight 13 engines-cam stills (T+4:32, T+5:50) show longitudinal cooling-
 * channel fluting, a dark powerhead can, and a sooted interior — not a
 * smooth open cylinder. Shared maps so 33 booster bells stay cheap.
 *
 * @see docs/VISUAL_REALISM.md — V22
 * @see assets/flight13-webcast/ — T+4:32–5:50 stills
 */

import * as THREE from "three";

/** Longitudinal regenerative-cooling ridges around the bell. */
export const RAPTOR_FLUTE_COUNT = 24;

const FLUTE_MAP_W = 256;
const FLUTE_MAP_H = 128;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

/**
 * Ridge height in [0, 1] from CylinderGeometry U (circumference).
 * Sharper peaks than a plain sine so engines-cam lighting catches the flutes.
 */
export function raptorFluteHeight(u: number): number {
  const t = ((u % 1) + 1) % 1;
  const wave = Math.abs(Math.sin(t * Math.PI * RAPTOR_FLUTE_COUNT));
  return wave * wave;
}

/**
 * Soot amount toward the nozzle exit. CylinderGeometry V=0 is the bottom
 * (−Y); craft `rotX = π/2` puts that at −Z (aft / exit).
 */
export function raptorBellSoot(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const t = 1 - clamp01(v);
  return t * t * 0.55;
}

/** Gunmetal albedo for one texel (fluting + exit soot + faint heat). */
export function raptorBellRgb(u: number, v: number): {
  r: number; g: number; b: number;
} {
  const flute = raptorFluteHeight(u);
  const soot = raptorBellSoot(v);
  const heat = (1 - clamp01(v)) * 18;
  const lift = flute * 48;
  const dim = 1 - soot;
  return {
    r: Math.round((62 + lift + heat) * dim),
    g: Math.round((58 + lift * 0.92 + heat * 0.35) * dim),
    b: Math.round((52 + lift * 0.82) * dim),
  };
}

/** Bump 0–255: ridges high, sooted exit slightly flattened. */
export function raptorBellBump(u: number, v: number): number {
  const flute = raptorFluteHeight(u);
  const soot = raptorBellSoot(v);
  return Math.round(118 + flute * 92 - soot * 24);
}

/**
 * Paint shared color + bump maps. Deterministic — no `Math.random`.
 */
export function paintRaptorFluting(
  color: CanvasRenderingContext2D,
  bump: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const cImg = color.createImageData(w, h);
  const bImg = bump.createImageData(w, h);
  const cd = cImg.data;
  const bd = bImg.data;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const rgb = raptorBellRgb(u, v);
      const i = (y * w + x) * 4;
      cd[i] = rgb.r;
      cd[i + 1] = rgb.g;
      cd[i + 2] = rgb.b;
      cd[i + 3] = 255;
      const bh = raptorBellBump(u, v);
      bd[i] = bh;
      bd[i + 1] = bh;
      bd[i + 2] = bh;
      bd[i + 3] = 255;
    }
  }
  color.putImageData(cImg, 0, 0);
  bump.putImageData(bImg, 0, 0);
  paintExitLip(color, w, h);
}

/** Darker machine band at the exit lip (V ≈ 0). */
function paintExitLip(
  color: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const band = Math.max(2, Math.round(h * 0.06));
  color.fillStyle = "rgba(20, 18, 16, 0.35)";
  color.fillRect(0, 0, w, band);
}

type RaptorMats = {
  body: THREE.MeshStandardMaterial;
  rim: THREE.MeshStandardMaterial;
  inner: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
};

let cachedMats: RaptorMats | null = null;

function finishMap(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function raptorMats(): RaptorMats {
  if (cachedMats) return cachedMats;
  const color = makeCanvas(FLUTE_MAP_W, FLUTE_MAP_H);
  const bump = makeCanvas(FLUTE_MAP_W, FLUTE_MAP_H);
  paintRaptorFluting(color.getContext("2d")!, bump.getContext("2d")!, FLUTE_MAP_W, FLUTE_MAP_H);
  const colorMap = finishMap(color, true);
  const bumpMap = finishMap(bump, false);
  cachedMats = {
    body: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: colorMap,
      bumpMap,
      bumpScale: 0.62,
      metalness: 0.72,
      roughness: 0.36,
      side: THREE.FrontSide,
    }),
    rim: new THREE.MeshStandardMaterial({
      color: 0x5a5650,
      metalness: 0.78,
      roughness: 0.32,
    }),
    inner: new THREE.MeshStandardMaterial({
      color: 0x0c0c0e,
      metalness: 0.28,
      roughness: 0.72,
      side: THREE.BackSide,
    }),
    head: new THREE.MeshStandardMaterial({
      color: 0x16181c,
      metalness: 0.48,
      roughness: 0.52,
    }),
  };
  return cachedMats;
}

function addBellBody(
  g: THREE.Group,
  rTop: number,
  rBot: number,
  h: number,
  mats: RaptorMats,
): void {
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, 16, 3, true),
    mats.body,
  );
  body.name = "raptor-bell";
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop * 0.92, rBot * 0.92, h * 0.94, 12, 1, true),
    mats.inner,
  );
  inner.name = "raptor-inner";
  inner.rotation.x = Math.PI / 2;
  g.add(inner);
}

function addBellRim(g: THREE.Group, rBot: number, h: number, mat: THREE.Material): void {
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(rBot * 0.94, rBot * 0.07, 6, 16),
    mat,
  );
  rim.name = "raptor-rim";
  rim.position.z = -h * 0.5;
  g.add(rim);
}

function addPowerhead(
  g: THREE.Group,
  rTop: number,
  h: number,
  mat: THREE.Material,
): void {
  const headH = h * 0.36;
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop * 1.12, rTop * 1.32, headH, 10),
    mat,
  );
  head.name = "raptor-head";
  head.rotation.x = Math.PI / 2;
  head.position.z = h * 0.42;
  g.add(head);
  const plug = new THREE.Mesh(new THREE.CircleGeometry(rTop * 0.82, 10), mat);
  plug.name = "raptor-throat";
  plug.rotation.x = Math.PI;
  plug.position.z = h * 0.22;
  g.add(plug);
}

/**
 * One Raptor 3: fluted bell, sooted interior, powerhead can, exit rim.
 * Shared materials (fluting maps) so a 33-engine cluster stays cheap.
 */
export function makeBell(
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
): THREE.Group {
  const g = new THREE.Group();
  g.name = "raptor";
  const mats = raptorMats();
  addBellBody(g, rTop, rBot, h, mats);
  addBellRim(g, rBot, h, mats.rim);
  addPowerhead(g, rTop, h, mats.head);
  g.position.set(x, y, z);
  return g;
}

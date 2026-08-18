/**
 * Weather cumulus deck for Flight 13 splash zone.
 */

import * as THREE from "three";
import { WEATHER_CLOUD_ALT_KM } from "./terminalFx";
import { makeRng } from "./splashOceanPaint";

export const SPLASH_WEATHER_CLOUDS = "splash-weather-clouds";

export type WeatherClouds = {
  group: THREE.Group;
  setOpacity: (opacity: number) => void;
};

const VISIBLE_EPS = 0.02;

function paintCumulusLobe(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
): void {
  const x = size * (0.32 + rng() * 0.36);
  const y = size * (0.34 + rng() * 0.3);
  const rx = size * (0.14 + rng() * 0.18);
  const ry = rx * (0.62 + rng() * 0.28);
  const g = ctx.createRadialGradient(x, y - ry * 0.15, rx * 0.08, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(255,255,255,${0.72 + rng() * 0.22})`);
  g.addColorStop(0.4, `rgba(236, 242, 248,${0.42 + rng() * 0.18})`);
  g.addColorStop(0.78, `rgba(210, 220, 230,${0.12 + rng() * 0.1})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, (rng() - 0.5) * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function paintCumulusBase(
  ctx: CanvasRenderingContext2D,
  size: number,
): void {
  const g = ctx.createRadialGradient(
    size * 0.5, size * 0.62, size * 0.04,
    size * 0.5, size * 0.58, size * 0.42,
  );
  g.addColorStop(0, "rgba(228, 234, 240, 0.55)");
  g.addColorStop(0.55, "rgba(200, 210, 220, 0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.6, size * 0.4, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Irregular multi-lobe cumulus impostor (transparent background). */
function paintCumulusPuff(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  ctx.clearRect(0, 0, size, size);
  const rng = makeRng(seed);
  paintCumulusBase(ctx, size);
  const lobes = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < lobes; i++) paintCumulusLobe(ctx, size, rng);
}

function makePuffMaps(): THREE.CanvasTexture[] {
  return [0xc10d01, 0xc10d02, 0xc10d03, 0xc10d04].map((seed) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    paintCumulusPuff(canvas.getContext("2d")!, 256, seed);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    return map;
  });
}

function puffMaterial(map: THREE.CanvasTexture, opacity: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
    alphaTest: 0.08,
  });
}

type PuffMat = { mat: THREE.SpriteMaterial; base: number };

function addPuffSprite(
  group: THREE.Group,
  mats: PuffMat[],
  maps: readonly THREE.CanvasTexture[],
  rng: () => number,
  x: number,
  y: number,
  z: number,
): void {
  const map = maps[Math.floor(rng() * maps.length)]!;
  const base = 0.42 + rng() * 0.28;
  const mat = puffMaterial(map, 0);
  mats.push({ mat, base });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, y, z);
  const w = 2.2 + rng() * 5.4;
  const h = w * (0.42 + rng() * 0.28);
  sprite.scale.set(w, h, 1);
  sprite.renderOrder = 3;
  sprite.castShadow = false;
  sprite.receiveShadow = false;
  group.add(sprite);
}

function addCloudCluster(
  group: THREE.Group,
  mats: PuffMat[],
  maps: readonly THREE.CanvasTexture[],
  rng: () => number,
  cx: number,
  cz: number,
  alt: number,
): void {
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    addPuffSprite(
      group, mats, maps, rng,
      cx + (rng() - 0.5) * 2.4,
      alt + (rng() - 0.45) * 0.7,
      cz + (rng() - 0.5) * 2.4,
    );
  }
}

function ringCluster(
  rng: () => number,
  r0: number,
  r1: number,
): { x: number; z: number } {
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(r0 * r0 + rng() * (r1 * r1 - r0 * r0));
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function scatterWeatherClouds(
  group: THREE.Group,
  mats: PuffMat[],
  maps: readonly THREE.CanvasTexture[],
): void {
  const rng = makeRng(0x2c10d13);
  for (let i = 0; i < 10; i++) {
    const p = ringCluster(rng, 0.6, 6.5);
    const alt = WEATHER_CLOUD_ALT_KM + (rng() - 0.4) * 0.9;
    addCloudCluster(group, mats, maps, rng, p.x, p.z, alt);
  }
  for (let i = 0; i < 28; i++) {
    const p = ringCluster(rng, 8, 58);
    const alt = WEATHER_CLOUD_ALT_KM + (rng() - 0.35) * 1.4;
    addCloudCluster(group, mats, maps, rng, p.x, p.z, alt);
  }
}

/**
 * Broken cumulus field at weather altitude around the splash site.
 * Corridor puffs sit on the descent path so the ship falls through.
 */
export function createWeatherClouds(): WeatherClouds {
  const group = new THREE.Group();
  group.name = SPLASH_WEATHER_CLOUDS;
  group.visible = false;
  const maps = makePuffMaps();
  const mats: PuffMat[] = [];
  scatterWeatherClouds(group, mats, maps);
  return {
    group,
    setOpacity(opacity) {
      const on = opacity > VISIBLE_EPS;
      group.visible = on;
      if (!on) return;
      for (const m of mats) m.mat.opacity = m.base * opacity;
    },
  };
}

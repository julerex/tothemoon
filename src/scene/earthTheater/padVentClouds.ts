/**
 * Soft cryo vent banks for the T− hold (OLM wrap + tank farm).
 *
 * Flight 13 T−5 aerial stills show dense, billowy white steam — not faceted
 * icosahedron lobes. Theater-grade: canvas multi-lobe impostors + sprites,
 * scrub-driven opacity/pose (same contracts as before).
 *
 * @see docs/VISUAL_REALISM.md — V23.5
 */

import * as THREE from "three";
import { VENT_CLOUD_SPECS, type VentCloudSpec } from "../padLaunchFx";
import { makeRng } from "../splashOceanPaint";

export const PAD_VENT_STEAM = "pad-vent-steam";

type PuffMat = { mat: THREE.SpriteMaterial; base: number };

function paintVentLobe(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
): void {
  const x = size * (0.28 + rng() * 0.44);
  const y = size * (0.3 + rng() * 0.4);
  const rx = size * (0.16 + rng() * 0.2);
  const ry = rx * (0.7 + rng() * 0.35);
  const g = ctx.createRadialGradient(x, y - ry * 0.1, rx * 0.06, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(255,255,255,${0.88 + rng() * 0.12})`);
  g.addColorStop(0.35, `rgba(244, 248, 252,${0.55 + rng() * 0.2})`);
  g.addColorStop(0.72, `rgba(220, 228, 236,${0.14 + rng() * 0.1})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, (rng() - 0.5) * 0.8, 0, Math.PI * 2);
  ctx.fill();
}

function paintVentCore(ctx: CanvasRenderingContext2D, size: number): void {
  const g = ctx.createRadialGradient(
    size * 0.5, size * 0.52, size * 0.04,
    size * 0.5, size * 0.5, size * 0.46,
  );
  g.addColorStop(0, "rgba(255, 255, 255, 0.92)");
  g.addColorStop(0.4, "rgba(236, 242, 248, 0.55)");
  g.addColorStop(0.75, "rgba(210, 220, 230, 0.16)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.52, size * 0.42, size * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Dense white multi-lobe cryo puff (transparent background). */
export function paintCryoVentPuff(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  ctx.clearRect(0, 0, size, size);
  const rng = makeRng(seed);
  paintVentCore(ctx, size);
  const lobes = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < lobes; i++) paintVentLobe(ctx, size, rng);
}

function makeCryoVentMaps(): THREE.CanvasTexture[] {
  return [0xc10d201, 0xc10d202, 0xc10d203, 0xc10d204].map((seed) => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    paintCryoVentPuff(canvas.getContext("2d")!, 128, seed);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    return map;
  });
}

function puffMaterial(map: THREE.CanvasTexture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
    alphaTest: 0.06,
  });
}

function lobeSpriteScale(rng: () => number): [number, number] {
  const w = 0.9 + rng() * 0.85;
  const h = w * (0.55 + rng() * 0.35);
  return [w, h];
}

function addCloudLobe(
  cluster: THREE.Group,
  maps: readonly THREE.CanvasTexture[],
  mats: PuffMat[],
  rng: () => number,
): void {
  const map = maps[Math.floor(rng() * maps.length)]!;
  const base = 0.72 + rng() * 0.28;
  const mat = puffMaterial(map);
  mats.push({ mat, base });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set((rng() - 0.5) * 1.15, (rng() - 0.4) * 0.35, (rng() - 0.5) * 1.15);
  const [w, h] = lobeSpriteScale(rng);
  sprite.scale.set(w, h, 1);
  sprite.renderOrder = 2;
  sprite.castShadow = false;
  sprite.receiveShadow = false;
  cluster.add(sprite);
}

function makeCloudCluster(
  spec: VentCloudSpec,
  maps: readonly THREE.CanvasTexture[],
  mats: PuffMat[],
  i: number,
): THREE.Group {
  const cluster = new THREE.Group();
  cluster.name = `vent-cloud-${i}`;
  cluster.userData.cloud = true;
  cluster.userData.baseX = spec.x;
  cluster.userData.baseY = spec.y;
  cluster.userData.baseZ = spec.z;
  cluster.userData.baseScale = spec.scale;
  cluster.userData.phase = spec.phase;
  const rng = makeRng(0xc10d100 + i * 97);
  for (let n = 0; n < spec.lobes; n++) addCloudLobe(cluster, maps, mats, rng);
  cluster.position.set(spec.x, spec.y, spec.z);
  cluster.scale.setScalar(spec.scale);
  return cluster;
}

/**
 * Named `pad-vent-steam` group of soft cryo-puff sprite clusters.
 * `userData.puffMats` drives scrub-safe opacity in {@link updatePadVent}.
 */
export function createPadVentClouds(): THREE.Group {
  const group = new THREE.Group();
  group.name = PAD_VENT_STEAM;
  group.visible = false;
  const maps = makeCryoVentMaps();
  const mats: PuffMat[] = [];
  group.userData.puffMats = mats;
  VENT_CLOUD_SPECS.forEach((spec, i) => group.add(makeCloudCluster(spec, maps, mats, i)));
  return group;
}

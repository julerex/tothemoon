import * as THREE from "three";
import {
  plumeGimbalOffset, plumeStreamScale, type PlumeLook, type PlumeRegimeId,
} from "../plumeRegime";
import { ICE_FLAKES } from "../craftFrost";
import { makeSizedCanvas } from "./materials";
import { addExhaustStream, applyExhaustStream } from "./exhaustStream";

type PlumePalette = "booster" | "ship";

type PlumeLayerSpec = {
  id: string;
  baseScale: number;
  yStretch: number;
  baseOpacity: number;
  z: number;
  layer: number;
};

/** Tight bell-glow sprites — the long shaft is {@link addExhaustStream}. */
const BOOSTER_PLUME_LAYERS: PlumeLayerSpec[] = [
  { id: "outer", baseScale: 0.58, yStretch: 1.7, baseOpacity: 0.24, z: -0.16, layer: 2 },
  { id: "mid", baseScale: 0.34, yStretch: 1.35, baseOpacity: 0.46, z: -0.1, layer: 1 },
  { id: "core", baseScale: 0.18, yStretch: 1.05, baseOpacity: 0.8, z: -0.05, layer: 0 },
];

const SHIP_PLUME_LAYERS: PlumeLayerSpec[] = [
  { id: "outer", baseScale: 0.48, yStretch: 1.75, baseOpacity: 0.24, z: -0.13, layer: 2 },
  { id: "mid", baseScale: 0.3, yStretch: 1.35, baseOpacity: 0.44, z: -0.08, layer: 1 },
  { id: "core", baseScale: 0.16, yStretch: 1.08, baseOpacity: 0.76, z: -0.045, layer: 0 },
];

/** Soft multi-layer exhaust sprites (billboarded). Tint via material.color at runtime. */
export function makePlumeGroup(name: string, palette: PlumePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.visible = false;
  const layers = palette === "booster" ? BOOSTER_PLUME_LAYERS : SHIP_PLUME_LAYERS;
  for (const L of layers) g.add(makePlumeLayerFromSpec(name, palette, L));
  addExhaustStream(g);
  return g;
}

function configurePlumeLayer(sprite: THREE.Sprite, L: PlumeLayerSpec): void {
  sprite.userData.baseScale = L.baseScale;
  sprite.userData.yStretch = L.yStretch;
  sprite.userData.baseOpacity = L.baseOpacity;
  sprite.userData.baseZ = L.z;
  sprite.userData.layer = L.layer;
  sprite.position.z = L.z;
  sprite.scale.set(L.baseScale, L.baseScale * L.yStretch, 1);
  sprite.visible = false;
}

function makePlumeLayerFromSpec(
  name: string,
  palette: PlumePalette,
  L: PlumeLayerSpec,
): THREE.Sprite {
  const sprite = makePlumeLayerSprite(palette);
  sprite.name =
    palette === "booster" && L.id === "mid" ? "exhaust-glow" : `${name}-${L.id}`;
  configurePlumeLayer(sprite, L);
  return sprite;
}

function paintPlumeGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: PlumePalette,
): void {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.28, 1, w * 0.5, h * 0.28, h * 0.72);
  if (palette === "booster") paintBoosterPlumeStops(g);
  else paintShipPlumeStops(g);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function paintBoosterPlumeStops(g: CanvasGradient): void {
  g.addColorStop(0, "rgba(255, 220, 240, 0.92)");
  g.addColorStop(0.16, "rgba(255, 90, 190, 0.58)");
  g.addColorStop(0.42, "rgba(220, 20, 150, 0.22)");
  g.addColorStop(1, "rgba(160, 0, 110, 0)");
}

function paintShipPlumeStops(g: CanvasGradient): void {
  g.addColorStop(0, "rgba(255, 252, 255, 0.92)");
  g.addColorStop(0.2, "rgba(230, 220, 245, 0.48)");
  g.addColorStop(0.5, "rgba(180, 170, 230, 0.14)");
  g.addColorStop(1, "rgba(140, 130, 220, 0)");
}

function makePlumeLayerSprite(palette: PlumePalette): THREE.Sprite {
  const w = 64;
  const h = 96;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paintPlumeGradient(canvas.getContext("2d")!, w, h, palette);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(plumeSpriteMaterial(map));
}

function plumeSpriteMaterial(map: THREE.CanvasTexture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    depthTest: true,
  });
}

/**
 * Drive multi-layer plume sprites from thrust fraction + regime look.
 * @param u thrust fraction in [0, 1] (already lagged / hot-stage synthetic)
 */
function hidePlumeChildren(plume: THREE.Object3D): void {
  for (const child of plume.children) child.visible = false;
}

function showPlumeLayers(
  plume: THREE.Object3D,
  u: number,
  look: PlumeLook,
  flicker: number,
  missionT: number,
): void {
  const thrustScale = 0.45 + 0.7 * Math.sqrt(Math.max(u, 0.05));
  for (const child of plume.children) {
    if (child instanceof THREE.Sprite) {
      applyOnePlumeLayer(child, u, look, flicker, missionT, thrustScale);
    }
  }
}

export function applyPlumeLayers(
  plume: THREE.Object3D,
  u: number,
  look: PlumeLook,
  flicker: number,
  missionT: number,
  opts: { regime?: PlumeRegimeId; altEarthKm?: number } = {},
): void {
  const on = u > 0.02;
  plume.visible = on;
  if (!on) hidePlumeChildren(plume);
  else showPlumeLayers(plume, u, look, flicker, missionT);
  const regime = opts.regime ?? "atmosphere";
  applyExhaustStream(plume, u, look, plumeStreamScale(regime, opts.altEarthKm), flicker);
}

function applyOnePlumeLayer(
  child: THREE.Sprite,
  u: number,
  look: PlumeLook,
  flicker: number,
  missionT: number,
  thrustScale: number,
): void {
  const baseScale = (child.userData.baseScale as number) ?? 0.5;
  const yStretch = (child.userData.yStretch as number) ?? 1;
  const baseOp = (child.userData.baseOpacity as number) ?? 0.4;
  const baseZ = (child.userData.baseZ as number) ?? -0.08;
  const layer = (child.userData.layer as number) ?? 0;
  posePlumeSprite(child, baseScale, yStretch, baseOp, baseZ, layer, u, look, flicker, missionT, thrustScale);
}

function posePlumeSprite(
  child: THREE.Sprite,
  baseScale: number,
  yStretch: number,
  baseOp: number,
  baseZ: number,
  layer: number,
  u: number,
  look: PlumeLook,
  flicker: number,
  missionT: number,
  thrustScale: number,
): void {
  const s = baseScale * look.radial * thrustScale * flicker;
  const sy = s * yStretch * look.length * (0.92 + 0.08 * flicker);
  child.scale.set(s, sy, 1);
  tintPlumeSprite(child, baseOp, layer, u, look, flicker);
  const gimbal = plumeGimbalOffset(missionT, layer);
  child.position.set(gimbal.x, gimbal.y, baseZ * look.length);
  child.visible = true;
}

function tintPlumeSprite(
  child: THREE.Sprite,
  baseOp: number,
  layer: number,
  u: number,
  look: PlumeLook,
  flicker: number,
): void {
  const mat = child.material as THREE.SpriteMaterial;
  mat.opacity = baseOp * look.opacity * (0.72 + 0.38 * u) * (0.88 + 0.12 * flicker);
  const mix = layer / 2;
  mat.color.setRGB(
    look.core[0]! * (1 - mix) + look.rim[0]! * mix,
    look.core[1]! * (1 - mix) + look.rim[1]! * mix,
    look.core[2]! * (1 - mix) + look.rim[2]! * mix,
  );
}

function paintCondenseGradient(ctx: CanvasRenderingContext2D, size: number): void {
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(230, 235, 240, 0.9)");
  grad.addColorStop(0.35, "rgba(200, 210, 220, 0.4)");
  grad.addColorStop(1, "rgba(180, 190, 200, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

function makeCondenseMap(): THREE.CanvasTexture {
  const size = 64;
  const canvas = makeSizedCanvas(size, size);
  paintCondenseGradient(canvas.getContext("2d")!, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

const CONDENSE_PUFFS: { zFrac: number; s: number; phase: number }[] = [
  { zFrac: 0.92, s: 0.55, phase: 0.2 },
  { zFrac: 0.72, s: 0.7, phase: 1.1 },
  { zFrac: 0.52, s: 0.85, phase: 2.0 },
  { zFrac: 0.35, s: 0.95, phase: 0.7 },
  { zFrac: 0.2, s: 1.05, phase: 1.6 },
  { zFrac: 0.08, s: 0.9, phase: 2.4 },
];

function addCondensePuffs(g: THREE.Group, map: THREE.CanvasTexture, stackH: number): void {
  for (const p of CONDENSE_PUFFS) {
    g.add(makeCondensePuff(map, p.zFrac * stackH, p.s, p.phase));
  }
}

function condensePuffMaterial(map: THREE.CanvasTexture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
}

function makeCondensePuff(
  map: THREE.CanvasTexture,
  z: number,
  s: number,
  phase: number,
): THREE.Sprite {
  const sprite = new THREE.Sprite(condensePuffMaterial(map));
  sprite.position.set(0, 0, z);
  sprite.scale.setScalar(s);
  sprite.userData.baseScale = s;
  sprite.userData.phase = phase;
  return sprite;
}

function makeSheathMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xc8d0d8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makeSheathMesh(stackH: number, radius: number, sheathMat: THREE.MeshBasicMaterial): THREE.Mesh {
  const sheath = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 2.2, radius * 2.8, stackH * 0.85, 20, 1, true),
    sheathMat,
  );
  sheath.rotation.x = Math.PI / 2;
  sheath.position.z = stackH * 0.45;
  sheath.name = "condense-sheath";
  sheath.userData.mat = sheathMat;
  return sheath;
}

function addCondenseSheath(g: THREE.Group, stackH: number, radius: number): void {
  g.add(makeSheathMesh(stackH, radius, makeSheathMaterial()));
}

function configureIceFlake(sprite: THREE.Sprite, spec: (typeof ICE_FLAKES)[number]): void {
  sprite.position.set(
    Math.cos(spec.ang) * spec.r0,
    Math.sin(spec.ang) * spec.r0,
    spec.z0,
  );
  sprite.scale.setScalar(spec.scale);
  sprite.userData.ang = spec.ang;
  sprite.userData.r0 = spec.r0;
  sprite.userData.z0 = spec.z0;
  sprite.userData.scale = spec.scale;
  sprite.userData.phase = spec.phase;
}

export function makeIceFlakeGroup(): THREE.Group {
  const g = new THREE.Group();
  g.name = "ice-flakes";
  g.visible = false;
  const map = makeCondenseMap();
  for (const spec of ICE_FLAKES) {
    const sprite = new THREE.Sprite(condensePuffMaterial(map));
    configureIceFlake(sprite, spec);
    g.add(sprite);
  }
  return g;
}

/**
 * Soft vapor / condensation sheath around the stack (Maximum dynamic pressure theater cue).
 * Sprites face the camera; opacity driven by altitude in updateCraftVisuals.
 */
export function makeCondensationCloud(stackH: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "condense-cloud";
  g.visible = false;
  addCondensePuffs(g, makeCondenseMap(), stackH);
  addCondenseSheath(g, stackH, radius);
  return g;
}

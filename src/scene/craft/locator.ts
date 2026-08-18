import * as THREE from "three";

function paintLocatorDisc(
  ctx: CanvasRenderingContext2D,
  size: number,
  coreCss: string,
  glowRgb: string,
): void {
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, `rgba(${glowRgb}, 1)`);
  g.addColorStop(0.25, `rgba(${glowRgb}, 0.9)`);
  g.addColorStop(0.55, `rgba(${glowRgb}, 0.25)`);
  g.addColorStop(1, `rgba(${glowRgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  paintLocatorCore(ctx, coreCss);
}

function paintLocatorCore(ctx: CanvasRenderingContext2D, coreCss: string): void {
  ctx.beginPath();
  ctx.arc(32, 32, 5, 0, Math.PI * 2);
  ctx.fillStyle = coreCss;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Soft glowing locator dot (constant on-screen size via updateLocatorVisibility).
 * @param coreCss solid disc color
 * @param glowRgb "r, g, b" for the outer halo
 */
export function createLocatorSprite(
  coreCss = "#ff2233",
  glowRgb = "255, 40, 55",
  name = "locator",
): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paintLocatorDisc(canvas.getContext("2d")!, size, coreCss, glowRgb);
  return finishLocatorSprite(canvas, name);
}

function locatorMaterial(map: THREE.CanvasTexture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
}

function finishLocatorSprite(canvas: HTMLCanvasElement, name: string): THREE.Sprite {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(locatorMaterial(map));
  sprite.renderOrder = 5;
  sprite.scale.set(1, 1, 1);
  sprite.name = name;
  sprite.visible = false;
  return sprite;
}

export const LOCATOR_HIDE_ABOVE_PX = 5;

/**
 * Whether a locator should draw this frame.
 *
 * @param distKm camera-to-target distance (scene units = km)
 * @param bodyPx on-screen pixels subtended by the body's characteristic size
 * @param minDistKm optional near-range hide
 */
export function locatorShouldShow(
  distKm: number,
  bodyPx: number,
  minDistKm?: number,
): boolean {
  if (minDistKm != null && distKm < minDistKm) return false;
  return bodyPx < LOCATOR_HIDE_ABOVE_PX;
}

/**
 * Locator dot: constant on-screen marker whenever a body is too small to read.
 * Hide once the real geometry subtends enough pixels.
 *
 * `sizeKm` — characteristic size in scene units (body diameter, booster length).
 * `minDistKm` — optional camera-distance floor.
 */
export function updateLocatorVisibility(
  locator: THREE.Sprite,
  camera: THREE.Camera,
  worldPos: THREE.Vector3,
  opts: { sizeKm: number; minDistKm?: number },
): void {
  const dist = Math.max(1e-6, camera.position.distanceTo(worldPos));
  const len = Math.max(opts.sizeKm, 0.01);
  const bodyPx = bodyPixels(camera, dist, len);
  if (!locatorShouldShow(dist, bodyPx, opts.minDistKm)) {
    locator.visible = false;
    return;
  }
  locator.visible = true;
  scaleLocator(locator, camera, dist, len);
}

function bodyPixels(camera: THREE.Camera, dist: number, len: number): number {
  const persp = camera as THREE.PerspectiveCamera;
  const fov = (persp.fov ?? 50) * (Math.PI / 180);
  const worldHeight = 2 * Math.tan(fov / 2) * dist;
  const viewH = window.innerHeight || 800;
  return (len / worldHeight) * viewH;
}

function scaleLocator(
  locator: THREE.Sprite,
  camera: THREE.Camera,
  dist: number,
  len: number,
): void {
  const persp = camera as THREE.PerspectiveCamera;
  const fov = (persp.fov ?? 50) * (Math.PI / 180);
  const worldHeight = 2 * Math.tan(fov / 2) * dist;
  const viewH = window.innerHeight || 800;
  const fromPixels = (10 / viewH) * worldHeight;
  const minS = Math.min(len * 1.5, fromPixels * 0.5, dist * 0.001);
  const s = THREE.MathUtils.clamp(fromPixels, Math.max(minS, 1e-6), dist * 0.05);
  locator.scale.set(s, s, 1);
}

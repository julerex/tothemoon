import * as THREE from "three";

export type ZoomLabelSpec = {
  /** Desired on-screen height in CSS pixels */
  targetPx: number;
  /** Sprite width / height */
  aspect: number;
  /** Floor world height (km) so labels stay readable when very close */
  minH: number;
  /**
   * Optional soft cap on world height (km). Prefer omitting this so labels
   * keep a constant pixel size at any zoom; a low maxH makes them vanish
   * when the camera is far away.
   */
  maxH?: number;
};

const _worldPos = new THREE.Vector3();
const _parentScale = new THREE.Vector3(1, 1, 1);

/** Global visibility for all marked zoom labels (toggled with L). Off at boot. */
let labelsVisible = false;

export function getZoomLabelsVisible(): boolean {
  return labelsVisible;
}

export function setZoomLabelsVisible(visible: boolean): void {
  labelsVisible = visible;
}

/** Toggle scene labels; returns the new visibility. */
export function toggleZoomLabels(): boolean {
  labelsVisible = !labelsVisible;
  return labelsVisible;
}

/** Mark a sprite so `updateZoomLabels` can keep its screen size stable. */
export function markZoomLabel(
  sprite: THREE.Sprite,
  spec: ZoomLabelSpec,
): void {
  sprite.userData.zoomLabel = spec;
  // Draw on top of nearby geometry so far/close labels stay readable
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.depthTest = false;
  mat.depthWrite = false;
  sprite.renderOrder = 20;
}

function roundPillPath(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  bw: number,
  bh: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x0 + bw, y0, x0 + bw, y0 + bh, r);
  ctx.arcTo(x0 + bw, y0 + bh, x0, y0 + bh, r);
  ctx.arcTo(x0, y0 + bh, x0, y0, r);
  ctx.arcTo(x0, y0, x0 + bw, y0, r);
  ctx.closePath();
}

function nameLabelFontPx(ctx: CanvasRenderingContext2D, text: string): void {
  let fontPx = 34;
  ctx.font = `bold ${fontPx}px system-ui, sans-serif`;
  while (fontPx > 22 && ctx.measureText(text).width + 28 > 240) {
    fontPx -= 2;
    ctx.font = `bold ${fontPx}px system-ui, sans-serif`;
  }
}

function fillNamePill(ctx: CanvasRenderingContext2D, text: string): void {
  nameLabelFontPx(ctx, text);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Soft pill background
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const bw = Math.min(240, ctx.measureText(text).width + 28);
  roundPillPath(ctx, (256 - bw) / 2, (64 - 40) / 2, bw, 40, 8);
  ctx.fill();
}

function makeLabelCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  return canvas;
}

function finishNameLabelMap(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function paintNameLabelCanvas(text: string, color: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = makeLabelCanvas();
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  fillNamePill(ctx, text);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  return finishNameLabelMap(canvas);
}

function makeNameSpriteMat(map: THREE.CanvasTexture | null): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    ...(map ? { map } : {}),
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
}

/** Sprite name for a name plate (`"OLP-1"` → `"label-olp-1"`). */
export function zoomLabelName(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `label-${slug}`;
}

/**
 * Body / craft name plate (canvas sprite). Screen size tracked by L-key zoom labels.
 */
export function createNameLabel(
  text: string,
  color: string,
  spec: ZoomLabelSpec = { targetPx: 18, aspect: 256 / 64, minH: 0.3 },
): THREE.Sprite {
  const spr = new THREE.Sprite(makeNameSpriteMat(paintNameLabelCanvas(text, color)));
  spr.name = zoomLabelName(text);
  markZoomLabel(spr, spec);
  spr.scale.set(spec.aspect * spec.minH * 4, spec.minH * 4, 1);
  return spr;
}

function zoomWorldHeight(
  spec: ZoomLabelSpec, dist: number, viewH: number, tanHalf: number,
): number {
  const worldHeight = 2 * tanHalf * dist;
  // Constant screen size; minH only floors when extremely close
  let h = Math.max(spec.minH, (spec.targetPx / viewH) * worldHeight);
  if (spec.maxH != null && Number.isFinite(spec.maxH)) h = Math.min(h, spec.maxH);
  return h;
}

/**
 * Local sprite scale so the plate reads as `worldH` km after a parent transform.
 * Needed when the label sits on the scaled craft / detached-booster mesh.
 */
export function labelLocalScale(
  worldH: number,
  aspect: number,
  parentScale: number,
): { w: number; h: number } {
  const s = Math.max(parentScale, 1e-6);
  return { w: (worldH * aspect) / s, h: worldH / s };
}

function parentWorldScaleX(obj: THREE.Object3D): number {
  if (!obj.parent) return 1;
  obj.parent.getWorldScale(_parentScale);
  return _parentScale.x;
}

function scaleZoomSprite(
  obj: THREE.Sprite,
  spec: ZoomLabelSpec,
  camera: THREE.PerspectiveCamera,
  viewH: number,
  tanHalf: number,
): void {
  obj.visible = labelsVisible;
  if (!labelsVisible) return;
  obj.getWorldPosition(_worldPos);
  const dist = Math.max(1e-3, camera.position.distanceTo(_worldPos));
  const h = zoomWorldHeight(spec, dist, viewH, tanHalf);
  const local = labelLocalScale(h, spec.aspect, parentWorldScaleX(obj));
  obj.scale.set(local.w, local.h, 1);
}

/**
 * Scale marked sprites from camera distance so they keep ~targetPx on screen
 * at any zoom, and apply the L-key visibility flag.
 */
export function updateZoomLabels(
  root: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
): void {
  const viewH = window.innerHeight || 800;
  const tanHalf = Math.tan((camera.fov * Math.PI) / 180 / 2);
  root.traverse((obj) => {
    const spec = obj.userData.zoomLabel as ZoomLabelSpec | undefined;
    if (!spec || !(obj instanceof THREE.Sprite)) return;
    scaleZoomSprite(obj, spec, camera, viewH, tanHalf);
  });
}

/** Arrow label sprites. */
import * as THREE from "three";

export type LabeledArrow = {
  group: THREE.Group;
  helper: THREE.ArrowHelper;
  label: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  map: THREE.CanvasTexture;
  lastText: string;
  /** Reference magnitude for screen-length mapping (km/s or km/s²). */
  refMag: number;
  kind: "v" | "a";
  /** Latest segment for hover pick (world). */
  origin: THREE.Vector3;
  tip: THREE.Vector3;
  mag: number;
  active: boolean;
};


export const LABEL_W=256;
export const LABEL_H=64;

export function makeLabelMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_W;
  canvas.height = LABEL_H;
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = THREE.LinearFilter;
  return map;
}

export function makeLabelSprite(colorCss: string): {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  map: THREE.CanvasTexture;
} {
  const map = makeLabelMap();
  const canvas = map.image as HTMLCanvasElement;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: true,
  }));
  sprite.renderOrder = 25;
  sprite.visible = false;
  sprite.userData.labelColor = colorCss;
  return { sprite, canvas, ctx: canvas.getContext("2d")!, map };
}

function drawLabelChrome(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, text: string, colorCss: string,
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 28px ui-monospace, SF Mono, Menlo, monospace";
  const bw = Math.min(canvas.width - 4, ctx.measureText(text).width + 20);
  ctx.fillStyle = "rgba(4, 8, 18, 0.78)";
  ctx.strokeStyle = colorCss;
  ctx.lineWidth = 2;
  roundRect(ctx, (canvas.width - bw) / 2, (canvas.height - 40) / 2, bw, 40, 8);
  ctx.fill();
  ctx.stroke();
}

function fillLabelText(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, text: string, colorCss: string,
): void {
  ctx.fillStyle = colorCss;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
}

export function paintLabel(la: LabeledArrow, text: string): void {
  if (text === la.lastText) return;
  la.lastText = text;
  const colorCss = (la.label.userData.labelColor as string) ?? "#fff";
  drawLabelChrome(la.ctx, la.canvas, text, colorCss);
  fillLabelText(la.ctx, la.canvas, text, colorCss);
  la.map.needsUpdate = true;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function makeArrowHelper(color: number): THREE.ArrowHelper {
  const helper = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, color, 0.25, 0.12,
  );
  helper.line.renderOrder = 22;
  helper.cone.renderOrder = 22;
  (helper.line.material as THREE.Material).depthTest = false;
  (helper.cone.material as THREE.Material).depthTest = false;
  return helper;
}

export function emptyLabeledArrow(
  group: THREE.Group,
  helper: THREE.ArrowHelper,
  sprite: THREE.Sprite,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  map: THREE.CanvasTexture,
  refMag: number,
  kind: "v" | "a",
): LabeledArrow {
  return {
    group, helper, label: sprite, canvas, ctx, map, lastText: "",
    refMag, kind, origin: new THREE.Vector3(), tip: new THREE.Vector3(), mag: 0, active: false,
  };
}

export function createLabeledArrow(
  color: number, colorCss: string, refMag: number, kind: "v" | "a", name: string,
): LabeledArrow {
  const group = new THREE.Group();
  group.name = name;
  const helper = makeArrowHelper(color);
  const { sprite, canvas, ctx, map } = makeLabelSprite(colorCss);
  group.add(helper, sprite);
  return emptyLabeledArrow(group, helper, sprite, canvas, ctx, map, refMag, kind);
}

export function formatVelocity(kmPerS: number): string {
  const v = Math.max(0, kmPerS);
  if (v >= 1) return `v ${v.toFixed(2)} km/s`;
  if (v >= 0.01) return `v ${(v * 1000).toFixed(0)} m/s`;
  return `v ${(v * 1000).toFixed(2)} m/s`;
}

export function formatAccel(kmPerS2: number): string {
  const a = Math.max(0, kmPerS2);
  const ms2 = a * 1000;
  const g = ms2 / 9.80665;
  if (g >= 0.05) return `a ${g.toFixed(2)} g`;
  if (ms2 >= 1) return `a ${ms2.toFixed(2)} m/s²`;
  if (ms2 >= 0.01) return `a ${ms2.toFixed(3)} m/s²`;
  return `a ${ms2.toFixed(4)} m/s²`;
}

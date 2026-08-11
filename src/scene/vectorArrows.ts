/**
 * Velocity (v) and acceleration (a) arrows for craft, Earth, and Moon.
 * Visibility follows the O-key orbit overlays; number labels appear only
 * while the pointer hovers an arrow. Shaft length tracks camera zoom.
 */
import * as THREE from "three";
import {
  BOOSTER_DRY_KG,
  BOOSTER_PROP_KG,
  MU_EARTH,
  MU_MOON,
  SHIP_DRY_KG,
  SHIP_PROP_KG,
} from "../physics/constants";
import { acceleration } from "../physics/integrator";
import type { V3 } from "../physics/vec3";

export type VectorArrowBodies = {
  earth: THREE.Vector3;
  earthVel: THREE.Vector3;
  moon: THREE.Vector3;
  moonVel: THREE.Vector3;
};

export type VectorArrowCraft = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Unit nose direction (thrust sense when burning). */
  heading: THREE.Vector3;
  t: number;
  thrustN: number;
  burning: boolean;
  staged: boolean;
  fuelBooster: number;
  fuelShip: number;
};

type LabeledArrow = {
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

const LABEL_W = 256;
const LABEL_H = 64;

/** Desired screen length (px) when |vec| = refMag. */
const REF_LEN_PX = 72;
const MIN_LEN_PX = 22;
const MAX_LEN_PX = 140;
/** Hover hit radius in CSS px (converted to world each frame). */
const HOVER_PX = 14;
/** Hide arrow when magnitude is essentially zero. */
const EPS_V = 1e-5; // km/s
const EPS_A = 1e-9; // km/s²

const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _aCraft = { x: 0, y: 0, z: 0 };
const _thrust = { x: 0, y: 0, z: 0 };
const _posV3 = { x: 0, y: 0, z: 0 };
const _velV3 = { x: 0, y: 0, z: 0 };
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _seg = new THREE.Vector3();
const _closest = new THREE.Vector3();

function makeLabelMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_W;
  canvas.height = LABEL_H;
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = THREE.LinearFilter;
  return map;
}

function makeLabelSprite(colorCss: string): {
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

function paintLabel(la: LabeledArrow, text: string): void {
  if (text === la.lastText) return;
  la.lastText = text;
  const colorCss = (la.label.userData.labelColor as string) ?? "#fff";
  drawLabelChrome(la.ctx, la.canvas, text, colorCss);
  fillLabelText(la.ctx, la.canvas, text, colorCss);
  la.map.needsUpdate = true;
}

function roundRect(
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

function makeArrowHelper(color: number): THREE.ArrowHelper {
  const helper = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, color, 0.25, 0.12,
  );
  helper.line.renderOrder = 22;
  helper.cone.renderOrder = 22;
  (helper.line.material as THREE.Material).depthTest = false;
  (helper.cone.material as THREE.Material).depthTest = false;
  return helper;
}

function emptyLabeledArrow(
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

function createLabeledArrow(
  color: number, colorCss: string, refMag: number, kind: "v" | "a", name: string,
): LabeledArrow {
  const group = new THREE.Group();
  group.name = name;
  const helper = makeArrowHelper(color);
  const { sprite, canvas, ctx, map } = makeLabelSprite(colorCss);
  group.add(helper, sprite);
  return emptyLabeledArrow(group, helper, sprite, canvas, ctx, map, refMag, kind);
}

function formatVelocity(kmPerS: number): string {
  const v = Math.max(0, kmPerS);
  if (v >= 1) return `v ${v.toFixed(2)} km/s`;
  if (v >= 0.01) return `v ${(v * 1000).toFixed(0)} m/s`;
  return `v ${(v * 1000).toFixed(2)} m/s`;
}

function formatAccel(kmPerS2: number): string {
  const a = Math.max(0, kmPerS2);
  const ms2 = a * 1000;
  const g = ms2 / 9.80665;
  if (g >= 0.05) return `a ${g.toFixed(2)} g`;
  if (ms2 >= 1) return `a ${ms2.toFixed(2)} m/s²`;
  if (ms2 >= 0.01) return `a ${ms2.toFixed(3)} m/s²`;
  return `a ${ms2.toFixed(4)} m/s²`;
}

function wetMassKg(
  staged: boolean,
  fuelBooster: number,
  fuelShip: number,
): number {
  const ship = SHIP_DRY_KG + Math.max(0, Math.min(1, fuelShip)) * SHIP_PROP_KG;
  if (staged) return ship;
  return (
    BOOSTER_DRY_KG +
    Math.max(0, Math.min(1, fuelBooster)) * BOOSTER_PROP_KG +
    ship
  );
}

function worldLengthFor(
  mag: number,
  refMag: number,
  dist: number,
  camera: THREE.PerspectiveCamera,
): number {
  const viewH = window.innerHeight || 800;
  const fov = (camera.fov * Math.PI) / 180;
  const worldPerPx = (2 * Math.tan(fov / 2) * Math.max(dist, 1e-3)) / viewH;
  const ratio = mag / Math.max(refMag, 1e-12);
  const lenPx = Math.min(MAX_LEN_PX, Math.max(MIN_LEN_PX, ratio * REF_LEN_PX));
  return lenPx * worldPerPx;
}

function worldPerPixel(
  dist: number,
  camera: THREE.PerspectiveCamera,
): number {
  const viewH = window.innerHeight || 800;
  const fov = (camera.fov * Math.PI) / 180;
  return (2 * Math.tan(fov / 2) * Math.max(dist, 1e-3)) / viewH;
}

/** Distance from ray to finite segment origin→tip. */
function closestParamsOnRaySeg(
  ray: THREE.Ray, origin: THREE.Vector3,
): { s: number; t: number } {
  const rd = ray.direction;
  const w0 = _tmp.copy(ray.origin).sub(origin);
  const a = rd.dot(rd), b = rd.dot(_seg), c = _seg.dot(_seg);
  const d = rd.dot(w0), e = _seg.dot(w0), denom = a * c - b * b;
  if (Math.abs(denom) < 1e-18) return { s: 0, t: e / c };
  return { s: (b * e - c * d) / denom, t: (a * e - b * d) / denom };
}

function distRayToSegment(
  ray: THREE.Ray, origin: THREE.Vector3, tip: THREE.Vector3,
): number {
  _seg.copy(tip).sub(origin);
  if (_seg.lengthSq() < 1e-18) return ray.distanceToPoint(origin);
  let { s, t } = closestParamsOnRaySeg(ray, origin);
  s = Math.max(0, s);
  t = Math.max(0, Math.min(1, t));
  return _closest.copy(ray.origin).addScaledVector(ray.direction, s)
    .distanceTo(_tmp.copy(origin).addScaledVector(_seg, t));
}

function applyArrowHelper(
  la: LabeledArrow, origin: THREE.Vector3, len: number,
): void {
  const headLen = Math.min(len * 0.28, len * 0.45);
  la.helper.position.copy(origin);
  la.helper.setDirection(_dir);
  la.helper.setLength(len, headLen, headLen * 0.45);
  la.origin.copy(origin);
  la.tip.copy(origin).addScaledVector(_dir, len);
}

function placeArrowGeometry(
  la: LabeledArrow, origin: THREE.Vector3, vec: THREE.Vector3, camera: THREE.PerspectiveCamera,
): number {
  const mag = vec.length();
  _dir.copy(vec).multiplyScalar(1 / mag);
  const len = worldLengthFor(mag, la.refMag, camera.position.distanceTo(origin), camera);
  applyArrowHelper(la, origin, len);
  return len;
}

function labelWorldHeight(camera: THREE.PerspectiveCamera, at: THREE.Vector3): number {
  const viewH = window.innerHeight || 800;
  const fov = (camera.fov * Math.PI) / 180;
  return 2 * Math.tan(fov / 2) * Math.max(1e-3, camera.position.distanceTo(at)) * (22 / viewH);
}

function placeArrowLabel(
  la: LabeledArrow, camera: THREE.PerspectiveCamera, len: number, mag: number,
): void {
  _camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  _camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  _tmp.copy(la.tip).addScaledVector(_camUp, len * 0.14).addScaledVector(_camRight, len * 0.06);
  la.label.position.copy(_tmp);
  const worldH = labelWorldHeight(camera, _tmp);
  la.label.scale.set(worldH * (LABEL_W / LABEL_H), worldH, 1);
  paintLabel(la, la.kind === "v" ? formatVelocity(mag) : formatAccel(mag));
  la.label.visible = true;
}

function deactivateArrow(la: LabeledArrow): void {
  la.group.visible = false;
  la.active = false;
  la.label.visible = false;
}

function updateLabeledArrow(
  la: LabeledArrow, origin: THREE.Vector3, vec: THREE.Vector3,
  camera: THREE.PerspectiveCamera, visible: boolean, hovered: boolean,
): void {
  const mag = vec.length();
  const eps = la.kind === "v" ? EPS_V : EPS_A;
  if (!visible || mag < eps) { deactivateArrow(la); return; }
  la.group.visible = true;
  la.active = true;
  la.mag = mag;
  const len = placeArrowGeometry(la, origin, vec, camera);
  if (hovered) placeArrowLabel(la, camera, len, mag);
  else la.label.visible = false;
}

export type VectorArrows = {
  group: THREE.Group;
  update: (
    craft: VectorArrowCraft,
    bodies: VectorArrowBodies,
    camera: THREE.PerspectiveCamera,
  ) => void;
  /** NDC-free: pass canvas pointer event for hover labels. */
  setPointer: (
    event: PointerEvent | null,
    camera: THREE.PerspectiveCamera,
    canvas: HTMLElement,
  ) => void;
  dispose: () => void;
};

/**
 * Build velocity + acceleration arrows for Starship, Earth, and Moon.
 */
type ArrowRuntime = {
  group: THREE.Group;
  all: LabeledArrow[];
  craftV: LabeledArrow;
  craftA: LabeledArrow;
  earthV: LabeledArrow;
  earthA: LabeledArrow;
  moonV: LabeledArrow;
  moonA: LabeledArrow;
  _v: THREE.Vector3;
  _a: THREE.Vector3;
  hover: LabeledArrow | null;
  hasPointer: boolean;
};

function buildArrowSet(): LabeledArrow[] {
  return [
    createLabeledArrow(0x5ce1ff, "#7ef0ff", 8, "v", "craft-v"),
    createLabeledArrow(0xff6b4a, "#ff9a7a", 0.01, "a", "craft-a"),
    createLabeledArrow(0x4da3ff, "#8ec5ff", 1.0, "v", "earth-v"),
    createLabeledArrow(0xffb347, "#ffd08a", 0.003, "a", "earth-a"),
    createLabeledArrow(0xb8c0ff, "#d0d6ff", 1.0, "v", "moon-v"),
    createLabeledArrow(0xff7eb6, "#ffb3d4", 0.003, "a", "moon-a"),
  ];
}

function craftThrustAccel(craft: VectorArrowCraft): V3 | null {
  if (!craft.burning || craft.thrustN <= 500) return null;
  const m = wetMassKg(craft.staged, craft.fuelBooster, craft.fuelShip);
  const aKmS2 = craft.thrustN / Math.max(m, 1) / 1000;
  const h = craft.heading;
  _thrust.x = h.x * aKmS2;
  _thrust.y = h.y * aKmS2;
  _thrust.z = h.z * aKmS2;
  return _thrust;
}

function bodyMutualAccel(
  self: THREE.Vector3, other: THREE.Vector3, mu: number, out: THREE.Vector3,
): void {
  out.copy(other).sub(self);
  const r = out.length();
  if (r > 1) out.multiplyScalar(mu / (r * r * r));
  else out.set(0, 0, 0);
}

function makeArrowRuntime(): ArrowRuntime {
  const group = new THREE.Group();
  group.name = "vector-arrows";
  const all = buildArrowSet();
  for (const la of all) group.add(la.group);
  return {
    group, all, craftV: all[0]!, craftA: all[1]!, earthV: all[2]!,
    earthA: all[3]!, moonV: all[4]!, moonA: all[5]!,
    _v: new THREE.Vector3(), _a: new THREE.Vector3(), hover: null, hasPointer: false,
  };
}

function considerHoverHit(
  la: LabeledArrow, camera: THREE.PerspectiveCamera, bestDist: number,
): number | null {
  const thresh = worldPerPixel(camera.position.distanceTo(la.origin), camera) * HOVER_PX;
  const d = distRayToSegment(_ray.ray, la.origin, la.tip);
  return d < thresh && d < bestDist ? d : null;
}

function pickHoverArrow(rt: ArrowRuntime, camera: THREE.PerspectiveCamera): LabeledArrow | null {
  if (!rt.group.visible || !rt.hasPointer) return null;
  let best: LabeledArrow | null = null;
  let bestDist = Infinity;
  for (const la of rt.all) {
    if (!la.active) continue;
    const d = considerHoverHit(la, camera, bestDist);
    if (d != null) { bestDist = d; best = la; }
  }
  return best;
}

function updateCraftArrows(rt: ArrowRuntime, craft: VectorArrowCraft, camera: THREE.PerspectiveCamera): void {
  rt._v.copy(craft.vel);
  updateLabeledArrow(rt.craftV, craft.pos, rt._v, camera, true, rt.hover === rt.craftV);
  _posV3.x = craft.pos.x; _posV3.y = craft.pos.y; _posV3.z = craft.pos.z;
  _velV3.x = craft.vel.x; _velV3.y = craft.vel.y; _velV3.z = craft.vel.z;
  acceleration(craft.t, _posV3, craftThrustAccel(craft), _aCraft, _velV3);
  rt._a.set(_aCraft.x, _aCraft.y, _aCraft.z);
  updateLabeledArrow(rt.craftA, craft.pos, rt._a, camera, true, rt.hover === rt.craftA);
}

function updateBodyArrows(rt: ArrowRuntime, bodies: VectorArrowBodies, camera: THREE.PerspectiveCamera): void {
  updateLabeledArrow(rt.earthV, bodies.earth, bodies.earthVel, camera, true, rt.hover === rt.earthV);
  bodyMutualAccel(bodies.earth, bodies.moon, MU_MOON, rt._a);
  updateLabeledArrow(rt.earthA, bodies.earth, rt._a, camera, true, rt.hover === rt.earthA);
  updateLabeledArrow(rt.moonV, bodies.moon, bodies.moonVel, camera, true, rt.hover === rt.moonV);
  bodyMutualAccel(bodies.moon, bodies.earth, MU_EARTH, rt._a);
  updateLabeledArrow(rt.moonA, bodies.moon, rt._a, camera, true, rt.hover === rt.moonA);
}

function updateVectorArrows(
  rt: ArrowRuntime, craft: VectorArrowCraft, bodies: VectorArrowBodies, camera: THREE.PerspectiveCamera,
): void {
  if (!rt.group.visible) {
    rt.hover = null;
    for (const la of rt.all) { la.active = false; la.label.visible = false; }
    return;
  }
  if (rt.hasPointer) rt.hover = pickHoverArrow(rt, camera);
  updateCraftArrows(rt, craft, camera);
  updateBodyArrows(rt, bodies, camera);
}

function clearArrowPointer(rt: ArrowRuntime): void {
  rt.hasPointer = false;
  rt.hover = null;
  for (const la of rt.all) la.label.visible = false;
}

function pointerToNdc(event: PointerEvent, canvas: HTMLElement): void {
  const rect = canvas.getBoundingClientRect();
  _ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function setArrowPointer(
  rt: ArrowRuntime, event: PointerEvent | null, camera: THREE.PerspectiveCamera, canvas: HTMLElement,
): void {
  if (!event || !rt.group.visible) {
    clearArrowPointer(rt);
    return;
  }
  rt.hasPointer = true;
  pointerToNdc(event, canvas);
  _ray.setFromCamera(_ndc, camera);
  rt.hover = pickHoverArrow(rt, camera);
  showHoverLabels(rt);
}

function showHoverLabels(rt: ArrowRuntime): void {
  for (const la of rt.all) {
    const on = rt.hover === la && la.active;
    if (on) paintLabel(la, la.kind === "v" ? formatVelocity(la.mag) : formatAccel(la.mag));
    la.label.visible = on;
  }
}

function disposeArrows(rt: ArrowRuntime): void {
  for (const la of rt.all) {
    la.map.dispose();
    (la.label.material as THREE.SpriteMaterial).dispose();
    (la.helper.line.material as THREE.Material).dispose();
    (la.helper.cone.material as THREE.Material).dispose();
    la.helper.line.geometry.dispose();
    la.helper.cone.geometry.dispose();
  }
}

/**
 * Build velocity + acceleration arrows for Starship, Earth, and Moon.
 */
export function createVectorArrows(): VectorArrows {
  const rt = makeArrowRuntime();
  return {
    group: rt.group,
    update: (craft, bodies, camera) => updateVectorArrows(rt, craft, bodies, camera),
    setPointer: (event, camera, canvas) => setArrowPointer(rt, event, camera, canvas),
    dispose: () => disposeArrows(rt),
  };
}


/**
 * Velocity (v) and acceleration (a) arrows for craft, Earth, and Moon.
 * Visibility follows the L-key label toggle; shaft length tracks camera zoom
 * so arrows stay readable at any range.
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
import { getZoomLabelsVisible } from "./zoomLabels";

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
  color: number;
  /** Reference magnitude for screen-length mapping (km/s or km/s²). */
  refMag: number;
  kind: "v" | "a";
};

const LABEL_W = 256;
const LABEL_H = 64;

/** Desired screen length (px) when |vec| = refMag. */
const REF_LEN_PX = 72;
const MIN_LEN_PX = 22;
const MAX_LEN_PX = 140;
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

function makeLabelSprite(colorCss: string): {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  map: THREE.CanvasTexture;
} {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_W;
  canvas.height = LABEL_H;
  const ctx = canvas.getContext("2d")!;
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 25;
  sprite.userData.labelColor = colorCss;
  return { sprite, canvas, ctx, map };
}

function paintLabel(
  la: LabeledArrow,
  text: string,
): void {
  if (text === la.lastText) return;
  la.lastText = text;
  const { ctx, canvas, map } = la;
  const colorCss = (la.label.userData.labelColor as string) ?? "#fff";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Pill background
  const padX = 10;
  ctx.font = "bold 28px ui-monospace, SF Mono, Menlo, monospace";
  const tw = ctx.measureText(text).width;
  const bw = Math.min(canvas.width - 4, tw + padX * 2);
  const bh = 40;
  const x0 = (canvas.width - bw) / 2;
  const y0 = (canvas.height - bh) / 2;
  ctx.fillStyle = "rgba(4, 8, 18, 0.78)";
  ctx.strokeStyle = colorCss;
  ctx.lineWidth = 2;
  roundRect(ctx, x0, y0, bw, bh, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = colorCss;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
  map.needsUpdate = true;
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

function createLabeledArrow(
  color: number,
  colorCss: string,
  refMag: number,
  kind: "v" | "a",
  name: string,
): LabeledArrow {
  const group = new THREE.Group();
  group.name = name;
  const helper = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    1,
    color,
    0.25,
    0.12,
  );
  // Keep arrows above body surfaces
  helper.line.renderOrder = 22;
  helper.cone.renderOrder = 22;
  const lineMat = helper.line.material as THREE.Material;
  lineMat.depthTest = false;
  const coneMat = helper.cone.material as THREE.Material;
  coneMat.depthTest = false;

  const { sprite, canvas, ctx, map } = makeLabelSprite(colorCss);
  group.add(helper);
  group.add(sprite);

  return {
    group,
    helper,
    label: sprite,
    canvas,
    ctx,
    map,
    lastText: "",
    color,
    refMag,
    kind,
  };
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

/**
 * World length (km) for a vector of magnitude `mag` at camera distance `dist`.
 */
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

function updateLabeledArrow(
  la: LabeledArrow,
  origin: THREE.Vector3,
  vec: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  visible: boolean,
): void {
  const mag = vec.length();
  const eps = la.kind === "v" ? EPS_V : EPS_A;
  if (!visible || mag < eps) {
    la.group.visible = false;
    return;
  }
  la.group.visible = true;

  _dir.copy(vec).multiplyScalar(1 / mag);
  const dist = camera.position.distanceTo(origin);
  const len = worldLengthFor(mag, la.refMag, dist, camera);
  const headLen = Math.min(len * 0.28, len * 0.45);
  const headWidth = headLen * 0.45;

  la.helper.position.copy(origin);
  la.helper.setDirection(_dir);
  la.helper.setLength(len, headLen, headWidth);

  // Label near the tip, offset toward camera-up so it does not sit on the shaft
  _camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  _camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  _tmp.copy(origin).addScaledVector(_dir, len * 1.06);
  _tmp.addScaledVector(_camUp, len * 0.14);
  _tmp.addScaledVector(_camRight, len * 0.06);
  la.label.position.copy(_tmp);

  // Keep label ~constant screen size (similar to zoom labels)
  const viewH = window.innerHeight || 800;
  const fov = (camera.fov * Math.PI) / 180;
  const labelDist = Math.max(1e-3, camera.position.distanceTo(_tmp));
  const worldH =
    2 * Math.tan(fov / 2) * labelDist * (22 / viewH);
  const aspect = LABEL_W / LABEL_H;
  la.label.scale.set(worldH * aspect, worldH, 1);

  paintLabel(
    la,
    la.kind === "v" ? formatVelocity(mag) : formatAccel(mag),
  );
}

export type VectorArrows = {
  group: THREE.Group;
  update: (
    craft: VectorArrowCraft,
    bodies: VectorArrowBodies,
    camera: THREE.PerspectiveCamera,
  ) => void;
  dispose: () => void;
};

/**
 * Build velocity + acceleration arrows for Starship, Earth, and Moon.
 */
export function createVectorArrows(): VectorArrows {
  const group = new THREE.Group();
  group.name = "vector-arrows";

  // Velocity: cool cyan/teal family · Acceleration: warm amber/rose
  const craftV = createLabeledArrow(0x5ce1ff, "#7ef0ff", 8, "v", "craft-v");
  const craftA = createLabeledArrow(0xff6b4a, "#ff9a7a", 0.01, "a", "craft-a");
  const earthV = createLabeledArrow(0x4da3ff, "#8ec5ff", 1.0, "v", "earth-v");
  const earthA = createLabeledArrow(0xffb347, "#ffd08a", 0.003, "a", "earth-a");
  const moonV = createLabeledArrow(0xb8c0ff, "#d0d6ff", 1.0, "v", "moon-v");
  const moonA = createLabeledArrow(0xff7eb6, "#ffb3d4", 0.003, "a", "moon-a");

  const all = [craftV, craftA, earthV, earthA, moonV, moonA];
  for (const la of all) group.add(la.group);

  const _v = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _em = new THREE.Vector3();

  function update(
    craft: VectorArrowCraft,
    bodies: VectorArrowBodies,
    camera: THREE.PerspectiveCamera,
  ): void {
    const show = getZoomLabelsVisible();
    group.visible = show;
    if (!show) return;

    // --- Craft ---
    _v.copy(craft.vel);
    updateLabeledArrow(craftV, craft.pos, _v, camera, true);

    _posV3.x = craft.pos.x;
    _posV3.y = craft.pos.y;
    _posV3.z = craft.pos.z;
    _velV3.x = craft.vel.x;
    _velV3.y = craft.vel.y;
    _velV3.z = craft.vel.z;

    let thrust: V3 | null = null;
    if (craft.burning && craft.thrustN > 500) {
      const m = wetMassKg(craft.staged, craft.fuelBooster, craft.fuelShip);
      // F(N) / m(kg) → m/s² → km/s²
      const aKmS2 = craft.thrustN / Math.max(m, 1) / 1000;
      const h = craft.heading;
      _thrust.x = h.x * aKmS2;
      _thrust.y = h.y * aKmS2;
      _thrust.z = h.z * aKmS2;
      thrust = _thrust;
    }
    acceleration(craft.t, _posV3, thrust, _aCraft, _velV3);
    _a.set(_aCraft.x, _aCraft.y, _aCraft.z);
    updateLabeledArrow(craftA, craft.pos, _a, camera, true);

    // --- Earth (inertial v; gravity of Moon + approx) ---
    updateLabeledArrow(earthV, bodies.earth, bodies.earthVel, camera, true);
    // a_E ≈ G M_m / r_em² toward Moon
    _em.copy(bodies.moon).sub(bodies.earth);
    const rEm = _em.length();
    if (rEm > 1) {
      const aE = MU_MOON / (rEm * rEm);
      _a.copy(_em).multiplyScalar(aE / rEm);
    } else {
      _a.set(0, 0, 0);
    }
    updateLabeledArrow(earthA, bodies.earth, _a, camera, true);

    // --- Moon ---
    updateLabeledArrow(moonV, bodies.moon, bodies.moonVel, camera, true);
    // a_M ≈ G M_e / r_em² toward Earth
    if (rEm > 1) {
      const aM = MU_EARTH / (rEm * rEm);
      _a.copy(bodies.earth).sub(bodies.moon).multiplyScalar(aM / rEm);
    } else {
      _a.set(0, 0, 0);
    }
    updateLabeledArrow(moonA, bodies.moon, _a, camera, true);
  }

  function dispose(): void {
    for (const la of all) {
      la.map.dispose();
      (la.label.material as THREE.SpriteMaterial).dispose();
      const lineMat = la.helper.line.material as THREE.Material;
      const coneMat = la.helper.cone.material as THREE.Material;
      lineMat.dispose();
      coneMat.dispose();
      la.helper.line.geometry.dispose();
      la.helper.cone.geometry.dispose();
    }
  }

  return { group, update, dispose };
}

/**
 * Axial exhaust stream — collimated column along −Z (not a camera billboard).
 *
 * Flight 13 T+16 still: vehicle-width pink-white shaft hanging from the Raptor
 * bells. Billboard sprites stay as the bell glow; this mesh is the stream.
 * Scene unit for the parent plume group is craft mesh units.
 */
import * as THREE from "three";
import { type PlumeLook, type PlumeStreamScale } from "../plumeRegime";

type StreamLayerSpec = {
  id: string;
  /** Radius at the bells (mesh units). */
  rBell: number;
  /** Radius at the far end (mesh units). */
  rFar: number;
  baseOpacity: number;
  layer: number;
};

/** Tight core → mid → sheath. Super Heavy radius is 0.1125 mesh units (4.5 m). */
const STREAM_LAYERS: readonly StreamLayerSpec[] = [
  { id: "sheath", rBell: 0.115, rFar: 0.132, baseOpacity: 0.24, layer: 2 },
  { id: "mid", rBell: 0.074, rFar: 0.086, baseOpacity: 0.52, layer: 1 },
  { id: "core", rBell: 0.04, rFar: 0.046, baseOpacity: 0.9, layer: 0 },
];

/** Mach-diamond discs — methane Raptor sea-level shocks (theater, not CFD). */
const SHOCK_CELLS: readonly { z: number; r: number; op: number }[] = [
  { z: -0.14, r: 0.036, op: 0.55 },
  { z: -0.3, r: 0.04, op: 0.38 },
  { z: -0.48, r: 0.044, op: 0.24 },
  { z: -0.66, r: 0.048, op: 0.12 },
];

let streamMap: THREE.CanvasTexture | null = null;

function streamAlphaMap(): THREE.CanvasTexture | null {
  if (streamMap) return streamMap;
  if (typeof document === "undefined") return null;
  const w = 16;
  const h = 96;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  // flipY: canvas y=0 (top) → uv.y=1 at the bells; y=h → uv.y=0 at the far end.
  g.addColorStop(0, "rgba(255,255,255,0.96)");
  g.addColorStop(0.1, "rgba(255,255,255,0.82)");
  g.addColorStop(0.38, "rgba(255,255,255,0.38)");
  g.addColorStop(0.62, "rgba(255,255,255,0.12)");
  g.addColorStop(0.82, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  streamMap = new THREE.CanvasTexture(canvas);
  streamMap.colorSpace = THREE.SRGBColorSpace;
  return streamMap;
}

function streamMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: streamAlphaMap() ?? undefined,
    color: 0xffffff,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function makeStreamLayer(spec: StreamLayerSpec): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(spec.rBell, spec.rFar, 1, 18, 10, true),
    streamMaterial(spec.baseOpacity),
  );
  mesh.name = `exhaust-stream-${spec.id}`;
  // +Y (tight / bells) → +Z, then slide so the bells sit at local z=0 and the
  // shaft hangs in −Z (craft aft).
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = -0.5;
  mesh.userData.baseOpacity = spec.baseOpacity;
  mesh.userData.layer = spec.layer;
  return mesh;
}

function makeShockCell(spec: (typeof SHOCK_CELLS)[number], i: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(spec.r * 0.55, spec.r, 0.012, 14, 1, false),
    streamMaterial(spec.op),
  );
  mesh.name = `exhaust-shock-${i}`;
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = spec.z;
  mesh.userData.baseOpacity = spec.op;
  mesh.userData.layer = 0;
  return mesh;
}

/** Parent a three-layer stream under a plume group (booster or ship). */
export function addExhaustStream(plume: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  g.name = "exhaust-stream";
  g.visible = false;
  for (const spec of STREAM_LAYERS) g.add(makeStreamLayer(spec));
  for (let i = 0; i < SHOCK_CELLS.length; i++) g.add(makeShockCell(SHOCK_CELLS[i]!, i));
  plume.add(g);
  return g;
}

function hideStream(stream: THREE.Object3D): void {
  stream.visible = false;
  stream.scale.set(1, 1, 1);
}

function tintStreamLayer(
  mesh: THREE.Mesh,
  look: PlumeLook,
  u: number,
  flicker: number,
  streamOp: number,
): void {
  const layer = (mesh.userData.layer as number) ?? 0;
  const baseOp = (mesh.userData.baseOpacity as number) ?? 0.4;
  const mix = layer / 2;
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.opacity = baseOp * streamOp * look.opacity * (0.7 + 0.35 * u) * (0.9 + 0.1 * flicker);
  mat.color.setRGB(
    look.core[0]! * (1 - mix) + look.rim[0]! * mix,
    look.core[1]! * (1 - mix) + look.rim[1]! * mix,
    look.core[2]! * (1 - mix) + look.rim[2]! * mix,
  );
}

/**
 * Drive the axial stream from thrust + regime scale.
 * `stream.length` is in craft mesh units (1 ≈ 40 m).
 */
export function applyExhaustStream(
  plume: THREE.Object3D,
  u: number,
  look: PlumeLook,
  stream: PlumeStreamScale,
  flicker: number,
): void {
  const g = plume.getObjectByName("exhaust-stream");
  if (!g) return;
  const on = u > 0.02 && stream.opacity > 0.02;
  if (!on) {
    hideStream(g);
    return;
  }
  g.visible = true;
  const len = Math.max(0.4, stream.length);
  g.scale.set(stream.radial, stream.radial, len);
  for (const child of g.children) {
    if (child instanceof THREE.Mesh) tintStreamLayer(child, look, u, flicker, stream.opacity);
  }
}

/**
 * JSON-safe camera world pose for OrbitControls (position + look-at target).
 *
 * Used by `window.__theater.getCamera` / `setCameraPose` so agents can read
 * and seat the theater camera from the console or CDP without scraping the HUD.
 */

import type { CameraMode } from "./cameraMode";

/** Scene kilometres (same unit as the theater). */
export type Vec3Json = { x: number; y: number; z: number };

/**
 * `[x,y,z]` or a partial `{x,y,z}` merged onto the current vector.
 * Agents type whichever is shorter in the console.
 */
export type Vec3Input = Vec3Json | Partial<Vec3Json> | readonly [number, number, number];

/** Live camera as agents see it: mode, eye, OrbitControls target, look, lens. */
export type CameraWorldPose = {
  mode: CameraMode | null;
  position: Vec3Json;
  target: Vec3Json;
  /** Unit vector from `position` toward `target` (camera −Z after lookAt). */
  look: Vec3Json;
  up: Vec3Json;
  /** Vertical FOV in degrees (PerspectiveCamera). */
  fov: number;
  near: number;
  far: number;
  /** |target − position| in km. */
  distance: number;
};

/** Patch for `setCameraPose`. Omitted fields keep the current value. */
export type CameraWorldPoseInput = {
  position?: Vec3Input;
  target?: Vec3Input;
  look?: Vec3Input;
  up?: Vec3Input;
  fov?: number;
};

/** Fields needed to snapshot a pose (Three.js objects duck-type this). */
export type CameraWorldPoseSource = {
  mode: CameraMode | null;
  position: Vec3Json;
  target: Vec3Json;
  up?: Vec3Json;
  fov?: number;
  near?: number;
  far?: number;
};

const FALLBACK_LOOK: Vec3Json = { x: 0, y: 0, z: -1 };
const FALLBACK_UP: Vec3Json = { x: 0, y: 0, z: 1 };

/** Build a JSON pose from camera + OrbitControls target. */
export function readCameraWorldPose(src: CameraWorldPoseSource): CameraWorldPose {
  const position = copyVec(src.position);
  const target = copyVec(src.target);
  const look = lookToward(position, target);
  return {
    mode: src.mode,
    position,
    target,
    look,
    up: unitOr(src.up, FALLBACK_UP),
    fov: finiteOr(src.fov, 50),
    near: finiteOr(src.near, 0),
    far: finiteOr(src.far, 0),
    distance: dist(position, target),
  };
}

/**
 * Merge a console patch onto the current pose.
 * Always reports `mode: "free"` — applying a world pose drops subject tracking
 * so the next frame does not yank the camera back.
 *
 * `target` wins over `look` when both are set. `look` alone keeps the current
 * focus distance and slides the target along that ray.
 */
export function resolveCameraWorldPose(
  current: CameraWorldPose,
  input: CameraWorldPoseInput,
): CameraWorldPose {
  const position = parseVec3Input(input.position, current.position) ?? current.position;
  const up = unitOr(parseVec3Input(input.up, current.up) ?? current.up, FALLBACK_UP);
  const fov = finiteOr(input.fov, current.fov);
  const target = resolveTarget(current, input, position);
  return readCameraWorldPose({
    mode: "free",
    position,
    target,
    up,
    fov,
    near: current.near,
    far: current.far,
  });
}

/** Parse `[x,y,z]` or `{x,y,z}` (partials merge onto `fallback`). */
export function parseVec3Input(raw: unknown, fallback: Vec3Json): Vec3Json | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    if (!isTriple(raw)) return null;
    const [x, y, z] = raw;
    if (![x, y, z].every(Number.isFinite)) return null;
    return { x, y, z };
  }
  if (typeof raw !== "object") return null;
  const o = raw as Partial<Vec3Json>;
  const x = pickComp(o.x, fallback.x);
  const y = pickComp(o.y, fallback.y);
  const z = pickComp(o.z, fallback.z);
  if (x == null || y == null || z == null) return null;
  return { x, y, z };
}

function resolveTarget(
  current: CameraWorldPose,
  input: CameraWorldPoseInput,
  position: Vec3Json,
): Vec3Json {
  const explicit = parseVec3Input(input.target, current.target);
  if (explicit) return explicit;
  const look = parseVec3Input(input.look, current.look);
  if (!look) return current.target;
  const dir = unitOr(look, FALLBACK_LOOK);
  const d = current.distance > 1e-9 ? current.distance : 1;
  return {
    x: position.x + dir.x * d,
    y: position.y + dir.y * d,
    z: position.z + dir.z * d,
  };
}

function lookToward(from: Vec3Json, to: Vec3Json): Vec3Json {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const L = Math.hypot(dx, dy, dz);
  if (L < 1e-12) return { ...FALLBACK_LOOK };
  return { x: dx / L, y: dy / L, z: dz / L };
}

function unitOr(v: Vec3Json | undefined, fallback: Vec3Json): Vec3Json {
  if (!v) return { ...fallback };
  const L = Math.hypot(v.x, v.y, v.z);
  if (L < 1e-12) return { ...fallback };
  return { x: v.x / L, y: v.y / L, z: v.z / L };
}

function copyVec(v: Vec3Json): Vec3Json {
  return { x: v.x, y: v.y, z: v.z };
}

function dist(a: Vec3Json, b: Vec3Json): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function finiteOr(n: number | undefined, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function pickComp(n: number | undefined, fallback: number): number | null {
  if (n === undefined) return fallback;
  return Number.isFinite(n) ? n : null;
}

function isTriple(raw: unknown): raw is readonly [number, number, number] {
  return Array.isArray(raw) && raw.length === 3;
}

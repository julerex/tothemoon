import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

export type FatLineOpts = {
  color: number;
  opacity?: number;
  /** Stroke width in CSS pixels (worldUnits: false). */
  linewidth?: number;
  depthTest?: boolean;
  /** Dashed stroke (uses path arc length in scene units, km). */
  dashed?: boolean;
  /** Dash length along the path (km when positions are km). */
  dashSize?: number;
  /** Gap length along the path (km when positions are km). */
  gapSize?: number;
};

/**
 * Pixel-thick polyline (WebGL LineBasicMaterial linewidth is ignored on most GPUs).
 */
export function createFatLine(
  points: THREE.Vector3[],
  opts: FatLineOpts,
): Line2 {
  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }
  const geom = new LineGeometry();
  geom.setPositions(positions);

  const opacity = opts.opacity ?? 1;
  const dashed = opts.dashed ?? false;
  const mat = new LineMaterial({
    color: opts.color,
    linewidth: opts.linewidth ?? 2.5,
    transparent: opacity < 0.999 || dashed,
    opacity,
    depthWrite: false,
    depthTest: opts.depthTest ?? true,
    worldUnits: false,
    dashed,
    dashSize: opts.dashSize ?? 1,
    gapSize: opts.gapSize ?? 1,
  });
  mat.resolution.set(
    Math.max(1, window.innerWidth || 1),
    Math.max(1, window.innerHeight || 1),
  );

  const line = new Line2(geom, mat);
  line.computeLineDistances();
  line.frustumCulled = false;
  return line;
}

/** Rewrite a fat line’s vertices (same sample count preferred) and refresh dashes. */
export function updateFatLinePositions(
  line: Line2,
  points: THREE.Vector3[],
): void {
  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }
  const geom = line.geometry as LineGeometry;
  geom.setPositions(positions);
  line.computeLineDistances();
}

/** Keep LineMaterial resolution in sync with the canvas (required for correct width). */
export function updateFatLineResolutions(
  root: THREE.Object3D,
  width: number,
  height: number,
): void {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  root.traverse((obj) => {
    if (!(obj instanceof Line2)) return;
    const mat = obj.material as LineMaterial | LineMaterial[];
    if (Array.isArray(mat)) {
      for (const m of mat) m.resolution.set(w, h);
    } else {
      mat.resolution.set(w, h);
    }
  });
}

import * as THREE from "three";
import type { V3 } from "../physics/vec3";

export function createTrailFromPoints(points: V3[]): THREE.Line {
  const vecs = points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const geom = new THREE.BufferGeometry().setFromPoints(vecs);
  const mat = new THREE.LineBasicMaterial({
    color: 0x7ec8ff,
    transparent: true,
    opacity: 0.5,
  });
  const line = new THREE.Line(geom, mat);
  line.frustumCulled = false;
  return line;
}

export function createPathGlowFromPoints(points: V3[]): THREE.Points {
  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xa8dcff,
    size: 400,
    transparent: true,
    opacity: 0.3,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geom, mat);
  pts.frustumCulled = false;
  return pts;
}

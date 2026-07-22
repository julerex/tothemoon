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

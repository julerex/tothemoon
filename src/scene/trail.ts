import * as THREE from "three";
import type { V3 } from "../physics/vec3";
import { createFatLine } from "./fatLines";

export function createTrailFromPoints(points: V3[]): THREE.Object3D {
  const vecs = points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const line = createFatLine(vecs, {
    color: 0x7ec8ff,
    opacity: 0.72,
    linewidth: 3.25,
  });
  line.name = "craft-trail";
  return line;
}

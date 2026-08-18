/**
 * Apply the WGS84 ECEF mapping to a SphereGeometry (or any lat/lon sphere).
 * Shared by the Earth globe, atmosphere shells, and LEO cloud shells.
 */
import type { BufferGeometry } from "three";
import { spherePointToWgs84 } from "../physics/wgs84";

const _p = { x: 0, y: 0, z: 0 };

/** In-place: each vertex's spherical lat/lon → WGS84 ellipsoid (+ shell height). */
export function applyWgs84ToGeometry(geo: BufferGeometry): void {
  const pos = geo.getAttribute("position");
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) {
    spherePointToWgs84(pos.getX(i), pos.getY(i), pos.getZ(i), _p);
    pos.setXYZ(i, _p.x, _p.y, _p.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

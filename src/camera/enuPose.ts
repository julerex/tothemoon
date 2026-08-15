/**
 * East-north-up spherical camera offset (km).
 *
 * Azimuth is measured from **east toward north** (0° = east, 90° = north,
 * 180° = west, 270° = south). Elevation is from the local horizon
 * (0° = level, 90° = straight up along `up`).
 *
 * The returned vector is the camera−target offset: add it to the look-at
 * point to sit the camera on that bearing.
 */

export type V3 = { x: number; y: number; z: number };

/**
 * Unit-length ENU offset times `distKm`.
 *
 * @param east - Local east (unit)
 * @param north - Local north (unit)
 * @param up - Local up / surface normal (unit)
 * @param azimuthDeg - Bearing from east toward north
 * @param elevationDeg - Angle above the local horizon
 * @param distKm - Distance from the look-at (km)
 */
export function enuOffsetKm(
  east: V3,
  north: V3,
  up: V3,
  azimuthDeg: number,
  elevationDeg: number,
  distKm: number,
): V3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const ce = Math.cos(el);
  const se = Math.sin(el);
  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const x = ce * ca;
  const y = ce * sa;
  const z = se;
  return {
    x: (east.x * x + north.x * y + up.x * z) * distKm,
    y: (east.y * x + north.y * y + up.y * z) * distKm,
    z: (east.z * x + north.z * y + up.z * z) * distKm,
  };
}

/**
 * Local north from up × east (right-handed ENU). Falls back to a stable
 * scratch axis when the two are nearly parallel.
 */
export function northFromEastUp(east: V3, up: V3): V3 {
  const n = {
    x: up.y * east.z - up.z * east.y,
    y: up.z * east.x - up.x * east.z,
    z: up.x * east.y - up.y * east.x,
  };
  const len = Math.hypot(n.x, n.y, n.z);
  if (len < 1e-12) return { x: 0, y: 1, z: 0 };
  return { x: n.x / len, y: n.y / len, z: n.z / len };
}

/**
 * Local east from north × up (right-handed). Used when the vertical is
 * craft−Earth and the pole is geographic north.
 */
export function eastFromNorthUp(north: V3, up: V3): V3 {
  const e = {
    x: north.y * up.z - north.z * up.y,
    y: north.z * up.x - north.x * up.z,
    z: north.x * up.y - north.y * up.x,
  };
  const len = Math.hypot(e.x, e.y, e.z);
  if (len < 1e-12) return { x: 1, y: 0, z: 0 };
  return { x: e.x / len, y: e.y / len, z: e.z / len };
}

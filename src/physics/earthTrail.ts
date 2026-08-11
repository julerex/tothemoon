/**
 * Earth-fixed craft trail helpers.
 *
 * Convert inertial sample positions into Earth mesh-local coordinates so a
 * polyline parented under the spinning Earth mesh co-rotates with the surface
 * and revolves with Earth around the Sun (theater Earth-centric trail).
 */

import { bodyPositions } from "./bodies";
import { inertialRelToMeshLocal } from "./earthFrame";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import type { V3 } from "./vec3";
import { v3 } from "./vec3";

export type TrailSample = {
  t: number;
  pos: V3;
};

/**
 * Downsample trajectory samples and map each position into Earth mesh-local
 * at that sample’s mission time (same frame as the globe mesh).
 */
export function meshLocalTrailFromSamples(
  samples: readonly TrailSample[],
  maxPts = 1500,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3[] {
  if (samples.length === 0) return [];

  const n = samples.length <= maxPts ? samples.length : maxPts;
  const out: V3[] = [];
  const rel = v3();
  const local = v3();

  for (let i = 0; i < n; i++) {
    const idx =
      samples.length <= maxPts
        ? i
        : Math.round((i / (n - 1)) * (samples.length - 1));
    const s = samples[idx]!;
    const b = bodyPositions(s.t, epoch);
    rel.x = s.pos.x - b.earth.x;
    rel.y = s.pos.y - b.earth.y;
    rel.z = s.pos.z - b.earth.z;
    inertialRelToMeshLocal(rel, s.t, local, epoch);
    out.push({ x: local.x, y: local.y, z: local.z });
  }
  return out;
}

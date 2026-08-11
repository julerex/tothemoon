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
function trailIndex(i: number, n: number, len: number, maxPts: number): number {
  return len <= maxPts ? i : Math.round((i / (n - 1)) * (len - 1));
}

function sampleToMeshLocal(s: TrailSample, rel: V3, local: V3, epoch: EphemerisEpoch): V3 {
  const b = bodyPositions(s.t, epoch);
  rel.x = s.pos.x - b.earth.x; rel.y = s.pos.y - b.earth.y; rel.z = s.pos.z - b.earth.z;
  inertialRelToMeshLocal(rel, s.t, local, epoch);
  return { x: local.x, y: local.y, z: local.z };
}

export function meshLocalTrailFromSamples(
  samples: readonly TrailSample[], maxPts = 1500, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3[] {
  if (samples.length === 0) return [];
  const n = samples.length <= maxPts ? samples.length : maxPts;
  const out: V3[] = [], rel = v3(), local = v3();
  for (let i = 0; i < n; i++) {
    out.push(sampleToMeshLocal(samples[trailIndex(i, n, samples.length, maxPts)]!, rel, local, epoch));
  }
  return out;
}

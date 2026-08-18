/** Sub-satellite ascent ground track (Earth mesh-local fat line). */
import * as THREE from "three";
import { inertialRelToMeshLocal } from "../../physics/earthFrame";
import { earthSurfaceRadiusAlong } from "../../physics/wgs84";
import { bodyPositions } from "../../physics/bodies";
import type { EphemerisEpoch } from "../../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../../physics/ephemerisEpoch";
import type { Sample } from "../../physics/mission";
import { v3 } from "../../physics/vec3";
import { createFatLine } from "../fatLines";

function shouldKeepAscentSample(s: Sample, ptsLen: number): "keep" | "skip" | "stop" {
  if (s.phase !== "launch" && s.phase !== "ascent" && s.phase !== "lowEarthOrbit") {
    return ptsLen > 10 ? "stop" : "skip";
  }
  if (s.phase === "lowEarthOrbit" && s.t > 6000) return "stop";
  return "keep";
}

function projectOntoShell(
  s: Sample, epoch: EphemerisEpoch, rel: ReturnType<typeof v3>,
): void {
  const b = bodyPositions(s.t, epoch);
  rel.x = s.pos.x - b.earth.x;
  rel.y = s.pos.y - b.earth.y;
  rel.z = s.pos.z - b.earth.z;
}

const _meshNorth = { x: 0, y: 1, z: 0 };

function projectSampleToMeshLocal(
  s: Sample, epoch: EphemerisEpoch, rel: ReturnType<typeof v3>, local: ReturnType<typeof v3>,
): THREE.Vector3 {
  projectOntoShell(s, epoch, rel);
  inertialRelToMeshLocal(rel, s.t, local, epoch);
  const r = Math.hypot(local.x, local.y, local.z) || 1;
  const shell = earthSurfaceRadiusAlong(local, _meshNorth, 1.5);
  const sR = shell / r;
  return new THREE.Vector3(local.x * sR, local.y * sR, local.z * sR);
}

function tryPushAscentSample(
  pts: THREE.Vector3[], s: Sample, epoch: EphemerisEpoch,
  rel: ReturnType<typeof v3>, local: ReturnType<typeof v3>,
): "continue" | "stop" {
  const gate = shouldKeepAscentSample(s, pts.length);
  if (gate === "stop") return "stop";
  if (gate === "keep") pts.push(projectSampleToMeshLocal(s, epoch, rel, local));
  return "continue";
}

function collectAscentPoints(samples: Sample[], epoch: EphemerisEpoch): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const rel = v3();
  const local = v3();
  for (const s of samples) {
    if (tryPushAscentSample(pts, s, epoch, rel, local) === "stop") break;
  }
  return pts;
}

function downsamplePts(pts: THREE.Vector3[], maxPts: number): THREE.Vector3[] {
  if (pts.length <= maxPts) return pts;
  return Array.from({ length: maxPts }, (_, i) => {
    const u = i / (maxPts - 1);
    return pts[Math.round(u * (pts.length - 1))]!;
  });
}

export function createAscentGroundTrack(
  samples: Sample[],
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): THREE.Object3D | null {
  const pts = collectAscentPoints(samples, epoch);
  if (pts.length < 4) return null;
  const line = createFatLine(downsamplePts(pts, 400), {
    color: 0xff8866, opacity: 0.85, linewidth: 2.75, depthTest: true,
  });
  line.name = "ascent-ground-track";
  return line;
}

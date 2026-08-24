/**
 * Camera-rail pose readout: look-at target, Earth altitude inside GEO, raw eye.
 *
 * Pure helpers. Scene unit = km. Altitude is WGS84 radial height and is
 * omitted when the camera is farther from Earth than geostationary orbit.
 */

import type { Vec3Json } from "../camera/worldPose";
import { earthNorthPole } from "../physics/earthFrame";
import { GEO_RADIUS_KM } from "../physics/constants";
import { radialHeightAboveEllipsoid } from "../physics/wgs84";
import { formatFocusDistance } from "./hudFormat";

export type CameraPoseVec = Readonly<Vec3Json>;

/** Live camera fields pushed with HUD telemetry. */
export type CameraHudTelemetry = {
  cameraTarget: CameraPoseVec;
  cameraPosition: CameraPoseVec;
  cameraLook: CameraPoseVec;
  /** WGS84 height (km), or null when outside GEO / missing. */
  cameraAltEarth: number | null;
};

/** Formatted camera-rail rows. */
export type CameraReadoutLabels = {
  cameraTarget: string;
  cameraAltitude: string;
  cameraAltitudeVisible: boolean;
  cameraPosition: string;
  cameraDirection: string;
};

const DASH = "—";

/**
 * Camera height above the WGS84 ellipsoid (km), or `null` when the eye is
 * farther from Earth's center than {@link GEO_RADIUS_KM}.
 */
export function cameraAltEarthKm(
  cam: CameraPoseVec | null | undefined,
  earth: CameraPoseVec | null | undefined,
): number | null {
  if (!cam || !earth) return null;
  const rel = { x: cam.x - earth.x, y: cam.y - earth.y, z: cam.z - earth.z };
  const r = Math.hypot(rel.x, rel.y, rel.z);
  if (!Number.isFinite(r) || r >= GEO_RADIUS_KM) return null;
  return radialHeightAboveEllipsoid(rel, earthNorthPole());
}

/** Snapshot pose + Earth-relative altitude for the HUD. */
export function cameraHudTelemetry(
  pose: {
    position: CameraPoseVec;
    target: CameraPoseVec;
    look: CameraPoseVec;
  } | null | undefined,
  earth: CameraPoseVec | null | undefined,
): CameraHudTelemetry | null {
  if (!pose) return null;
  return {
    cameraTarget: copyVec(pose.target),
    cameraPosition: copyVec(pose.position),
    cameraLook: copyVec(pose.look),
    cameraAltEarth: cameraAltEarthKm(pose.position, earth),
  };
}

/** Format optional telemetry camera fields for the rail. */
export function cameraReadoutLabels(tel: {
  cameraTarget?: CameraPoseVec | null;
  cameraPosition?: CameraPoseVec | null;
  cameraLook?: CameraPoseVec | null;
  cameraAltEarth?: number | null;
}): CameraReadoutLabels {
  const alt = tel.cameraAltEarth;
  const visible = alt != null && Number.isFinite(alt);
  return {
    cameraTarget: formatSceneVec3(tel.cameraTarget),
    cameraAltitude: visible ? formatFocusDistance(Math.max(0, alt)) : DASH,
    cameraAltitudeVisible: visible,
    cameraPosition: formatSceneVec3(tel.cameraPosition),
    cameraDirection: formatLookVec3(tel.cameraLook),
  };
}

/** Scene-km xyz, stacked for the narrow camera rail. */
export function formatSceneVec3(v: CameraPoseVec | null | undefined): string {
  if (!isVec(v)) return DASH;
  return `x ${formatKmComponent(v.x)}\ny ${formatKmComponent(v.y)}\nz ${formatKmComponent(v.z)}`;
}

/** Unit look vector, stacked. */
export function formatLookVec3(v: CameraPoseVec | null | undefined): string {
  if (!isVec(v)) return DASH;
  return `x ${formatDirComponent(v.x)}\ny ${formatDirComponent(v.y)}\nz ${formatDirComponent(v.z)}`;
}

function formatKmComponent(n: number): string {
  if (!Number.isFinite(n)) return DASH;
  if (n === 0) return "0";
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1e4 || a < 1e-2) return sign + a.toExponential(4);
  if (a >= 1) return sign + a.toFixed(3);
  return sign + a.toFixed(5);
}

function formatDirComponent(n: number): string {
  if (!Number.isFinite(n)) return DASH;
  const sign = n < 0 ? "−" : "";
  return sign + Math.abs(n).toFixed(5);
}

function isVec(v: CameraPoseVec | null | undefined): v is CameraPoseVec {
  return (
    !!v &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.z)
  );
}

function copyVec(v: CameraPoseVec): CameraPoseVec {
  return { x: v.x, y: v.y, z: v.z };
}

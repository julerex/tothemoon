/**
 * Camera-rail pose readout: look-at target, Earth altitude inside GEO, raw eye,
 * heading, and the 3D compass disc (local ENU as the camera sees it).
 *
 * Pure helpers. Scene unit = km. Altitude is WGS84 radial height and is
 * omitted when the camera is farther from Earth than geostationary orbit.
 */

import type { Vec3Json } from "../camera/worldPose";
import { earthNorthPole } from "../physics/earthFrame";
import { GEO_RADIUS_KM } from "../physics/constants";
import { radialHeightAboveEllipsoid } from "../physics/wgs84";
import {
  cameraCompassBasis,
  compassCssMatrix3d,
  earthEnuAt,
} from "./hudCameraCompass";
import { formatFocusDistance } from "./hudFormat";

export type CameraPoseVec = Readonly<Vec3Json>;

/** Live camera fields pushed with HUD telemetry. */
export type CameraHudTelemetry = {
  cameraTarget: CameraPoseVec;
  cameraPosition: CameraPoseVec;
  cameraLook: CameraPoseVec;
  /** WGS84 height (km), or null when outside GEO / missing. */
  cameraAltEarth: number | null;
  /** Look azimuth (deg, 0 = north, 90 = east), or null if undefined. */
  cameraHeadingDeg: number | null;
  /** CSS `matrix3d` that tilts the rose onto the local ENU disc. */
  cameraCompassTransform: string;
};

/** Formatted camera-rail rows. */
export type CameraReadoutLabels = {
  cameraTarget: string;
  cameraAltitude: string;
  cameraAltitudeVisible: boolean;
  cameraPosition: string;
  cameraDirection: string;
  cameraHeadingDeg: number | null;
  cameraHeadingLabel: string;
  cameraCompassTransform: string;
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

/**
 * Camera look azimuth in the local ENU frame at the eye (degrees).
 * 0 = north, 90 = east. Null when the look is too close to local vertical
 * or the eye sits on Earth's center / a pole.
 */
export function cameraHeadingDeg(
  look: CameraPoseVec | null | undefined,
  cam: CameraPoseVec | null | undefined,
  earth: CameraPoseVec | null | undefined,
): number | null {
  if (!isVec(look)) return null;
  const enu = earthEnuAt(cam, earth);
  if (!enu) return null;
  const dup = look.x * enu.up.x + look.y * enu.up.y + look.z * enu.up.z;
  const hx = look.x - dup * enu.up.x;
  const hy = look.y - dup * enu.up.y;
  const hz = look.z - dup * enu.up.z;
  if (!(Math.hypot(hx, hy, hz) > 1e-6)) return null;
  const east = hx * enu.east.x + hy * enu.east.y + hz * enu.east.z;
  const north = hx * enu.north.x + hy * enu.north.y + hz * enu.north.z;
  let deg = (Math.atan2(east, north) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/** `047°` or an em dash when heading is undefined. */
export function formatHeadingDeg(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return DASH;
  const wrapped = ((Math.round(deg) % 360) + 360) % 360;
  return `${String(wrapped).padStart(3, "0")}°`;
}

/** Snapshot pose + Earth-relative altitude for the HUD. */
export function cameraHudTelemetry(
  pose: {
    position: CameraPoseVec;
    target: CameraPoseVec;
    look: CameraPoseVec;
    up?: CameraPoseVec;
  } | null | undefined,
  earth: CameraPoseVec | null | undefined,
): CameraHudTelemetry | null {
  if (!pose) return null;
  return {
    cameraTarget: copyVec(pose.target),
    cameraPosition: copyVec(pose.position),
    cameraLook: copyVec(pose.look),
    cameraAltEarth: cameraAltEarthKm(pose.position, earth),
    cameraHeadingDeg: cameraHeadingDeg(pose.look, pose.position, earth),
    cameraCompassTransform: compassCssMatrix3d(
      cameraCompassBasis(pose.look, pose.position, earth, pose.up),
    ),
  };
}

/** Format optional telemetry camera fields for the rail. */
export function cameraReadoutLabels(tel: {
  cameraTarget?: CameraPoseVec | null;
  cameraPosition?: CameraPoseVec | null;
  cameraLook?: CameraPoseVec | null;
  cameraAltEarth?: number | null;
  cameraHeadingDeg?: number | null;
  cameraCompassTransform?: string | null;
}): CameraReadoutLabels {
  const alt = tel.cameraAltEarth;
  const visible = alt != null && Number.isFinite(alt);
  const heading = tel.cameraHeadingDeg ?? null;
  return {
    cameraTarget: formatSceneVec3(tel.cameraTarget),
    cameraAltitude: visible ? formatFocusDistance(Math.max(0, alt)) : DASH,
    cameraAltitudeVisible: visible,
    cameraPosition: formatSceneVec3(tel.cameraPosition),
    cameraDirection: formatLookVec3(tel.cameraLook),
    cameraHeadingDeg: heading,
    cameraHeadingLabel: formatHeadingDeg(heading),
    cameraCompassTransform: tel.cameraCompassTransform || compassCssMatrix3d(null),
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

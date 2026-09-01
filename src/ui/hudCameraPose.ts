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
  /** Look azimuth (deg, 0 = north, 90 = east), or null if undefined. */
  cameraHeadingDeg: number | null;
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
  if (!isVec(look) || !isVec(cam) || !isVec(earth)) return null;
  const ux = cam.x - earth.x;
  const uy = cam.y - earth.y;
  const uz = cam.z - earth.z;
  const ul = Math.hypot(ux, uy, uz);
  if (!(ul > 1e-6)) return null;
  const upx = ux / ul;
  const upy = uy / ul;
  const upz = uz / ul;
  const pole = earthNorthPole();
  let ex = pole.y * upz - pole.z * upy;
  let ey = pole.z * upx - pole.x * upz;
  let ez = pole.x * upy - pole.y * upx;
  const el = Math.hypot(ex, ey, ez);
  if (!(el > 1e-8)) return null;
  ex /= el;
  ey /= el;
  ez /= el;
  const nx = upy * ez - upz * ey;
  const ny = upz * ex - upx * ez;
  const nz = upx * ey - upy * ex;
  const dup = look.x * upx + look.y * upy + look.z * upz;
  const hx = look.x - dup * upx;
  const hy = look.y - dup * upy;
  const hz = look.z - dup * upz;
  if (!(Math.hypot(hx, hy, hz) > 1e-6)) return null;
  const east = hx * ex + hy * ey + hz * ez;
  const north = hx * nx + hy * ny + hz * nz;
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
  };
}

/** Format optional telemetry camera fields for the rail. */
export function cameraReadoutLabels(tel: {
  cameraTarget?: CameraPoseVec | null;
  cameraPosition?: CameraPoseVec | null;
  cameraLook?: CameraPoseVec | null;
  cameraAltEarth?: number | null;
  cameraHeadingDeg?: number | null;
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

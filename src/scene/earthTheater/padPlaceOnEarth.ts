/**
 * Seat `starbase-pad` on the Earth mesh: up-align, north yaw, site nudge.
 *
 * Pad-local after yaw: +Y up, +Z geographic north, +X west. A further
 * clockwise yaw (looking down) and a geographic west/south shift match the
 * live aerial against the globe pin.
 */
import * as THREE from "three";
import {
  EARTH_SURFACE_ALT_KM, STARBASE_LAT, STARBASE_LON,
} from "../../physics/constants";
import { geodeticToMeshLocal } from "../../physics/earthFrame";
import { geodeticToEllipsoidMeshLocal } from "../../physics/wgs84";
import { starbasePlateYawRad } from "../starbasePlate";

/** Clockwise yaw from geographic north, looking down (rad). Three.js +Y is CCW. */
export const PAD_SITE_CLOCKWISE_RAD = (-10 * Math.PI) / 180;
/** Geographic west shift of the pad origin (km). */
export const PAD_SITE_WEST_KM = 0.05;
/** Geographic south shift of the pad origin (km). */
export const PAD_SITE_SOUTH_KM = 0.05;

/**
 * Place the pad group at Starbase on the Earth mesh.
 *
 * `setFromUnitVectors(+Y → up)` leaves yaw free; compose
 * {@link starbasePlateYawRad} so pad +Z is geographic north, then the
 * site clockwise nudge. Satellite plates inherit this yaw (they must not
 * yaw again).
 */
export function placePadOnEarth(pad: THREE.Group): void {
  const local = geodeticToEllipsoidMeshLocal(STARBASE_LAT, STARBASE_LON, EARTH_SURFACE_ALT_KM);
  pad.position.set(local.x, local.y, local.z);
  const up = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, 1);
  const outward = new THREE.Vector3(up.x, up.y, up.z).normalize();
  const qUp = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    starbasePlateYawRad() + PAD_SITE_CLOCKWISE_RAD,
  );
  pad.quaternion.copy(qUp).multiply(qYaw);
  const east = new THREE.Vector3(outward.z, 0, -outward.x).normalize();
  const north = new THREE.Vector3().crossVectors(outward, east).normalize();
  pad.position.addScaledVector(east, -PAD_SITE_WEST_KM);
  pad.position.addScaledVector(north, -PAD_SITE_SOUTH_KM);
}

/**
 * Seat `starbase-pad` on the Earth mesh: up-align, north yaw.
 *
 * Pad-local after yaw: +Y up, +Z geographic north, +X west. Origin is the
 * OLP-2 OLM so surveyed apron corners sit on their WGS84 mesh positions.
 * Satellite plates are offset to the committed JPEG pin — they inherit this
 * yaw and must not yaw again.
 */
import * as THREE from "three";
import {
  EARTH_SURFACE_ALT_KM, STARBASE_LAT, STARBASE_LON,
} from "../../physics/constants";
import { geodeticToMeshLocal } from "../../physics/earthFrame";
import { geodeticToEllipsoidMeshLocal } from "../../physics/wgs84";
import { starbasePlateYawRad } from "../starbasePlate";

/**
 * Place the pad group at Starbase on the Earth mesh.
 *
 * `setFromUnitVectors(+Y → up)` leaves yaw free; compose
 * {@link starbasePlateYawRad} so pad +Z is geographic north.
 */
export function placePadOnEarth(pad: THREE.Group): void {
  const local = geodeticToEllipsoidMeshLocal(STARBASE_LAT, STARBASE_LON, EARTH_SURFACE_ALT_KM);
  pad.position.set(local.x, local.y, local.z);
  const up = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, 1);
  const outward = new THREE.Vector3(up.x, up.y, up.z).normalize();
  const qUp = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    starbasePlateYawRad(STARBASE_LAT, STARBASE_LON),
  );
  pad.quaternion.copy(qUp).multiply(qYaw);
}

/**
 * Pad group yaw and origin on the Earth mesh.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import {
  EARTH_SURFACE_ALT_KM, STARBASE_LAT, STARBASE_LAT_DEG, STARBASE_LON,
  STARBASE_LON_DEG,
} from "../physics/constants.ts";
import { geodeticToMeshLocal } from "../physics/earthFrame.ts";
import { geodeticToEllipsoidMeshLocal } from "../physics/wgs84.ts";
import { placePadOnEarth } from "./earthTheater/padPlaceOnEarth.ts";
import {
  OLP2_LAT_DEG,
  OLP2_LON_DEG,
  PAD2_APRON_CORNERS_DEG,
  pad2ApronXz,
  starbasePlatePinFromOlp2,
} from "./earthTheater/starbaseSurvey.ts";
import { STARBASE_PLATE_LAT, STARBASE_PLATE_LON } from "./starbasePlate.ts";

function placeReady(): THREE.Group {
  const pad = new THREE.Group();
  placePadOnEarth(pad);
  pad.updateMatrixWorld(true);
  return pad;
}

describe("placePadOnEarth", () => {
  it("points pad +Z at geographic north and +X west", () => {
    const pad = placeReady();
    const origin = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, 1);
    const up = new THREE.Vector3(origin.x, origin.y, origin.z).normalize();
    const northPt = geodeticToMeshLocal(STARBASE_LAT + 1e-4, STARBASE_LON, 1);
    const geoNorth = new THREE.Vector3(
      northPt.x - origin.x,
      northPt.y - origin.y,
      northPt.z - origin.z,
    );
    geoNorth.addScaledVector(up, -geoNorth.dot(up)).normalize();
    const eastPt = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON + 1e-4, 1);
    const geoEast = new THREE.Vector3(
      eastPt.x - origin.x,
      eastPt.y - origin.y,
      eastPt.z - origin.z,
    );
    geoEast.addScaledVector(up, -geoEast.dot(up)).normalize();
    const padZ = new THREE.Vector3(0, 0, 1).applyQuaternion(pad.quaternion);
    const padX = new THREE.Vector3(1, 0, 0).applyQuaternion(pad.quaternion);
    assert.ok(padZ.dot(geoNorth) > 0.999, `+Z·north=${padZ.dot(geoNorth)}`);
    assert.ok(padX.dot(geoEast) < -0.999, `+X·east=${padX.dot(geoEast)}`);
  });

  it("seats the pad origin on the OLP-2 OLM, not the rounded JPEG pin", () => {
    const pad = placeReady();
    const olm = geodeticToEllipsoidMeshLocal(STARBASE_LAT, STARBASE_LON, EARTH_SURFACE_ALT_KM);
    const miss = Math.hypot(pad.position.x - olm.x, pad.position.y - olm.y, pad.position.z - olm.z);
    assert.ok(miss < 1e-9, `OLM miss ${miss} km`);
    assert.equal(OLP2_LAT_DEG, STARBASE_LAT_DEG);
    assert.equal(OLP2_LON_DEG, STARBASE_LON_DEG);
    const pin = geodeticToEllipsoidMeshLocal(
      STARBASE_PLATE_LAT, STARBASE_PLATE_LON, EARTH_SURFACE_ALT_KM,
    );
    const fromPin = Math.hypot(pad.position.x - pin.x, pad.position.y - pin.y, pad.position.z - pin.z);
    assert.ok(fromPin > 0.2 && fromPin < 0.22, `JPEG pin offset ${fromPin} km`);
  });

  it("puts surveyed apron corners on their WGS84 mesh positions", () => {
    const pad = placeReady();
    const xz = pad2ApronXz();
    let worst = 0;
    for (let i = 0; i < xz.length; i++) {
      const [x, z] = xz[i]!;
      const [latDeg, lonDeg] = PAD2_APRON_CORNERS_DEG[i]!;
      const world = new THREE.Vector3(x, 0, z).applyMatrix4(pad.matrixWorld);
      const want = geodeticToEllipsoidMeshLocal(
        (latDeg * Math.PI) / 180,
        (lonDeg * Math.PI) / 180,
        EARTH_SURFACE_ALT_KM,
      );
      const miss = Math.hypot(world.x - want.x, world.y - want.y, world.z - want.z);
      if (miss > worst) worst = miss;
    }
    assert.ok(worst < 0.003, `worst apron miss ${worst} km`);
  });

  it("keeps the satellite-plate JPEG center on the committed WMS pin", () => {
    const pad = placeReady();
    const pin = starbasePlatePinFromOlp2;
    const world = new THREE.Vector3(pin.x, 0, pin.z).applyMatrix4(pad.matrixWorld);
    const want = geodeticToEllipsoidMeshLocal(
      STARBASE_PLATE_LAT, STARBASE_PLATE_LON, EARTH_SURFACE_ALT_KM,
    );
    const miss = Math.hypot(world.x - want.x, world.y - want.y, world.z - want.z);
    assert.ok(miss < 0.003, `JPEG pin miss ${miss} km`);
  });
});

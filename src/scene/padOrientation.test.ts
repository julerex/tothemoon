/**
 * Pad group yaw and site nudge on the Earth mesh.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { EARTH_SURFACE_ALT_KM, STARBASE_LAT, STARBASE_LON } from "../physics/constants.ts";
import { geodeticToMeshLocal } from "../physics/earthFrame.ts";
import { geodeticToEllipsoidMeshLocal } from "../physics/wgs84.ts";
import {
  PAD_SITE_CLOCKWISE_RAD,
  PAD_SITE_SOUTH_KM,
  PAD_SITE_WEST_KM,
  placePadOnEarth,
} from "./earthTheater/padPlaceOnEarth.ts";

function starbaseEnu(): { up: THREE.Vector3; east: THREE.Vector3; north: THREE.Vector3 } {
  const origin = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, 1);
  const up = new THREE.Vector3(origin.x, origin.y, origin.z).normalize();
  const east = new THREE.Vector3(up.z, 0, -up.x).normalize();
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  return { up, east, north };
}

describe("placePadOnEarth", () => {
  it("yaws pad +Z 10° clockwise from geographic north (looking down)", () => {
    const pad = new THREE.Group();
    placePadOnEarth(pad);
    const { east, north } = starbaseEnu();
    const padZ = new THREE.Vector3(0, 0, 1).applyQuaternion(pad.quaternion);
    const yaw = -PAD_SITE_CLOCKWISE_RAD;
    assert.ok(Math.abs(padZ.dot(north) - Math.cos(yaw)) < 1e-6, `+Z·north=${padZ.dot(north)}`);
    assert.ok(Math.abs(padZ.dot(east) - Math.sin(yaw)) < 1e-6, `+Z·east=${padZ.dot(east)}`);
  });

  it("shifts the pad origin 50 m west and 50 m south of the globe pin", () => {
    const pad = new THREE.Group();
    placePadOnEarth(pad);
    const pin = geodeticToEllipsoidMeshLocal(STARBASE_LAT, STARBASE_LON, EARTH_SURFACE_ALT_KM);
    const { up, east, north } = starbaseEnu();
    const d = new THREE.Vector3(pad.position.x - pin.x, pad.position.y - pin.y, pad.position.z - pin.z);
    assert.ok(Math.abs(d.dot(east) + PAD_SITE_WEST_KM) < 1e-6, `east=${d.dot(east)}`);
    assert.ok(Math.abs(d.dot(north) + PAD_SITE_SOUTH_KM) < 1e-6, `north=${d.dot(north)}`);
    assert.ok(Math.abs(d.dot(up)) < 1e-6, `up=${d.dot(up)}`);
  });
});

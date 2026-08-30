/**
 * Pad group yaw: +Z geographic north, +X west (same as the satellite plates).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { STARBASE_LAT, STARBASE_LON } from "../physics/constants.ts";
import { geodeticToMeshLocal } from "../physics/earthFrame.ts";
import { placePadOnEarth } from "./earthTheater/padLaunchMeshes.ts";

describe("placePadOnEarth yaw", () => {
  it("points pad +Z at geographic north and +X west", () => {
    const pad = new THREE.Group();
    placePadOnEarth(pad);
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
});

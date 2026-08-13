/**
 * Starbase satellite plate yaw + planar UV contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { STARBASE_LAT, STARBASE_LON } from "../physics/constants.ts";
import { geodeticToMeshLocal } from "../physics/earthFrame.ts";
import {
  STARBASE_PLATE_OUTER_KM,
  starbasePlateUv,
  starbasePlateYawRad,
} from "./starbasePlate.ts";

describe("starbasePlateUv", () => {
  it("maps the pad origin to the photo center", () => {
    const [u, v] = starbasePlateUv(0, 0);
    assert.equal(u, 0.5);
    assert.equal(v, 0.5);
  });

  it("maps +X (west) to the left edge and +Z (north) to the top", () => {
    const r = STARBASE_PLATE_OUTER_KM;
    const [uWest, vWest] = starbasePlateUv(r, 0);
    const [uNorth, vNorth] = starbasePlateUv(0, r);
    const [uEast, vEast] = starbasePlateUv(-r, 0);
    const [uSouth, vSouth] = starbasePlateUv(0, -r);
    assert.equal(uWest, 0);
    assert.equal(vWest, 0.5);
    assert.equal(uNorth, 0.5);
    assert.equal(vNorth, 1);
    assert.equal(uEast, 1);
    assert.equal(vEast, 0.5);
    assert.equal(uSouth, 0.5);
    assert.equal(vSouth, 0);
  });

  it("stays in 0…1 on the disc", () => {
    const r = STARBASE_PLATE_OUTER_KM;
    for (const ang of [0, 0.7, 1.4, 2.1, 3.5, 4.8, 5.5]) {
      const [u, v] = starbasePlateUv(r * Math.cos(ang), r * Math.sin(ang));
      assert.ok(u >= 0 && u <= 1, `u=${u}`);
      assert.ok(v >= 0 && v <= 1, `v=${v}`);
    }
  });
});

describe("starbasePlateYawRad", () => {
  it("is finite at Starbase and not a pole fallback", () => {
    const yaw = starbasePlateYawRad();
    assert.ok(Number.isFinite(yaw));
    assert.ok(Math.abs(yaw) > 1e-3);
  });

  it("is −π/2 at the equator / lon 0 (pad +X ← mesh −Y, north is pad −X)", () => {
    const yaw = starbasePlateYawRad(0, 0);
    assert.ok(Math.abs(yaw + Math.PI / 2) < 1e-9, `got ${yaw}`);
  });

  it("returns 0 at the north pole (degenerate east)", () => {
    assert.equal(starbasePlateYawRad(Math.PI / 2, 0), 0);
  });

  it("yaws plate +Z onto geographic north in mesh-local", () => {
    const yaw = starbasePlateYawRad(STARBASE_LAT, STARBASE_LON);
    const pad = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, 1);
    const up = new THREE.Vector3(pad.x, pad.y, pad.z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      up,
    );
    const plateNorthMesh = new THREE.Vector3(
      Math.sin(yaw),
      0,
      Math.cos(yaw),
    ).applyQuaternion(q);

    const north = geodeticToMeshLocal(STARBASE_LAT + 1e-4, STARBASE_LON, 1);
    const geoNorth = new THREE.Vector3(
      north.x - pad.x,
      north.y - pad.y,
      north.z - pad.z,
    ).normalize();
    geoNorth.addScaledVector(up, -geoNorth.dot(up)).normalize();

    assert.ok(
      plateNorthMesh.dot(geoNorth) > 0.999,
      `dot=${plateNorthMesh.dot(geoNorth)}`,
    );
  });

  it("puts plate +X on geographic west (Y-up right-handed, +Z north)", () => {
    const yaw = starbasePlateYawRad(STARBASE_LAT, STARBASE_LON);
    const pad = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, 1);
    const up = new THREE.Vector3(pad.x, pad.y, pad.z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      up,
    );
    const plateEastish = new THREE.Vector3(
      Math.cos(yaw),
      0,
      -Math.sin(yaw),
    ).applyQuaternion(q);

    const eastPt = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON + 1e-4, 1);
    const geoEast = new THREE.Vector3(
      eastPt.x - pad.x,
      eastPt.y - pad.y,
      eastPt.z - pad.z,
    ).normalize();
    geoEast.addScaledVector(up, -geoEast.dot(up)).normalize();

    assert.ok(
      plateEastish.dot(geoEast) < -0.999,
      `dot=${plateEastish.dot(geoEast)} (expected antiparallel to east)`,
    );
  });
});

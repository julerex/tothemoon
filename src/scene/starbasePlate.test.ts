/**
 * Starbase satellite plate yaw, UV, drape, and WMS bbox contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { R_EARTH, STARBASE_LAT, STARBASE_LON } from "../physics/constants.ts";
import {
  STARBASE_PAD_PLATE_HALF_KM,
  STARBASE_PLATE_HALF_KM,
  STARBASE_PLATE_LAT,
  STARBASE_PLATE_LON,
  drapePlatePoint,
  starbasePlateUv,
  starbasePlateWmsBboxDeg,
  starbasePlateYawRad,
} from "./starbasePlate.ts";
import { geodeticToMeshLocal } from "../physics/earthFrame.ts";

describe("starbasePlateUv", () => {
  it("maps the pad origin to the photo center", () => {
    const [u, v] = starbasePlateUv(0, 0);
    assert.equal(u, 0.5);
    assert.equal(v, 0.5);
  });

  it("maps −X (east) to the right edge and +Z (north) to the top", () => {
    const h = STARBASE_PLATE_HALF_KM;
    const [uEast, vEast] = starbasePlateUv(-h, 0);
    const [uNorth, vNorth] = starbasePlateUv(0, h);
    const [uWest, vWest] = starbasePlateUv(h, 0);
    const [uSouth, vSouth] = starbasePlateUv(0, -h);
    assert.equal(uEast, 1);
    assert.equal(vEast, 0.5);
    assert.equal(uNorth, 0.5);
    assert.equal(vNorth, 1);
    assert.equal(uWest, 0);
    assert.equal(vWest, 0.5);
    assert.equal(uSouth, 0.5);
    assert.equal(vSouth, 0);
  });

  it("maps square corners onto the JPEG corners", () => {
    const h = STARBASE_PLATE_HALF_KM;
    const [uNe, vNe] = starbasePlateUv(-h, h);
    assert.equal(uNe, 1);
    assert.equal(vNe, 1);
    const [uSw, vSw] = starbasePlateUv(h, -h);
    assert.equal(uSw, 0);
    assert.equal(vSw, 0);
  });

  it("stays in 0…1 on the square including corners", () => {
    const h = STARBASE_PLATE_HALF_KM;
    for (const [x, z] of [
      [h, 0],
      [0, h],
      [-h, 0],
      [0, -h],
      [h, h],
      [h, -h],
      [-h, h],
      [-h, -h],
    ] as const) {
      const [u, v] = starbasePlateUv(x, z);
      assert.ok(u >= 0 && u <= 1, `u=${u}`);
      assert.ok(v >= 0 && v <= 1, `v=${v}`);
    }
  });
});

describe("drapePlatePoint", () => {
  it("leaves the pad origin on the tangent plane", () => {
    const p = drapePlatePoint(0, 0, R_EARTH);
    assert.ok(Math.abs(p.x) < 1e-12);
    assert.ok(Math.abs(p.y) < 1e-12);
    assert.ok(Math.abs(p.z) < 1e-12);
  });

  it("sinks the square edge toward Earth center", () => {
    const p = drapePlatePoint(STARBASE_PLATE_HALF_KM, 0, R_EARTH);
    assert.ok(p.y < -0.05, `y=${p.y}`);
    assert.ok(Math.abs(p.z) < 1e-9);
    assert.ok(p.x > 0);
  });

  it("keeps draped points on the sphere through Earth center", () => {
    const p = drapePlatePoint(STARBASE_PLATE_HALF_KM, STARBASE_PLATE_HALF_KM, R_EARTH);
    const dist = Math.hypot(p.x, p.y + R_EARTH, p.z);
    assert.ok(Math.abs(dist - R_EARTH) < 1e-6, `dist=${dist}`);
  });
});

describe("starbasePlateWmsBboxDeg", () => {
  it("is a lon/lat square centered on the committed JPEG pin", () => {
    const b = starbasePlateWmsBboxDeg();
    const lat0 = STARBASE_PLATE_LAT * (180 / Math.PI);
    const lon0 = STARBASE_PLATE_LON * (180 / Math.PI);
    assert.ok(Math.abs((b.minLat + b.maxLat) / 2 - lat0) < 1e-9);
    assert.ok(Math.abs((b.minLon + b.maxLon) / 2 - lon0) < 1e-9);
    assert.ok(b.maxLat - b.minLat > 0.4, "wider than the old ~0.14° disc");
    assert.ok(b.maxLon - b.minLon > 0.4);
  });

  it("nests the NAIP pad plate inside the wide surrounds bbox", () => {
    const wide = starbasePlateWmsBboxDeg();
    const pad = starbasePlateWmsBboxDeg(STARBASE_PAD_PLATE_HALF_KM);
    assert.ok(pad.minLon > wide.minLon);
    assert.ok(pad.maxLon < wide.maxLon);
    assert.ok(pad.minLat > wide.minLat);
    assert.ok(pad.maxLat < wide.maxLat);
    assert.ok(STARBASE_PAD_PLATE_HALF_KM * 10 === STARBASE_PLATE_HALF_KM);
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

  it("puts plate +X west when +Z is north (right-handed +Y up)", () => {
    const yaw = starbasePlateYawRad();
    // rotation.y: +Z → (sin, 0, cos), +X → (cos, 0, −sin)
    const plateX = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const plateZ = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const east = new THREE.Vector3().crossVectors(
      plateZ,
      new THREE.Vector3(0, 1, 0),
    );
    assert.ok(plateX.dot(east) < -0.999, `+X·east=${plateX.dot(east)}`);
    const [uEast] = starbasePlateUv(-STARBASE_PLATE_HALF_KM, 0);
    const [uWest] = starbasePlateUv(STARBASE_PLATE_HALF_KM, 0);
    assert.equal(uEast, 1, "geographic east (−X) is the JPEG right edge");
    assert.equal(uWest, 0, "geographic west (+X) is the JPEG left edge");
  });
});

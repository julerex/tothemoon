/**
 * WGS84 theater ellipsoid: poles / equator, pad shell, inertial altitude.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bodyPositions } from "./bodies.ts";
import {
  EARTH_SURFACE_ALT_KM,
  STARBASE_LAT,
  STARBASE_LON,
  WGS84_A_KM,
  WGS84_B_KM,
} from "./constants.ts";
import { earthNorthPole, geodeticToMeshLocal, starbasePadState } from "./earthFrame.ts";
import { dist } from "./vec3.ts";
import {
  earthSurfaceRadiusAlong,
  ellipsoidalHeightKm,
  ellipsoidRadiusAlong,
  ellipsoidRadiusMeshLocal,
  WGS84_MESH_Y_SCALE,
} from "./wgs84.ts";

describe("WGS84 theater ellipsoid", () => {
  it("has flattening that matches a(1−f) → b", () => {
    assert.ok(Math.abs(WGS84_MESH_Y_SCALE - WGS84_B_KM / WGS84_A_KM) < 1e-15);
    assert.ok(WGS84_B_KM < WGS84_A_KM);
    assert.ok(Math.abs(WGS84_B_KM - 6356.752) < 0.01);
  });

  it("places poles at b and the equator at a (mesh-local)", () => {
    assert.ok(Math.abs(ellipsoidRadiusMeshLocal(0, 1, 0) - WGS84_B_KM) < 1e-9);
    assert.ok(Math.abs(ellipsoidRadiusMeshLocal(1, 0, 0) - WGS84_A_KM) < 1e-9);
    assert.ok(Math.abs(ellipsoidRadiusMeshLocal(0, 0, 1) - WGS84_A_KM) < 1e-9);
  });

  it("matches geodeticToMeshLocal at height 0", () => {
    const p = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, 0);
    const r = Math.hypot(p.x, p.y, p.z);
    assert.ok(Math.abs(r - ellipsoidRadiusMeshLocal(p.x, p.y, p.z)) < 1e-9);
  });

  it("adds height along the geocentric radial", () => {
    const p0 = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, 0);
    const pH = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, EARTH_SURFACE_ALT_KM);
    const r0 = Math.hypot(p0.x, p0.y, p0.z);
    const rH = Math.hypot(pH.x, pH.y, pH.z);
    assert.ok(Math.abs(rH - (r0 + EARTH_SURFACE_ALT_KM)) < 1e-9);
    const u0 = { x: p0.x / r0, y: p0.y / r0, z: p0.z / r0 };
    const uH = { x: pH.x / rH, y: pH.y / rH, z: pH.z / rH };
    assert.ok(Math.abs(u0.x - uH.x) + Math.abs(u0.y - uH.y) + Math.abs(u0.z - uH.z) < 1e-12);
  });

  it("inertial equator (perp to north pole) is a; along-pole is b", () => {
    const n = earthNorthPole();
    const eq = { x: 0, y: -n.z, z: n.y };
    assert.ok(Math.abs(ellipsoidRadiusAlong(eq) - WGS84_A_KM) < 1e-9);
    assert.ok(Math.abs(ellipsoidRadiusAlong(n) - WGS84_B_KM) < 1e-9);
    assert.ok(Math.abs(ellipsoidalHeightKm({ x: WGS84_A_KM, y: 0, z: 0 })) < 1e-6);
  });

  it("pad inertial radius matches the surface shell at Starbase", () => {
    const t = 0;
    const pad = starbasePadState(t);
    const earth = bodyPositions(t).earth;
    const rel = {
      x: pad.pos.x - earth.x,
      y: pad.pos.y - earth.y,
      z: pad.pos.z - earth.z,
    };
    const r = dist(pad.pos, earth);
    assert.ok(
      Math.abs(r - earthSurfaceRadiusAlong(rel)) < 1e-6,
      `pad r ${r} vs shell ${earthSurfaceRadiusAlong(rel)}`,
    );
    assert.ok(Math.abs(ellipsoidalHeightKm(rel) - EARTH_SURFACE_ALT_KM) < 1e-6);
  });
});

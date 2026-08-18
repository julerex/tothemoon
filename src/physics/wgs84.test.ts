/**
 * WGS84 ellipsoid contract: polar flattening, Starbase radius, mesh mapping.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EARTH_SURFACE_ALT_KM, R_EARTH, STARBASE_LAT } from "./constants.ts";
import {
  clampAboveEllipsoid,
  earthSurfaceRadiusAlong,
  ellipsoidRadiusAtGeocentricLat,
  geocentricRadiusAt,
  geodeticToEllipsoidMeshLocal,
  primeVerticalRadius,
  radialHeightAboveEllipsoid,
  spherePointToWgs84,
  WGS84_A,
  WGS84_B,
  WGS84_E2,
} from "./wgs84.ts";
import { len, v3 } from "./vec3.ts";

describe("WGS84 constants", () => {
  it("is oblate: equator longer than the pole, mean radius in between", () => {
    assert.ok(WGS84_A > R_EARTH);
    assert.ok(WGS84_B < R_EARTH);
    assert.ok(Math.abs(ellipsoidRadiusAtGeocentricLat(0) - WGS84_A) < 1e-6);
    assert.ok(Math.abs(ellipsoidRadiusAtGeocentricLat(Math.PI / 2) - WGS84_B) < 1e-6);
  });

  it("prime vertical at the equator is the semi-major axis", () => {
    assert.ok(Math.abs(primeVerticalRadius(0) - WGS84_A) < 1e-9);
    assert.ok(WGS84_E2 > 0 && WGS84_E2 < 0.01);
  });
});

describe("geodeticToEllipsoidMeshLocal", () => {
  it("places the equator at lon 0 on +X at radius a", () => {
    const p = geodeticToEllipsoidMeshLocal(0, 0, 0);
    assert.ok(Math.abs(p.y) < 1e-9);
    assert.ok(Math.abs(p.z) < 1e-9);
    assert.ok(Math.abs(p.x - WGS84_A) < 1e-6);
  });

  it("places the north pole on +Y at radius b", () => {
    const p = geodeticToEllipsoidMeshLocal(Math.PI / 2, 0, 0);
    assert.ok(Math.abs(p.x) < 1e-6);
    assert.ok(Math.abs(p.z) < 1e-6);
    assert.ok(Math.abs(p.y - WGS84_B) < 1e-6);
  });

  it("puts Starbase several km outside the mean sphere", () => {
    const r = geocentricRadiusAt(STARBASE_LAT, EARTH_SURFACE_ALT_KM);
    assert.ok(r > R_EARTH + 2, `Starbase geocentric r=${r}`);
    assert.ok(r < WGS84_A + 1);
  });
});

describe("radial height / clamp", () => {
  const north = v3(0, 1, 0);
  const earth = v3(0, 0, 0);

  it("is ~0 on the equator surface and ~height along the same ray", () => {
    const surf = v3(WGS84_A, 0, 0);
    assert.ok(Math.abs(radialHeightAboveEllipsoid(surf, north)) < 1e-6);
    const high = v3(WGS84_A + 10, 0, 0);
    assert.ok(Math.abs(radialHeightAboveEllipsoid(high, north) - 10) < 1e-6);
  });

  it("clamps under-surface equatorial points onto the ellipsoid + height", () => {
    const pos = v3(WGS84_A - 5, 0, 0);
    const out = clampAboveEllipsoid(pos, earth, north, 0.05);
    assert.ok(Math.abs(len(out) - (WGS84_A + 0.05)) < 1e-6);
  });

  it("leaves points already above the surface unchanged", () => {
    const pos = v3(WGS84_A + 20, 0, 0);
    assert.equal(clampAboveEllipsoid(pos, earth, north), pos);
  });

  it("surface radius along a polar ray is b + height", () => {
    const rel = v3(0, 100, 0);
    const r = earthSurfaceRadiusAlong(rel, north, 0.05);
    assert.ok(Math.abs(r - (WGS84_B + 0.05)) < 1e-6);
  });
});

describe("spherePointToWgs84", () => {
  it("maps a mean-sphere equator vertex onto a", () => {
    const p = spherePointToWgs84(R_EARTH, 0, 0);
    assert.ok(Math.abs(p.x - WGS84_A) < 1e-4);
    assert.ok(Math.abs(p.y) < 1e-4);
  });

  it("maps a mean-sphere north pole onto b", () => {
    const p = spherePointToWgs84(0, R_EARTH, 0);
    assert.ok(Math.abs(p.y - WGS84_B) < 1e-4);
    assert.ok(Math.abs(p.x) < 1e-4);
  });
});

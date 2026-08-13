import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TRAIL_STYLE_IDLE,
  TRAIL_STYLE_LOI,
  TRAIL_STYLE_COAST,
  TRAIL_STYLE_APPROACH,
  attitudeNearEarth,
  clampCraftAboveEarth,
  craftTrailStyle,
  isNearEarthPhase,
  relativeSpeedKmS,
  shouldClampAboveEarth,
  sunElevAtPad,
  telemetryAltitudeKm,
} from "./frameDerive.ts";
import { WGS84_A_KM, EARTH_SURFACE_ALT_KM } from "../physics/constants.ts";
import { earthSurfaceRadiusAlong } from "../physics/wgs84.ts";

describe("clampCraftAboveEarth", () => {
  const earth = { x: 0, y: 0, z: 0 };

  it("leaves positions above the ellipsoid unchanged", () => {
    const pos = { x: WGS84_A_KM + 10, y: 0, z: 0 };
    assert.equal(clampCraftAboveEarth(pos, earth), pos);
  });

  it("lifts under-surface equatorial samples to a + pad height", () => {
    const pos = { x: WGS84_A_KM - 5, y: 0, z: 0 };
    const out = clampCraftAboveEarth(pos, earth);
    const want = earthSurfaceRadiusAlong(pos);
    assert.ok(Math.abs(Math.hypot(out.x, out.y, out.z) - want) < 1e-9);
    assert.ok(out.x > 0);
    assert.ok(Math.abs(want - (WGS84_A_KM + EARTH_SURFACE_ALT_KM)) < 1e-6);
  });

  it("returns original for zero-length relative vector", () => {
    const pos = { x: 0, y: 0, z: 0 };
    assert.equal(clampCraftAboveEarth(pos, earth), pos);
  });
});

describe("phase / attitude helpers", () => {
  it("isNearEarthPhase covers ascent stack only", () => {
    assert.equal(isNearEarthPhase("ascent"), true);
    assert.equal(isNearEarthPhase("translunarInjection"), true);
    assert.equal(isNearEarthPhase("coast"), false);
    assert.equal(isNearEarthPhase("approach"), false);
  });

  it("attitudeNearEarth includes low alt even on coast", () => {
    assert.equal(attitudeNearEarth("coast", 400), true);
    assert.equal(attitudeNearEarth("coast", 60_000), false);
    assert.equal(attitudeNearEarth("ascent", 200_000), true);
  });

  it("shouldClampAboveEarth matches near-Earth phases", () => {
    assert.equal(shouldClampAboveEarth("lowEarthOrbit"), true);
    assert.equal(shouldClampAboveEarth("descent"), false);
  });
});

describe("craftTrailStyle", () => {
  it("uses LOI style only during approach burn", () => {
    assert.equal(craftTrailStyle(false, "approach", true), TRAIL_STYLE_LOI);
    assert.equal(craftTrailStyle(false, "approach", false), TRAIL_STYLE_APPROACH);
    assert.equal(craftTrailStyle(true, "approach", true), TRAIL_STYLE_IDLE);
    assert.equal(craftTrailStyle(false, "coast", true), TRAIL_STYLE_COAST);
    assert.equal(craftTrailStyle(false, "ascent", true), TRAIL_STYLE_IDLE);
  });
});

describe("sunElevAtPad", () => {
  it("is +1 when sun and pad-up align", () => {
    const earth = { x: 0, y: 0, z: 0 };
    const sun = { x: 1, y: 0, z: 0 };
    const pad = { x: 1, y: 0, z: 0 };
    assert.ok(Math.abs(sunElevAtPad(sun, earth, pad) - 1) < 1e-12);
  });

  it("is −1 when sun is anti-aligned with pad-up", () => {
    const earth = { x: 0, y: 0, z: 0 };
    const sun = { x: -1, y: 0, z: 0 };
    const pad = { x: 1, y: 0, z: 0 };
    assert.ok(Math.abs(sunElevAtPad(sun, earth, pad) + 1) < 1e-12);
  });
});

describe("telemetryAltitudeKm", () => {
  it("prefers Earth altitude on coast when far from Moon", () => {
    assert.equal(
      telemetryAltitudeKm("coast", 200_000, 400, 50),
      400,
    );
  });

  it("prefers Moon altitude near the Moon", () => {
    assert.equal(
      telemetryAltitudeKm("coast", 50_000, 400, 80),
      80,
    );
    assert.equal(
      telemetryAltitudeKm("descent", 200_000, 400, 12),
      12,
    );
  });
});

describe("relativeSpeedKmS", () => {
  it("returns Euclidean relative speed", () => {
    const v = relativeSpeedKmS(
      { x: 3, y: 4, z: 0 },
      { x: 0, y: 0, z: 0 },
    );
    assert.ok(Math.abs(v - 5) < 1e-12);
  });
});

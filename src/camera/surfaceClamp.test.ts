import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { R_MOON, R_SUN, STARBASE_ALT, STARBASE_LAT } from "../physics/constants.ts";
import { len } from "../physics/vec3.ts";
import {
  earthSurfaceRadiusAlong,
  geodeticToEllipsoidMeshLocal,
  WGS84_A,
} from "../physics/wgs84.ts";
import {
  clampOutsideBodies,
  pushOutsideSpheres,
  solarSystemExclusionSpheres,
  SURFACE_CLEARANCE_KM,
} from "./surfaceClamp.ts";

const origin = { x: 0, y: 0, z: 0 };
const meshNorth = { x: 0, y: 1, z: 0 };

function farBodies() {
  return {
    sun: { x: 1e8, y: 0, z: 0 },
    earth: origin,
    moon: { x: 0, y: 0, z: 4e5 },
    north: meshNorth,
    sunRadius: R_SUN,
    moonRadius: R_MOON,
  };
}

describe("pushOutsideSpheres", () => {
  it("leaves points outside unchanged", () => {
    const out = { x: 0, y: 0, z: 0 };
    const moved = pushOutsideSpheres(
      { x: 10, y: 0, z: 0 },
      [{ x: 0, y: 0, z: 0, r: 5 }],
      out,
    );
    assert.equal(moved, false);
    assert.deepEqual(out, { x: 10, y: 0, z: 0 });
  });

  it("pushes points inside out along the radial direction", () => {
    const out = { x: 0, y: 0, z: 0 };
    const moved = pushOutsideSpheres(
      { x: 1, y: 0, z: 0 },
      [{ x: 0, y: 0, z: 0, r: 5 }],
      out,
    );
    assert.equal(moved, true);
    assert.ok(Math.abs(out.x - 5) < 1e-9);
    assert.ok(Math.abs(out.y) < 1e-9);
    assert.ok(Math.abs(out.z) < 1e-9);
  });

  it("handles a camera exactly at the body center", () => {
    const out = { x: 0, y: 0, z: 0 };
    const moved = pushOutsideSpheres(
      { x: 2, y: 3, z: 4 },
      [{ x: 2, y: 3, z: 4, r: 7 }],
      out,
    );
    assert.equal(moved, true);
    const dx = out.x - 2;
    const dy = out.y - 3;
    const dz = out.z - 4;
    assert.ok(Math.abs(Math.hypot(dx, dy, dz) - 7) < 1e-9);
  });

  it("applies multiple spheres (innermost violation wins per pass order)", () => {
    // Inside earth-like shell; sun far away
    const out = { x: 0, y: 0, z: 0 };
    const moved = pushOutsideSpheres(
      { x: 1, y: 0, z: 0 },
      [
        { x: 1000, y: 0, z: 0, r: 10 },
        { x: 0, y: 0, z: 0, r: 5 },
      ],
      out,
    );
    assert.equal(moved, true);
    assert.ok(Math.abs(out.x - 5) < 1e-9);
  });

  it("is a no-op for empty body list", () => {
    const out = { x: 1, y: 2, z: 3 };
    assert.equal(pushOutsideSpheres({ x: 1, y: 2, z: 3 }, [], out), false);
    assert.deepEqual(out, { x: 1, y: 2, z: 3 });
  });
});

describe("solarSystemExclusionSpheres", () => {
  it("includes clearance on each radius", () => {
    const spheres = solarSystemExclusionSpheres(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { sun: 100, earth: 10, moon: 3 },
    );
    assert.equal(spheres.length, 3);
    assert.equal(spheres[0]!.r, 100 + SURFACE_CLEARANCE_KM);
    assert.equal(spheres[1]!.r, 10 + SURFACE_CLEARANCE_KM);
    assert.equal(spheres[2]!.r, 3 + SURFACE_CLEARANCE_KM);
    assert.equal(spheres[1]!.x, 1);
    assert.equal(spheres[2]!.x, 2);
  });
});

describe("clampOutsideBodies (Earth ellipsoid)", () => {
  it("does not push a camera sitting on the Starbase pad shell", () => {
    const pad = geodeticToEllipsoidMeshLocal(STARBASE_LAT, 0, STARBASE_ALT);
    const out = { x: pad.x, y: pad.y, z: pad.z };
    const moved = clampOutsideBodies(pad, farBodies(), out);
    assert.equal(moved, false);
    assert.ok(Math.abs(out.x - pad.x) < 1e-9);
    assert.ok(Math.abs(out.y - pad.y) < 1e-9);
    assert.ok(Math.abs(out.z - pad.z) < 1e-9);
  });

  it("lifts a point 1 km under Starbase onto the ellipsoid + clearance", () => {
    const surf = geodeticToEllipsoidMeshLocal(STARBASE_LAT, 0, 0);
    const r = len(surf);
    const s = (r - 1) / r;
    const pos = { x: surf.x * s, y: surf.y * s, z: surf.z * s };
    const out = { x: 0, y: 0, z: 0 };
    const moved = clampOutsideBodies(pos, farBodies(), out);
    assert.equal(moved, true);
    const expected = earthSurfaceRadiusAlong(pos, meshNorth, SURFACE_CLEARANCE_KM);
    assert.ok(Math.abs(len(out) - expected) < 1e-6);
  });

  it("still lifts an equatorial under-surface point to WGS84_A + clearance", () => {
    const pos = { x: WGS84_A - 5, y: 0, z: 0 };
    const out = { x: 0, y: 0, z: 0 };
    const moved = clampOutsideBodies(pos, farBodies(), out);
    assert.equal(moved, true);
    assert.ok(Math.abs(len(out) - (WGS84_A + SURFACE_CLEARANCE_KM)) < 1e-6);
    assert.ok(Math.abs(out.y) < 1e-9);
    assert.ok(Math.abs(out.z) < 1e-9);
  });

  it("still pops a camera out of the Moon sphere", () => {
    const moon = { x: 0, y: 0, z: 4e5 };
    const pos = { x: 1, y: 0, z: 4e5 };
    const out = { x: 0, y: 0, z: 0 };
    const moved = clampOutsideBodies(pos, farBodies(), out);
    assert.equal(moved, true);
    const d = Math.hypot(out.x - moon.x, out.y - moon.y, out.z - moon.z);
    assert.ok(Math.abs(d - (R_MOON + SURFACE_CLEARANCE_KM)) < 1e-6);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pushOutsideSpheres,
  solarSystemExclusionSpheres,
  SURFACE_CLEARANCE_KM,
} from "./surfaceClamp.ts";

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

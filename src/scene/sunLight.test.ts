import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unitToward } from "./sunLight.ts";

describe("unitToward", () => {
  it("returns a unit vector toward the target", () => {
    const u = unitToward({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 });
    assert.ok(Math.abs(u.x - 1) < 1e-12);
    assert.ok(Math.abs(u.y) < 1e-12);
    assert.ok(Math.abs(u.z) < 1e-12);
  });

  it("normalizes arbitrary offsets", () => {
    const u = unitToward({ x: 1, y: 1, z: 1 }, { x: 4, y: 5, z: 1 });
    const len = Math.hypot(u.x, u.y, u.z);
    assert.ok(Math.abs(len - 1) < 1e-12);
    // Direction should be along (3, 4, 0)
    assert.ok(Math.abs(u.x - 0.6) < 1e-12);
    assert.ok(Math.abs(u.y - 0.8) < 1e-12);
    assert.ok(Math.abs(u.z) < 1e-12);
  });

  it("falls back when from ≈ to", () => {
    const u = unitToward({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 });
    assert.deepEqual(u, { x: 1, y: 0, z: 0 });
  });
});

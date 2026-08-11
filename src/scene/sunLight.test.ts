import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyEarthshine,
  applyFillLight,
  applySunLight,
  unitToward,
} from "./sunLight.ts";

/** Minimal stand-in for THREE.DirectionalLight (position + target only). */
function mockDirLight() {
  const position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  } };
  const targetPos = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  } };
  let matrixUpdated = 0;
  return {
    position,
    target: {
      position: targetPos,
      updateMatrixWorld() {
        matrixUpdated++;
      },
    },
    get matrixUpdates() {
      return matrixUpdated;
    },
  };
}

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

describe("applySunLight", () => {
  it("places the light one unit sunward of Earth and aims at Earth", () => {
    const light = mockDirLight();
    const earth = { x: 10, y: 0, z: 0 };
    const sun = { x: 20, y: 0, z: 0 };
    const u = applySunLight(light as never, sun, earth);
    assert.ok(Math.abs(u.x - 1) < 1e-12);
    assert.ok(Math.abs(light.position.x - 11) < 1e-12);
    assert.equal(light.target.position.x, 10);
    assert.ok(light.matrixUpdates >= 1);
  });

  it("writes outUnit when provided", () => {
    const light = mockDirLight();
    const out = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    } };
    applySunLight(
      light as never,
      { x: 0, y: 5, z: 0 },
      { x: 0, y: 0, z: 0 },
      out as never,
    );
    assert.ok(Math.abs(out.y - 1) < 1e-12);
  });
});

describe("applyFillLight", () => {
  it("places fill on the anti-sun side of Earth", () => {
    const fill = mockDirLight();
    const earth = { x: 0, y: 0, z: 0 };
    const sunUnit = { x: 1, y: 0, z: 0 };
    applyFillLight(fill as never, sunUnit, earth);
    assert.ok(Math.abs(fill.position.x - -1) < 1e-12);
    assert.equal(fill.target.position.x, 0);
    assert.ok(fill.matrixUpdates >= 1);
  });
});

describe("applyEarthshine", () => {
  it("aims Earthshine from Earth toward the Moon", () => {
    const es = mockDirLight();
    const earth = { x: 0, y: 0, z: 0 };
    const moon = { x: 0, y: 0, z: 10 };
    applyEarthshine(es as never, earth, moon);
    // One unit Earthward of Moon → z = 10 - 1 = 9
    assert.ok(Math.abs(es.position.z - 9) < 1e-12);
    assert.equal(es.target.position.z, 10);
    assert.ok(es.matrixUpdates >= 1);
  });
});

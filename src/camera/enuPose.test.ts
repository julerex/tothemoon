import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eastFromNorthUp, enuOffsetKm, northFromEastUp } from "./enuPose.ts";

const EAST = { x: 1, y: 0, z: 0 };
const NORTH = { x: 0, y: 1, z: 0 };
const UP = { x: 0, y: 0, z: 1 };

describe("enuOffsetKm", () => {
  it("places the camera east of the target at azimuth 0, elevation 0", () => {
    const o = enuOffsetKm(EAST, NORTH, UP, 0, 0, 2);
    assert.ok(Math.abs(o.x - 2) < 1e-9);
    assert.ok(Math.abs(o.y) < 1e-9);
    assert.ok(Math.abs(o.z) < 1e-9);
  });

  it("places the camera west at azimuth 180 (pad opening inland)", () => {
    const o = enuOffsetKm(EAST, NORTH, UP, 180, 0, 1);
    assert.ok(Math.abs(o.x + 1) < 1e-9);
    assert.ok(Math.abs(o.y) < 1e-9);
  });

  it("places the camera south at azimuth 270", () => {
    const o = enuOffsetKm(EAST, NORTH, UP, 270, 0, 1);
    assert.ok(Math.abs(o.x) < 1e-9);
    assert.ok(Math.abs(o.y + 1) < 1e-9);
  });

  it("lifts along up at 90° elevation", () => {
    const o = enuOffsetKm(EAST, NORTH, UP, 0, 90, 3);
    assert.ok(Math.abs(o.x) < 1e-9);
    assert.ok(Math.abs(o.y) < 1e-9);
    assert.ok(Math.abs(o.z - 3) < 1e-9);
  });
});

describe("northFromEastUp / eastFromNorthUp", () => {
  it("recovers ENU north from east × up", () => {
    const n = northFromEastUp(EAST, UP);
    assert.ok(Math.abs(n.x) < 1e-9);
    assert.ok(Math.abs(n.y - 1) < 1e-9);
    assert.ok(Math.abs(n.z) < 1e-9);
  });

  it("recovers east from north × up", () => {
    const e = eastFromNorthUp(NORTH, UP);
    assert.ok(Math.abs(e.x - 1) < 1e-9);
    assert.ok(Math.abs(e.y) < 1e-9);
    assert.ok(Math.abs(e.z) < 1e-9);
  });
});

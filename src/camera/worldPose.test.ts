import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseVec3Input,
  readCameraWorldPose,
  resolveCameraWorldPose,
  type CameraWorldPose,
} from "./worldPose.ts";

function pose(over: Partial<CameraWorldPose> = {}): CameraWorldPose {
  return {
    mode: "chase",
    position: { x: 0, y: 0, z: 10 },
    target: { x: 0, y: 0, z: 0 },
    look: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 0, z: 1 },
    fov: 50,
    near: 0.05,
    far: 1e6,
    distance: 10,
    ...over,
  };
}

describe("readCameraWorldPose", () => {
  it("points look at the OrbitControls target and reports distance", () => {
    const cam = readCameraWorldPose({
      mode: "starbase",
      position: { x: 3, y: 4, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 0, z: 1 },
      fov: 50,
      near: 0.1,
      far: 100,
    });
    assert.equal(cam.mode, "starbase");
    assert.equal(cam.distance, 5);
    assert.ok(Math.abs(cam.look.x + 0.6) < 1e-12);
    assert.ok(Math.abs(cam.look.y + 0.8) < 1e-12);
    assert.ok(Math.abs(cam.look.z) < 1e-12);
    assert.equal(cam.fov, 50);
  });

  it("falls back to −Z look when position coincides with the target", () => {
    const cam = readCameraWorldPose({
      mode: "free",
      position: { x: 1, y: 2, z: 3 },
      target: { x: 1, y: 2, z: 3 },
    });
    assert.equal(cam.distance, 0);
    assert.deepEqual(cam.look, { x: 0, y: 0, z: -1 });
  });
});

describe("parseVec3Input", () => {
  it("accepts arrays, objects, and partial merges", () => {
    assert.deepEqual(parseVec3Input([1, 2, 3], { x: 0, y: 0, z: 0 }), {
      x: 1,
      y: 2,
      z: 3,
    });
    assert.deepEqual(parseVec3Input({ x: 9 }, { x: 1, y: 2, z: 3 }), {
      x: 9,
      y: 2,
      z: 3,
    });
    assert.equal(parseVec3Input("nope", { x: 0, y: 0, z: 0 }), null);
    assert.equal(parseVec3Input([1, 2], { x: 0, y: 0, z: 0 }), null);
  });
});

describe("resolveCameraWorldPose", () => {
  it("moves only the camera when position is set", () => {
    const next = resolveCameraWorldPose(pose(), {
      position: { x: 10, y: 0, z: 0 },
    });
    assert.deepEqual(next.position, { x: 10, y: 0, z: 0 });
    assert.deepEqual(next.target, { x: 0, y: 0, z: 0 });
    assert.ok(Math.abs(next.look.x + 1) < 1e-12);
    assert.equal(next.mode, "free");
  });

  it("retargets look-at without moving the camera", () => {
    const next = resolveCameraWorldPose(pose(), { target: [0, 10, 10] });
    assert.deepEqual(next.position, { x: 0, y: 0, z: 10 });
    assert.deepEqual(next.target, { x: 0, y: 10, z: 10 });
    assert.equal(next.fov, 50);
  });

  it("places the target along look at the current focus distance", () => {
    const next = resolveCameraWorldPose(pose(), { look: { x: 1, y: 0, z: 0 } });
    assert.deepEqual(next.position, { x: 0, y: 0, z: 10 });
    assert.ok(Math.abs(next.target.x - 10) < 1e-12);
    assert.ok(Math.abs(next.target.y) < 1e-12);
    assert.ok(Math.abs(next.target.z - 10) < 1e-12);
    assert.ok(Math.abs(next.look.x - 1) < 1e-12);
    assert.equal(next.distance, 10);
  });

  it("lets an explicit target win over look", () => {
    const next = resolveCameraWorldPose(pose(), {
      target: { x: 0, y: 4, z: 0 },
      look: { x: 1, y: 0, z: 0 },
    });
    assert.deepEqual(next.target, { x: 0, y: 4, z: 0 });
  });

  it("overrides fov and up when given", () => {
    const next = resolveCameraWorldPose(pose(), { fov: 80, up: [0, 1, 0] });
    assert.equal(next.fov, 80);
    assert.deepEqual(next.up, { x: 0, y: 1, z: 0 });
  });
});

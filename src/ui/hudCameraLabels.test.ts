import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMERA_CYCLE,
  CAMERA_LABELS,
  cycleCameraMode,
} from "./hudCameraLabels.ts";

describe("CAMERA_CYCLE", () => {
  it("has a HUD title for every cycled mode", () => {
    for (const mode of CAMERA_CYCLE) {
      assert.ok(CAMERA_LABELS[mode].title.length > 0);
    }
  });
});

describe("cycleCameraMode", () => {
  it("steps forward and backward along CAMERA_CYCLE", () => {
    assert.equal(cycleCameraMode("sun", 1), "moon");
    assert.equal(cycleCameraMode("moon", -1), "sun");
    assert.equal(cycleCameraMode("hull", 1), "sun");
    assert.equal(cycleCameraMode("sun", -1), "hull");
  });

  it("starts at the first/last mode from an unknown focus", () => {
    assert.equal(cycleCameraMode("free", 1), "sun");
    assert.equal(cycleCameraMode("free", -1), "hull");
  });
});

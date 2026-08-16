import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMERA_CYCLE,
  CAMERA_DIGIT_MODES,
  CAMERA_LABELS,
  cycleCameraMode,
} from "./hudCameraLabels.ts";

describe("CAMERA_DIGIT_MODES", () => {
  it("maps 1–9 onto CAMERA_CYCLE in order", () => {
    assert.equal(Object.keys(CAMERA_DIGIT_MODES).length, CAMERA_CYCLE.length);
    for (let i = 0; i < CAMERA_CYCLE.length; i++) {
      assert.equal(CAMERA_DIGIT_MODES[String(i + 1)], CAMERA_CYCLE[i]);
    }
  });

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

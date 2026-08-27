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
  it("starts with Sun / Earth / Moon, then Flight 13 webcast first-use order", () => {
    assert.deepEqual(CAMERA_CYCLE.slice(0, 6), [
      "sun",
      "earth",
      "moon",
      "aerial",
      "starbase",
      "trench",
    ]);
    assert.equal(CAMERA_CYCLE[6], "chase");
    assert.equal(CAMERA_CYCLE[7], "enginesDown");
    assert.equal(CAMERA_CYCLE.at(-1), "drone");
  });

  it("steps forward and backward along CAMERA_CYCLE", () => {
    assert.equal(cycleCameraMode("sun", 1), "earth");
    assert.equal(cycleCameraMode("earth", 1), "moon");
    assert.equal(cycleCameraMode("moon", 1), "aerial");
    assert.equal(cycleCameraMode("moon", -1), "earth");
    assert.equal(cycleCameraMode("earth", -1), "sun");
    assert.equal(cycleCameraMode("aerial", 1), "starbase");
    assert.equal(cycleCameraMode("starbase", 1), "trench");
    assert.equal(cycleCameraMode("fin", 1), "drone");
    assert.equal(cycleCameraMode("drone", 1), "sun");
    assert.equal(cycleCameraMode("sun", -1), "drone");
  });

  it("starts at the first/last mode from an unknown focus", () => {
    assert.equal(cycleCameraMode("free", 1), "sun");
    assert.equal(cycleCameraMode("free", -1), "drone");
  });
});

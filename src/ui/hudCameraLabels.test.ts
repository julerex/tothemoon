import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXED_CAMERAS, FREE_LOOK_CAMERAS } from "../camera/cameraMode.ts";
import {
  CAMERA_CYCLE,
  CAMERA_LABELS,
  cycleCameraMode,
  FIXED_CAM_LOCK_NOTE,
} from "./hudCameraLabels.ts";

describe("CAMERA_CYCLE", () => {
  it("has a HUD title for every cycled mode", () => {
    for (const mode of CAMERA_CYCLE) {
      assert.ok(CAMERA_LABELS[mode].title.length > 0);
    }
  });

  it("is the free rail then the fixed rail", () => {
    assert.deepEqual([...CAMERA_CYCLE], [...FREE_LOOK_CAMERAS, ...FIXED_CAMERAS]);
  });
});

describe("FIXED_CAM_LOCK_NOTE", () => {
  it("tells the user movement is locked on a fixed camera", () => {
    assert.match(FIXED_CAM_LOCK_NOTE, /fixed camera/i);
    assert.match(FIXED_CAM_LOCK_NOTE, /locked/i);
    assert.match(FIXED_CAM_LOCK_NOTE, /free/i);
  });
});

describe("cycleCameraMode", () => {
  it("starts with Sun / Earth / Moon, then booster / tower / Starship", () => {
    assert.deepEqual(CAMERA_CYCLE.slice(0, 8), [
      "sun",
      "earth",
      "moon",
      "booster",
      "tower",
      "chase",
      "aerial",
      "ground1",
    ]);
    assert.equal(CAMERA_CYCLE[8], "tower1cam");
    assert.equal(CAMERA_CYCLE[9], "tower2cam");
    assert.equal(CAMERA_CYCLE[10], "starbase");
    assert.equal(CAMERA_CYCLE.at(-1), "drone");
  });

  it("steps forward and backward along CAMERA_CYCLE", () => {
    assert.equal(cycleCameraMode("sun", 1), "earth");
    assert.equal(cycleCameraMode("earth", 1), "moon");
    assert.equal(cycleCameraMode("moon", 1), "booster");
    assert.equal(cycleCameraMode("booster", 1), "tower");
    assert.equal(cycleCameraMode("tower", 1), "chase");
    assert.equal(cycleCameraMode("moon", -1), "earth");
    assert.equal(cycleCameraMode("earth", -1), "sun");
    assert.equal(cycleCameraMode("chase", 1), "aerial");
    assert.equal(cycleCameraMode("aerial", 1), "ground1");
    assert.equal(cycleCameraMode("ground1", 1), "tower1cam");
    assert.equal(cycleCameraMode("tower1cam", 1), "tower2cam");
    assert.equal(cycleCameraMode("tower2cam", 1), "starbase");
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

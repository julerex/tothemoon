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
  it("starts with Sun / Earth / Moon, then booster / tower / Starship", () => {
    assert.deepEqual(CAMERA_CYCLE.slice(0, 8), [
      "sun",
      "earth",
      "moon",
      "booster",
      "tower",
      "chase",
      "aerial",
      "starbase",
    ]);
    assert.equal(CAMERA_CYCLE[8], "trench");
    assert.equal(CAMERA_CYCLE[9], "enginesDown");
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

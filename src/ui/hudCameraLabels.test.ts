import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMERA_CYCLE,
  CAMERA_DIGIT_MODES,
  CAMERA_LABELS,
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

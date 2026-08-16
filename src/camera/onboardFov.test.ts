/**
 * Onboard (fin / gridfin) FOV vs the theater default.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CAM_FOV_DEG,
  ONBOARD_CAM_FOV_DEG,
  cameraFovForFocus,
} from "./onboardFov.ts";

describe("cameraFovForFocus", () => {
  it("widens only the hull / grid-fin mounts", () => {
    assert.equal(cameraFovForFocus("fin"), ONBOARD_CAM_FOV_DEG);
    assert.equal(cameraFovForFocus("gridfin"), ONBOARD_CAM_FOV_DEG);
    assert.equal(cameraFovForFocus("hull"), ONBOARD_CAM_FOV_DEG);
    assert.ok(ONBOARD_CAM_FOV_DEG > DEFAULT_CAM_FOV_DEG + 20);
  });

  it("keeps chase / pad / trench / body cams at the default", () => {
    for (const mode of ["chase", "starbase", "trench", "earth", "moon", "sun", "free"]) {
      assert.equal(cameraFovForFocus(mode), DEFAULT_CAM_FOV_DEG);
    }
  });
});

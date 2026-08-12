/**
 * Visual pad / trench / free-cam clearance must share the physics surface shell.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EARTH_SURFACE_ALT_KM, STARBASE_ALT } from "../physics/constants.ts";
import { SURFACE_CLEARANCE_KM } from "./surfaceClamp.ts";
import { PAD_VISUAL_ALT_KM, TRENCH_CAM_LOCAL, padVisualLiftKm } from "./trenchCam.ts";

describe("visual/physics pad alignment", () => {
  it("uses the physics pad altitude for camera surface clearance", () => {
    assert.equal(SURFACE_CLEARANCE_KM, EARTH_SURFACE_ALT_KM);
    assert.equal(SURFACE_CLEARANCE_KM, STARBASE_ALT);
    assert.equal(PAD_VISUAL_ALT_KM, STARBASE_ALT);
    assert.equal(padVisualLiftKm(), 0);
  });

  it("keeps the trench mount above the Earth mesh", () => {
    const trenchAlt = STARBASE_ALT + TRENCH_CAM_LOCAL.y;
    assert.ok(
      trenchAlt > 0,
      `trench altitude ${trenchAlt} km must stay above mean Earth radius`,
    );
  });
});

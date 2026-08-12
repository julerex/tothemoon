import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { R_EARTH, STARBASE_ALT } from "../physics/constants.ts";
import { SURFACE_CLEARANCE_KM } from "./surfaceClamp.ts";
import {
  ENGINE_CLUSTER_RADIUS_KM,
  OLM_DECK_TOP_KM,
  OLM_INNER_RADIUS_KM,
  PAD_VISUAL_ALT_KM,
  padVisualLiftKm,
  TRENCH_CAM_LOCAL,
  TRENCH_CAM_LOOK_LOCAL,
  trenchCamRadialKm,
  trenchCamWorldPose,
} from "./trenchCam.ts";

describe("trenchCam mount (pad-local)", () => {
  it("stands inside the OLM ring, outside the engine cluster, under the deck", () => {
    const r = trenchCamRadialKm();
    assert.ok(r > ENGINE_CLUSTER_RADIUS_KM, `radial ${r} should clear the bells`);
    assert.ok(r < OLM_INNER_RADIUS_KM, `radial ${r} should sit inside the OLM hole`);
    assert.ok(TRENCH_CAM_LOCAL.y > 0, "above pad origin / apron");
    assert.ok(TRENCH_CAM_LOCAL.y < OLM_DECK_TOP_KM, "under the OLM deck");
  });

  it("looks at the engine plane, not the booster barrel", () => {
    assert.ok(TRENCH_CAM_LOOK_LOCAL.y < 0.003);
    assert.ok(TRENCH_CAM_LOOK_LOCAL.y > TRENCH_CAM_LOCAL.y);
    assert.equal(TRENCH_CAM_LOOK_LOCAL.x, 0);
    assert.equal(TRENCH_CAM_LOOK_LOCAL.z, 0);
  });

  it("sits above the Earth mesh on the shared pad shell", () => {
    const alt = STARBASE_ALT + padVisualLiftKm() + TRENCH_CAM_LOCAL.y;
    assert.equal(PAD_VISUAL_ALT_KM, SURFACE_CLEARANCE_KM);
    assert.equal(PAD_VISUAL_ALT_KM, STARBASE_ALT);
    assert.ok(alt > 0, "must not be inside the Earth sphere");
    assert.ok(alt >= SURFACE_CLEARANCE_KM, "at or above the shared pad / craft clamp");
  });

  it("does not lift physics pad away from the visual pad", () => {
    assert.equal(padVisualLiftKm(), 0);
    assert.equal(PAD_VISUAL_ALT_KM, STARBASE_ALT);
  });
});

describe("trenchCamWorldPose", () => {
  it("places the camera outside R_EARTH when the physics pad is at STARBASE_ALT", () => {
    const up = { x: 0, y: 1, z: 0 };
    const east = { x: 1, y: 0, z: 0 };
    const north = { x: 0, y: 0, z: 1 };
    const padPos = { x: 0, y: R_EARTH + STARBASE_ALT, z: 0 };
    const pose = trenchCamWorldPose(padPos, east, up, north);
    const r = Math.hypot(pose.position.x, pose.position.y, pose.position.z);
    assert.ok(r > R_EARTH, `camera radius ${r} must exceed R_EARTH`);
    assert.ok(pose.position.y > R_EARTH);
    const lookR = Math.hypot(pose.look.x, pose.look.y, pose.look.z);
    assert.ok(lookR > R_EARTH);
  });

  it("offsets west/north in the pad ENU frame from the visual origin", () => {
    const up = { x: 0, y: 1, z: 0 };
    const east = { x: 1, y: 0, z: 0 };
    const north = { x: 0, y: 0, z: 1 };
    const padPos = { x: 10, y: 20, z: 30 };
    const pose = trenchCamWorldPose(padPos, east, up, north);
    const originY = padPos.y + padVisualLiftKm();
    assert.ok(Math.abs(pose.position.x - (padPos.x + TRENCH_CAM_LOCAL.x)) < 1e-12);
    assert.ok(Math.abs(pose.position.z - (padPos.z + TRENCH_CAM_LOCAL.z)) < 1e-12);
    assert.ok(Math.abs(pose.position.y - (originY + TRENCH_CAM_LOCAL.y)) < 1e-12);
    assert.ok(Math.abs(pose.look.x - padPos.x) < 1e-12);
    assert.ok(Math.abs(pose.look.y - (originY + TRENCH_CAM_LOOK_LOCAL.y)) < 1e-12);
  });
});

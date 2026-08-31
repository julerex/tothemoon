import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOWER_H, TOWER_OX } from "../scene/earthTheater/mechazillaDims.ts";
import {
  TOWER1_CAM_FOV,
  TOWER1_CAM_LOCAL,
  TOWER1_CAM_LOOK_LOCAL,
  TOWER2_CAM_FOV,
  TOWER2_CAM_LOCAL,
  TOWER2_CAM_LOOK_LOCAL,
  isTowerCamFocus,
  towerCamLookName,
  towerCamMountName,
} from "./towerCam.ts";

describe("tower peak cameras", () => {
  it("puts Tower Two on the OLP-2 peak, looking down at the stack", () => {
    assert.ok(TOWER2_CAM_LOCAL.x > 0, "west of the OLM, on the launch tower");
    assert.ok(TOWER2_CAM_LOCAL.x < TOWER_OX, "vehicle-facing edge");
    assert.ok(Math.abs(TOWER2_CAM_LOCAL.y - TOWER_H) < 0.01);
    assert.ok(TOWER2_CAM_LOOK_LOCAL.y < TOWER2_CAM_LOCAL.y, "looks down");
    assert.ok(TOWER2_CAM_LOOK_LOCAL.y > 0.04, "mid-stack, not the apron");
    assert.ok(TOWER2_CAM_FOV > 45 && TOWER2_CAM_FOV < 70);
  });

  it("puts Tower One on the OLP-1 peak, looking west at the live stack", () => {
    assert.ok(TOWER1_CAM_LOCAL.x < -0.25, "east of OLP-2, on Pad 1");
    assert.ok(TOWER1_CAM_LOCAL.z < 0, "south of the OLP-2 OLM");
    assert.ok(Math.abs(TOWER1_CAM_LOCAL.y - TOWER_H) < 0.01);
    assert.equal(TOWER1_CAM_LOOK_LOCAL.x, 0);
    assert.ok(TOWER1_CAM_LOOK_LOCAL.y > 0.04);
    const dist = Math.hypot(
      TOWER1_CAM_LOOK_LOCAL.x - TOWER1_CAM_LOCAL.x,
      TOWER1_CAM_LOOK_LOCAL.z - TOWER1_CAM_LOCAL.z,
    );
    assert.ok(dist > 0.3 && dist < 0.4, `~330–370 m across the pads, got ${dist}`);
    assert.equal(TOWER1_CAM_FOV, 62);
  });

  it("names the pad-local mounts", () => {
    assert.equal(isTowerCamFocus("tower1cam"), true);
    assert.equal(isTowerCamFocus("tower2cam"), true);
    assert.equal(isTowerCamFocus("tower"), false);
    assert.equal(towerCamMountName("tower1cam"), "tower1-cam");
    assert.equal(towerCamLookName("tower2cam"), "tower2-cam-look");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOWER_H, TOWER_OX, TOWER_OZ } from "../scene/earthTheater/mechazillaDims.ts";
import {
  TOWER1_CAM_FOV,
  TOWER1_CAM_LOCAL,
  TOWER1_CAM_LOOK_LOCAL,
  TOWER2_CAM_FOV,
  TOWER2_CAM_LOCAL,
  TOWER2_CAM_LOOK_LOCAL,
  TOWER_TRACK_LOOK_UP_HIGH_KM,
  TOWER_TRACK_MAX_KM,
  isTowerCamFocus,
  towerCamLookName,
  towerCamMountName,
  towerCamTracksCraft,
  towerTrackLookUpKm,
} from "./towerCam.ts";

describe("tower peak cameras", () => {
  it("puts Tower Two on the OLP-2 peak, looking down at the stack", () => {
    assert.ok(TOWER2_CAM_LOCAL.z > 0, "north of the OLM, on the launch tower");
    assert.ok(TOWER2_CAM_LOCAL.z < TOWER_OZ, "vehicle-facing edge toward the stack");
    assert.ok(Math.abs(TOWER2_CAM_LOCAL.x - TOWER_OX) < 0.01, "on the tower meridian");
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

describe("panning tower cam", () => {
  it("only pans while the stack is in range", () => {
    assert.equal(towerCamTracksCraft(true, 0.05), true);
    assert.equal(towerCamTracksCraft(true, TOWER_TRACK_MAX_KM + 0.5), false);
    assert.equal(towerCamTracksCraft(false, 0.05), false);
    assert.equal(towerCamTracksCraft(true, Number.NaN), false);
  });

  it("aims up the stack while the engines are below the deck", () => {
    const low = towerTrackLookUpKm(-0.1);
    assert.ok(low > 0.05, "near the ship, not through the chopsticks");
    assert.ok(low < TOWER_TRACK_LOOK_UP_HIGH_KM + 1e-9);
  });

  it("never aims above the deck, so the horizon and plume stay in frame", () => {
    for (const rel of [-0.06, -0.03, -0.01, 0, 0.05, 0.4]) {
      const aimRel = rel + towerTrackLookUpKm(rel);
      assert.ok(aimRel <= 1e-9, `rel ${rel} aims ${aimRel} above the deck`);
    }
  });

  it("is monotone and finite-safe", () => {
    const a = towerTrackLookUpKm(-0.12);
    const b = towerTrackLookUpKm(-0.05);
    const c = towerTrackLookUpKm(0.1);
    assert.ok(a > b && b > c);
    assert.equal(towerTrackLookUpKm(Number.NaN), towerTrackLookUpKm(0));
  });
});

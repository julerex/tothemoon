import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coldStartCameraAction } from "./missionLoop.ts";

describe("coldStartCameraAction", () => {
  it("snaps the inland Starbase tableau at u=0 for pad-opening missions", () => {
    assert.equal(coldStartCameraAction(0, "pad-opening"), "snap-pad-opening");
  });

  it("leaves Auto-cam's first cut at u=0 so Flight 13 opens on Launchpad Drone", () => {
    assert.equal(coldStartCameraAction(0, "auto-cam"), "none");
  });

  it("updates the director when the clock is already past the cold start", () => {
    assert.equal(coldStartCameraAction(0.5, "pad-opening"), "update");
    assert.equal(coldStartCameraAction(0.5, "auto-cam"), "update");
  });
});

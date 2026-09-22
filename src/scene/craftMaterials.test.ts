/**
 * Visual V4 + V13 craft material layout contracts (fin / gridfin cams).
 * Hex TPS / S40 / oil-canning live in `craftHullMaps.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOSTER_WELD_RING_COUNT,
  CRAFT_CAM_MOUNT_NAMES,
  FIN_CAM_LOCAL,
  FIN_CAM_LOOK_LOCAL,
  GRID_FIN_LATTICE_N,
  SHIP_WELD_RING_FRACTIONS,
} from "./craft.ts";
import { PAYLOAD_CAM_LOCAL, PAYLOAD_CAM_LOOK_LOCAL, R } from "./craft/dimensions.ts";

describe("V4 craft material layout", () => {
  it("ships denser weld rings for fin-cam readability", () => {
    assert.ok(SHIP_WELD_RING_FRACTIONS.length >= 7);
    // Strictly decreasing down the barrel (nose → aft)
    for (let i = 1; i < SHIP_WELD_RING_FRACTIONS.length; i++) {
      assert.ok(
        SHIP_WELD_RING_FRACTIONS[i]! < SHIP_WELD_RING_FRACTIONS[i - 1]!,
      );
    }
    for (const f of SHIP_WELD_RING_FRACTIONS) {
      assert.ok(f > 0 && f < 1);
    }
  });

  it("uses more booster weld rings than the pre-V4 count of 7", () => {
    assert.ok(BOOSTER_WELD_RING_COUNT > 7);
  });

  it("uses a denser grid-fin lattice than the pre-V4 4-bar set", () => {
    assert.ok(GRID_FIN_LATTICE_N >= 6);
  });

  it("seats fin-cam nose-ward of the forward flap looking toward the engines", () => {
    // Forward flap occupies ~z 0.55–0.81; camera must sit in front of it.
    assert.ok(FIN_CAM_LOCAL.z > 0.82);
    assert.ok(FIN_CAM_LOOK_LOCAL.z < 0.40);
    assert.ok(FIN_CAM_LOCAL.x > FIN_CAM_LOOK_LOCAL.x);
  });

  it("names webcast hull and engine-bay mounts for Auto-cam", () => {
    const names = new Set<string>(CRAFT_CAM_MOUNT_NAMES);
    for (const n of [
      "hull-cam", "hull-cam-look",
      "flap-cam", "flap-cam-look",
      "booster-hull-cam", "booster-hull-cam-look",
      "engines-cam", "engines-cam-look",
      "engines-down-cam", "engines-down-cam-look",
      "payload-cam", "payload-cam-look",
    ]) {
      assert.ok(names.has(n), n);
    }
  });

  it("seats the Pez-bay cam outside the leeward skin, looking nose-ward", () => {
    // Bay pivot is ship-local (0, −0.118, 0.58); the cam sits aft and outboard.
    assert.ok(PAYLOAD_CAM_LOCAL.y < -R, "outboard of the leeward skin");
    assert.ok(PAYLOAD_CAM_LOCAL.z < 0.58, "aft of the bay");
    assert.ok(PAYLOAD_CAM_LOOK_LOCAL.z > PAYLOAD_CAM_LOCAL.z, "looks nose-ward");
    assert.ok(
      PAYLOAD_CAM_LOOK_LOCAL.y < PAYLOAD_CAM_LOCAL.y,
      "tilted outboard so the deploy fan fills the frame",
    );
  });
});

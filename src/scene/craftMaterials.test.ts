/**
 * Visual V4 craft material layout contracts (fin / gridfin cams).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOSTER_WELD_RING_COUNT,
  CRAFT_CAM_MOUNT_NAMES,
  GRID_FIN_LATTICE_N,
  SHIP_WELD_RING_FRACTIONS,
} from "./craft.ts";

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

  it("names webcast hull and engine-bay mounts for Auto-cam", () => {
    const names = new Set<string>(CRAFT_CAM_MOUNT_NAMES);
    for (const n of [
      "hull-cam", "hull-cam-look",
      "booster-hull-cam", "booster-hull-cam-look",
      "engines-cam", "engines-cam-look",
      "engines-down-cam", "engines-down-cam-look",
    ]) {
      assert.ok(names.has(n), n);
    }
  });
});

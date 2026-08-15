/**
 * Visual V4 + V13 craft material layout contracts (fin / gridfin cams).
 * Hex TPS / S40 / oil-canning live in `craftHullMaps.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOSTER_WELD_RING_COUNT,
  FIN_CAM_LOCAL,
  FIN_CAM_LOOK_LOCAL,
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

  it("seats fin-cam nose-ward of the forward flap looking toward the engines", () => {
    // Forward flap occupies ~z 0.55–0.81; camera must sit in front of it.
    assert.ok(FIN_CAM_LOCAL.z > 0.82);
    assert.ok(FIN_CAM_LOOK_LOCAL.z < 0.40);
    assert.ok(FIN_CAM_LOCAL.x > FIN_CAM_LOOK_LOCAL.x);
  });
});

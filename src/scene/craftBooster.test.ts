/**
 * Super Heavy V3 booster layout: 90/90/180 grid fins, B20, 33-engine rings.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOST_RING_INNER,
  BOOST_RING_MID,
  BOOST_RING_OUTER,
  GRID_FIN_AZIMUTHS,
  GRID_FIN_LATTICE_N,
  R,
  SL_BELL_R,
} from "./craft/dimensions.ts";
import { BOOSTER_HULL_MARK } from "./craftHullMaps.ts";

describe("V3 grid fins", () => {
  it("uses a 90/90/180 azimuth set, not equal 120° thirds", () => {
    assert.equal(GRID_FIN_AZIMUTHS.length, 3);
    const sorted = [...GRID_FIN_AZIMUTHS].sort((a, b) => a - b);
    const span = Math.PI * 2;
    const gaps = [
      sorted[1]! - sorted[0]!,
      sorted[2]! - sorted[1]!,
      sorted[0]! + span - sorted[2]!,
    ].sort((a, b) => a - b);
    assert.ok(Math.abs(gaps[0]! - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(gaps[1]! - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(gaps[2]! - Math.PI) < 1e-9);
  });

  it("keeps the first fin on +Y so gridfin-cam does not jump", () => {
    assert.equal(GRID_FIN_AZIMUTHS[0], Math.PI / 2);
  });

  it("keeps a denser lattice than the pre-V4 4-bar set", () => {
    assert.ok(GRID_FIN_LATTICE_N >= 6);
  });
});

describe("B20 hull identity", () => {
  it("stencils Flight 13 Booster 20 on the stainless leeward", () => {
    assert.equal(BOOSTER_HULL_MARK.text, "B20");
    assert.ok(BOOSTER_HULL_MARK.zFrac > 0.4 && BOOSTER_HULL_MARK.zFrac < 0.75);
    assert.ok(BOOSTER_HULL_MARK.width > 0.04);
    assert.ok(Math.abs(BOOSTER_HULL_MARK.ang) > Math.PI * 0.35);
  });
});

describe("Super Heavy Raptor rings", () => {
  it("packs 3 / 10 / 20 sea-level bells inside the 9 m barrel", () => {
    assert.ok(BOOST_RING_INNER < BOOST_RING_MID);
    assert.ok(BOOST_RING_MID < BOOST_RING_OUTER);
    assert.ok(BOOST_RING_OUTER + SL_BELL_R < R * 1.02);
    assert.ok(BOOST_RING_INNER > SL_BELL_R * 0.6);
  });
});

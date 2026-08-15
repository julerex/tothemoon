/**
 * V13 hull-cam material layout: hex TPS, S40, oil-canning, grout glow.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AFT_FLAP_STEEL_TILE_PATCHES,
  EXPERIMENT_HEXES,
  HEX_TILE_COLS,
  HEX_TILE_ROWS,
  MISSING_HEXES,
  SHIP_HULL_MARK,
  TILE_SIDE_MARK,
  clamp01,
  hexCellCenter,
  hexEdgeFactor,
  hexRadiusForMap,
  hexTileAlbedo,
  hexTileKind,
  hexVertex,
  latticeHash,
  oilCanHeight,
  stainlessHeatTint,
  tileGroutGlow,
} from "./craftHullMaps.ts";

describe("hex tile lattice", () => {
  it("is dense enough to read as a honeycomb at fin-cam range", () => {
    assert.ok(HEX_TILE_COLS >= 20);
    assert.ok(HEX_TILE_ROWS >= 56);
  });

  it("uses a regular pointy-top hex (6 equal-radius vertices)", () => {
    const r = 10;
    const verts = [0, 1, 2, 3, 4, 5].map((i) => hexVertex(0, 0, r, i));
    for (const v of verts) {
      const d = Math.hypot(v.x, v.y);
      assert.ok(Math.abs(d - r) < 1e-9);
    }
    const side = Math.hypot(verts[0]!.x - verts[1]!.x, verts[0]!.y - verts[1]!.y);
    assert.ok(Math.abs(side - r) < 1e-9);
  });

  it("offsets every other row so cells pack (not a brick rectangle)", () => {
    const r = hexRadiusForMap(512, 1536);
    const a = hexCellCenter(3, 4, r);
    const b = hexCellCenter(3, 5, r);
    assert.ok(Math.abs(a.cx - b.cx) > r * 0.4);
    assert.ok(b.cy > a.cy);
  });

  it("marks experiment tiles white and missing tiles near-black", () => {
    assert.ok(EXPERIMENT_HEXES.length >= 4);
    assert.ok(MISSING_HEXES.length >= 4);
    for (const [c, r] of EXPERIMENT_HEXES) {
      assert.equal(hexTileKind(c, r), "experiment");
      const rgb = hexTileAlbedo(c, r);
      assert.ok(rgb.r > 200 && rgb.g > 200 && rgb.b > 200);
    }
    for (const [c, r] of MISSING_HEXES) {
      assert.equal(hexTileKind(c, r), "missing");
      const rgb = hexTileAlbedo(c, r);
      assert.ok(rgb.r < 30 && rgb.g < 30 && rgb.b < 30);
    }
    assert.equal(hexTileKind(3, 3), "tile");
  });

  it("keeps experiment / missing cells inside the field", () => {
    for (const [c, r] of [...EXPERIMENT_HEXES, ...MISSING_HEXES]) {
      assert.ok(c >= 0 && c < HEX_TILE_COLS);
      assert.ok(r >= 0 && r < HEX_TILE_ROWS);
    }
  });

  it("warms only the TPS/steel chine columns", () => {
    assert.equal(hexEdgeFactor(0), 1);
    assert.equal(hexEdgeFactor(HEX_TILE_COLS - 1), 1);
    assert.equal(hexEdgeFactor(Math.floor(HEX_TILE_COLS / 2)), 0);
  });
});

describe("S40 / 00 hull identity", () => {
  it("stencils Flight 13 S40 on the stainless leeward", () => {
    assert.equal(SHIP_HULL_MARK.text, "S40");
    assert.ok(SHIP_HULL_MARK.zFrac > 0.3 && SHIP_HULL_MARK.zFrac < 0.7);
    assert.ok(SHIP_HULL_MARK.width > 0.04);
    assert.ok(SHIP_HULL_MARK.height > 0.015);
    // Past the windward TPS arc (±0.32π from +Y) onto steel.
    assert.ok(Math.abs(SHIP_HULL_MARK.ang) > Math.PI * 0.35);
  });

  it("paints a 00 cue on the tiled belly", () => {
    assert.equal(TILE_SIDE_MARK.text, "00");
    assert.ok(TILE_SIDE_MARK.u > 0 && TILE_SIDE_MARK.u < 1);
    assert.ok(TILE_SIDE_MARK.v > 0 && TILE_SIDE_MARK.v < 1);
  });

  it("adds stainless-side tile patches on both aft flaps", () => {
    assert.equal(AFT_FLAP_STEEL_TILE_PATCHES, 2);
  });
});

describe("oil-canning + heat tint", () => {
  it("is deterministic and not a flat cylinder", () => {
    const a = oilCanHeight(0.05, 0.15);
    const b = oilCanHeight(0.25, 0.35);
    assert.equal(oilCanHeight(0.05, 0.15), a);
    assert.ok(Math.abs(a - b) > 0.02);
    assert.ok(a > 0 && a < 1);
  });

  it("wraps U so the barrel seam matches", () => {
    assert.equal(oilCanHeight(0, 0.3), oilCanHeight(1, 0.3));
  });

  it("adds a non-zero temper tint somewhere on the barrel", () => {
    let max = 0;
    for (let i = 0; i < 16; i++) {
      for (const v of [0.2, 0.35, 0.5, 0.65]) {
        const t = stainlessHeatTint(i / 16, v);
        max = Math.max(max, t.r + t.g + t.b);
      }
    }
    assert.ok(max > 0.04);
  });
});

describe("tileGroutGlow", () => {
  it("holds a residual into descent after plasma drops", () => {
    assert.ok(tileGroutGlow(0, "descent") >= 0.12);
    assert.ok(tileGroutGlow(0, "coast") < 0.02);
    assert.ok(tileGroutGlow(0.8, "entry") >= 0.8);
  });

  it("treats non-finite plasma as 0", () => {
    assert.equal(clamp01(Number.NaN), 0);
    assert.equal(tileGroutGlow(Number.NaN, "coast"), 0);
  });
});

describe("latticeHash", () => {
  it("is stable and in [0, 1)", () => {
    const a = latticeHash(4, 9, 1);
    assert.equal(latticeHash(4, 9, 1), a);
    assert.ok(a >= 0 && a < 1);
    assert.ok(latticeHash(4, 9, 1) !== latticeHash(5, 9, 1));
  });
});

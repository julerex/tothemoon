/**
 * Ship silhouette contracts: ogive points +Z, welds stay on the barrel,
 * flaps stay inside public Block 2 / V3 dimensions.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AFT_FLAP_CHORD_M,
  AFT_FLAP_SPAN_M,
  FLAP_THICKNESS_M,
  FWD_FLAP_CHORD_M,
  FWD_FLAP_INCLUDED_DEG,
  FWD_FLAP_SPAN_M,
  SHIP_OGIVE_BASE_FRAC,
  SHIP_OGIVE_H_M,
  SHIP_WELD_RING_FRACTIONS,
  shipOgiveRadiusM,
} from "./craft.ts";
import { FWD_FLAP_SPAN } from "./craft/dimensions.ts";
import {
  applyFlapTileUvs,
  flapTileUv,
  makeFlapGeom,
  tpsMapWorldSize,
} from "./craft/meshShared.ts";
import { HEX_TILE_COLS } from "./craftHullMaps.ts";

const BARREL_R_M = 4.5;

describe("ship ogive", () => {
  it("is needle-narrow at the tip and full radius at the barrel join", () => {
    assert.equal(shipOgiveRadiusM(0), 0);
    assert.ok(shipOgiveRadiusM(0.4) < 1.2);
    assert.ok(Math.abs(shipOgiveRadiusM(SHIP_OGIVE_H_M) - BARREL_R_M) < 1e-9);
  });

  it("widens from tip toward the barrel (not an inverted engine bell)", () => {
    let prev = -1;
    for (let x = 0; x <= SHIP_OGIVE_H_M; x += 1) {
      const r = shipOgiveRadiusM(x);
      assert.ok(r >= prev - 1e-12);
      prev = r;
    }
  });

  it("uses a ~16–18 m ogive on a 52 m ship", () => {
    assert.ok(SHIP_OGIVE_H_M >= 16 && SHIP_OGIVE_H_M <= 18);
    assert.ok(SHIP_OGIVE_BASE_FRAC > 0.6 && SHIP_OGIVE_BASE_FRAC < 0.72);
  });
});

describe("ship weld bands", () => {
  it("stay on the cylinder below the ogive base", () => {
    for (const f of SHIP_WELD_RING_FRACTIONS) {
      assert.ok(f < SHIP_OGIVE_BASE_FRAC);
    }
  });
});

describe("ship flaps", () => {
  it("keeps forward flaps Block-2 small and thin", () => {
    assert.ok(FWD_FLAP_CHORD_M >= 6 && FWD_FLAP_CHORD_M <= 7.5);
    assert.ok(FWD_FLAP_SPAN_M >= 3 && FWD_FLAP_SPAN_M <= 4);
    assert.ok(FLAP_THICKNESS_M <= 0.35);
    assert.equal(FWD_FLAP_INCLUDED_DEG, 140);
  });

  it("keeps aft flaps inside a 17 m wingspan", () => {
    assert.ok(AFT_FLAP_CHORD_M >= 10 && AFT_FLAP_CHORD_M <= 13);
    assert.ok(AFT_FLAP_SPAN_M >= 3.5 && AFT_FLAP_SPAN_M <= 4.5);
    assert.ok(9 + 2 * AFT_FLAP_SPAN_M <= 17.1);
  });

  it("maps flap UVs at hull hex density so several columns fit on a forward flap", () => {
    const { uMesh } = tpsMapWorldSize();
    const hinge = flapTileUv(0, 0, 0.16);
    const tip = flapTileUv(FWD_FLAP_SPAN, 0, 0.16);
    assert.ok(Number.isFinite(hinge.u) && Number.isFinite(hinge.v));
    const hexCols = (tip.u - hinge.u) * HEX_TILE_COLS;
    assert.ok(hexCols > 6, `hex columns ${hexCols}`);
    assert.ok(FWD_FLAP_SPAN / uMesh > 0.25);
  });

  it("stamps hex-scale UVs onto flap extrusions", () => {
    const spec = {
      chord: 0.16,
      span: FWD_FLAP_SPAN,
      thickness: 0.006,
      sweepFwd: 0.04,
      sweepAft: 0.01,
    };
    const geom = makeFlapGeom(spec);
    applyFlapTileUvs(geom, spec.chord, 0.16);
    const uv = geom.getAttribute("uv")!;
    let minU = Infinity;
    let maxU = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i));
      maxU = Math.max(maxU, uv.getX(i));
    }
    assert.ok(maxU - minU > 0.25, `u span ${maxU - minU}`);
  });
});

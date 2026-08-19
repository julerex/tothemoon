/**
 * Visual V18 engine-bay layout contracts (gridfin / engines-cam).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENGINE_BAY_ACTUATOR_COUNT,
  ENGINE_BAY_GROUP,
  ENGINE_BAY_MLI_COUNT,
  ENGINE_BAY_PLUMBING_COUNT,
  ENGINE_BAY_RIB_COUNT,
  ENGINE_BELL_IDS,
  ENGINE_BELL_ID_RING_INDICES,
  engineBayBellIdPoses,
  engineBayMliPoses,
  engineBayStencilIds,
} from "./engineBay.ts";

describe("engineBay stencil IDs", () => {
  it("includes the T+5:50 still IDs and stays unique", () => {
    const ids = engineBayStencilIds();
    assert.ok(ids.length >= 6);
    assert.equal(ids.length, ENGINE_BELL_IDS.length);
    assert.ok(ids.includes("142"));
    assert.ok(ids.includes("150"));
    assert.ok(ids.includes("158"));
    assert.equal(new Set(ids).size, ids.length);
  });

  it("places one pose per stencil on the outer ring", () => {
    const poses = engineBayBellIdPoses();
    assert.equal(poses.length, ENGINE_BELL_IDS.length);
    assert.equal(poses.length, ENGINE_BELL_ID_RING_INDICES.length);
    for (const p of poses) {
      assert.ok(p.r > 0);
      assert.ok(Number.isFinite(p.ang));
      assert.ok(ENGINE_BELL_IDS.includes(p.id as (typeof ENGINE_BELL_IDS)[number]));
    }
  });
});

describe("engineBay MLI / structure counts", () => {
  it("ships a fixed MLI patch set", () => {
    const poses = engineBayMliPoses();
    assert.equal(poses.length, ENGINE_BAY_MLI_COUNT);
    assert.ok(ENGINE_BAY_MLI_COUNT >= 4 && ENGINE_BAY_MLI_COUNT <= 6);
    for (const p of poses) {
      assert.ok(p.w > 0 && p.h > 0);
      assert.ok(p.r > 0);
    }
  });

  it("keeps rib and plumbing counts in a theater band", () => {
    assert.ok(ENGINE_BAY_RIB_COUNT >= 8);
    assert.ok(ENGINE_BAY_PLUMBING_COUNT >= 6);
    assert.ok(ENGINE_BAY_ACTUATOR_COUNT >= 8);
  });

  it("exports the named bay group contract", () => {
    assert.equal(ENGINE_BAY_GROUP, "engine-bay");
  });
});

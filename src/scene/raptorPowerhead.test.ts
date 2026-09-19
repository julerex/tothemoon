/**
 * Raptor 3 unshrouded powerhead layout (engines-cam / T+5:50).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import {
  RAPTOR_POWERHEAD_GIMBAL_COUNT,
  RAPTOR_POWERHEAD_PUMP_COUNT,
  addPowerhead,
  raptorGimbalSpecs,
  raptorPumpSpecs,
} from "./craft/raptorPowerhead.ts";

const RTOP = 0.016;
const H = 0.08;

describe("raptorPumpSpecs", () => {
  it("places two turbopumps off-axis on the hot-stage side of the bell", () => {
    const pumps = raptorPumpSpecs(RTOP, H);
    assert.equal(pumps.length, RAPTOR_POWERHEAD_PUMP_COUNT);
    assert.equal(RAPTOR_POWERHEAD_PUMP_COUNT, 2);
    for (const p of pumps) {
      assert.ok(Math.hypot(p.x, p.y) > RTOP * 0.45, "pump sits beside the can");
      assert.ok(p.z > 0, "pump is throat-ward, not on the nozzle");
      assert.ok(p.r > 0 && p.h > 0);
    }
    const gap = Math.hypot(pumps[0]!.x - pumps[1]!.x, pumps[0]!.y - pumps[1]!.y);
    assert.ok(gap > RTOP, "pumps are not stacked on one side");
  });
});

describe("raptorGimbalSpecs", () => {
  it("puts three electric-gimbal stubs around the can", () => {
    const gimbals = raptorGimbalSpecs(RTOP, H);
    assert.equal(gimbals.length, RAPTOR_POWERHEAD_GIMBAL_COUNT);
    assert.equal(RAPTOR_POWERHEAD_GIMBAL_COUNT, 3);
    const angs = gimbals.map((g) => Math.atan2(g.y, g.x)).sort((a, b) => a - b);
    const span = Math.PI * 2;
    const gaps = [
      angs[1]! - angs[0]!,
      angs[2]! - angs[1]!,
      angs[0]! + span - angs[2]!,
    ];
    for (const gap of gaps) {
      assert.ok(Math.abs(gap - (Math.PI * 2) / 3) < 0.2);
    }
  });
});

describe("addPowerhead", () => {
  it("parents named can, pumps, pipes, and gimbal stubs", () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial();
    addPowerhead(g, RTOP, H, { head: mat, pump: mat, pipe: mat });
    assert.ok(g.getObjectByName("raptor-head"));
    assert.ok(g.getObjectByName("raptor-throat"));
    const pumps = g.children.filter((c) => c.name === "raptor-pump");
    const pipes = g.children.filter((c) => c.name === "raptor-pipe");
    const gimbals = g.children.filter((c) => c.name === "raptor-gimbal");
    assert.equal(pumps.length, 2);
    assert.equal(pipes.length, 2);
    assert.equal(gimbals.length, 3);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bodyPositions } from "./bodies.ts";
import { meshLocalToInertial } from "./earthFrame.ts";
import { meshLocalTrailFromSamples } from "./earthTrail.ts";
import { R_EARTH } from "./constants.ts";
import { len, v3 } from "./vec3.ts";

describe("meshLocalTrailFromSamples", () => {
  it("returns empty for empty input", () => {
    assert.deepEqual(meshLocalTrailFromSamples([]), []);
  });

  it("preserves count when under the max", () => {
    const samples = [
      { t: 0, pos: bodyPositions(0).earth },
      { t: 100, pos: bodyPositions(100).earth },
      { t: 200, pos: bodyPositions(200).earth },
    ];
    // Offset each sample above Earth so trail is non-degenerate
    const withAlt = samples.map((s) => {
      const b = bodyPositions(s.t);
      return {
        t: s.t,
        pos: {
          x: b.earth.x + R_EARTH + 100,
          y: b.earth.y,
          z: b.earth.z,
        },
      };
    });
    const pts = meshLocalTrailFromSamples(withAlt);
    assert.equal(pts.length, 3);
  });

  it("downsamples to maxPts", () => {
    const samples = Array.from({ length: 50 }, (_, i) => {
      const t = i * 10;
      const b = bodyPositions(t);
      return {
        t,
        pos: { x: b.earth.x + R_EARTH + 50, y: b.earth.y, z: b.earth.z },
      };
    });
    const pts = meshLocalTrailFromSamples(samples, 10);
    assert.equal(pts.length, 10);
  });

  it("round-trips mesh-local radius near Earth radius + alt", () => {
    const t = 3600;
    const b = bodyPositions(t);
    // Place a craft ~200 km above equator in mesh-local +X after convert
    const localWant = v3(R_EARTH + 200, 0, 0);
    const rel = meshLocalToInertial(localWant, t);
    const pos = {
      x: b.earth.x + rel.x,
      y: b.earth.y + rel.y,
      z: b.earth.z + rel.z,
    };
    const [pt] = meshLocalTrailFromSamples([{ t, pos }], 1);
    assert.ok(pt);
    const r = len(pt);
    assert.ok(
      Math.abs(r - (R_EARTH + 200)) < 1e-6,
      `radius ${r} vs ${R_EARTH + 200}`,
    );
    assert.ok(Math.abs(pt.x - localWant.x) < 1e-6);
    assert.ok(Math.abs(pt.y - localWant.y) < 1e-6);
    assert.ok(Math.abs(pt.z - localWant.z) < 1e-6);
  });
});

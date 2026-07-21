import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inertialRelToMeshLocal,
  meshLocalToInertial,
} from "./earthFrame.ts";
import {
  add,
  cross,
  dist,
  dot,
  len,
  normalize,
  scale,
  sub,
  v3,
} from "./vec3.ts";

describe("vec3", () => {
  it("basic arithmetic", () => {
    const out = v3();
    add(out, v3(1, 2, 3), v3(4, 5, 6));
    assert.deepEqual(out, { x: 5, y: 7, z: 9 });
    sub(out, v3(4, 5, 6), v3(1, 2, 3));
    assert.deepEqual(out, { x: 3, y: 3, z: 3 });
    scale(out, v3(1, -2, 3), 2);
    assert.deepEqual(out, { x: 2, y: -4, z: 6 });
  });

  it("dot, cross, len, normalize", () => {
    assert.equal(dot(v3(1, 0, 0), v3(0, 1, 0)), 0);
    assert.equal(dot(v3(1, 2, 3), v3(4, 5, 6)), 32);
    const c = v3();
    cross(c, v3(1, 0, 0), v3(0, 1, 0));
    assert.deepEqual(c, { x: 0, y: 0, z: 1 });
    assert.equal(len(v3(3, 4, 0)), 5);
    normalize(c, v3(0, 0, 10));
    assert.deepEqual(c, { x: 0, y: 0, z: 1 });
    assert.equal(dist(v3(0, 0, 0), v3(3, 4, 0)), 5);
  });
});

describe("earthFrame mesh ↔ inertial", () => {
  it("round-trips mesh-local vectors", () => {
    const local = v3(1000, 2000, -500);
    for (const t of [0, 3600, 86_164]) {
      const inertial = meshLocalToInertial(local, t);
      const back = inertialRelToMeshLocal(inertial, t);
      assert.ok(dist(local, back) < 1e-6, `t=${t} err=${dist(local, back)}`);
    }
  });
});

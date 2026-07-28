import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inertialRelToMeshLocal,
  meshLocalToInertial,
} from "./earthFrame.ts";
import {
  add,
  clone,
  copy,
  cross,
  dist,
  dot,
  len,
  lenSq,
  madd,
  normalize,
  scale,
  set,
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

  it("set, copy, clone, madd, lenSq", () => {
    const a = v3();
    set(a, 1, 2, 3);
    assert.deepEqual(a, { x: 1, y: 2, z: 3 });
    const b = v3();
    copy(b, a);
    assert.deepEqual(b, a);
    const c = clone(a);
    c.x = 9;
    assert.equal(a.x, 1);
    assert.equal(c.x, 9);
    madd(a, v3(1, 0, 0), v3(0, 1, 0), 3);
    assert.deepEqual(a, { x: 1, y: 3, z: 0 });
    assert.equal(lenSq(v3(3, 4, 0)), 25);
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

  it("normalize of near-zero vector does not produce NaN", () => {
    const out = v3();
    normalize(out, v3(0, 0, 0));
    assert.ok(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z));
  });

  it("cross is safe when out aliases an input", () => {
    const a = v3(1, 0, 0);
    cross(a, a, v3(0, 1, 0));
    assert.deepEqual(a, { x: 0, y: 0, z: 1 });
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

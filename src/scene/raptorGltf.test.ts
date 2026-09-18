/**
 * Sketchfab sea-level Raptor prototype: axis remap, shared-geometry clones,
 * 33 named booster children (landing-burn dimming walks those children).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { BOOST_RING_INNER, U } from "./craft/dimensions.ts";
import {
  addBoosterRaptorField,
  cloneRaptorAt,
  raptorSlUrl,
  sketchfabRaptorToTheater,
} from "./craft/raptorGltf.ts";

function stubBell(
  _rTop: number,
  _rBot: number,
  _h: number,
  x: number,
  y: number,
  z: number,
): THREE.Group {
  const g = new THREE.Group();
  g.name = "raptor";
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01));
  mesh.name = "raptor-bell";
  g.add(mesh);
  g.position.set(x, y, z);
  return g;
}

function dummyProto(): THREE.Group {
  const g = new THREE.Group();
  g.name = "raptor-sl-proto";
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.08));
  mesh.name = "raptor-body";
  g.add(mesh);
  return g;
}

describe("sketchfabRaptorToTheater", () => {
  it("maps a Y-up throat (hot-stage-ward) onto theater +Z mesh units", () => {
    const cx = 0;
    const cy = -48;
    const cz = 0.9;
    const p = sketchfabRaptorToTheater(0, -46.9, 0.9, cx, cy, cz);
    assert.ok(Math.abs(p[0]) < 1e-12);
    assert.ok(Math.abs(p[1]) < 1e-12);
    assert.ok(p[2] > 0);
    assert.ok(Math.abs(p[2] - 1.1 * U) < 1e-9);
  });

  it("maps the nozzle (more negative Y) onto theater −Z", () => {
    const p = sketchfabRaptorToTheater(0, -49.8, 0.9, 0, -48, 0.9);
    assert.ok(p[2] < 0);
  });
});

describe("cloneRaptorAt", () => {
  it("names the clone raptor and shares BufferGeometry", () => {
    const proto = dummyProto();
    const a = cloneRaptorAt(proto, 0.1, 0, -0.02);
    const b = cloneRaptorAt(proto, -0.1, 0, -0.02);
    assert.equal(a.name, "raptor");
    assert.equal(b.name, "raptor");
    const ma = a.getObjectByName("raptor-body") as THREE.Mesh;
    const mb = b.getObjectByName("raptor-body") as THREE.Mesh;
    assert.equal(ma.geometry, mb.geometry);
    assert.equal(a.position.x, 0.1);
    assert.equal(b.position.x, -0.1);
  });
});

describe("addBoosterRaptorField", () => {
  it("places 33 named raptor children when a prototype is provided", () => {
    const booster = new THREE.Group();
    addBoosterRaptorField(booster, dummyProto(), -0.02);
    const bells = booster.getObjectByName("booster-engines");
    assert.ok(bells);
    assert.equal(bells!.children.length, 33);
    assert.ok(bells!.children.every((c) => c.name === "raptor"));
    const first = bells!.children[0]!;
    assert.ok(Math.abs(first.position.x - BOOST_RING_INNER) < 1e-9);
    assert.equal(first.position.z, -0.02);
  });

  it("falls back to procedural groups without a prototype", () => {
    const booster = new THREE.Group();
    addBoosterRaptorField(booster, null, -0.02, stubBell);
    const bells = booster.getObjectByName("booster-engines");
    assert.equal(bells!.children.length, 33);
    assert.ok(bells!.children.every((c) => c.name === "raptor"));
    assert.ok(bells!.children[0]!.getObjectByName("raptor-bell"));
  });
});

describe("raptorSlUrl", () => {
  it("is under the Vite base path", () => {
    assert.equal(raptorSlUrl("/tothemoon/"), "/tothemoon/models/raptor-sl.glb");
    assert.equal(raptorSlUrl("/tothemoon"), "/tothemoon/models/raptor-sl.glb");
  });
});

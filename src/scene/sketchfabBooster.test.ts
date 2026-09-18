/**
 * Sketchfab Super Heavy V3 look-reference: world-space Raptor rings and
 * grid-fin pose from a GLTF document (named nodes + column-major matrices).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  measureSketchfabBooster,
  nodeWorldMatrices,
  type GltfDoc,
} from "./craft/sketchfabBooster.ts";

function ident(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function translation(x: number, y: number, z: number): number[] {
  const m = ident();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

/** Tiny booster-like GLTF: 3 inner Raptors on a 0.9 m ring + one grid fin. */
function toyBooster(): GltfDoc {
  return {
    nodes: [
      { name: "Superheavy v3_36", children: [1, 2, 3, 4], mesh: 4 },
      {
        name: "RAPTOR inner 1_3",
        matrix: translation(0.9, -48, 0),
        mesh: 0,
      },
      {
        name: "RAPTOR inner 2_4",
        matrix: translation(-0.45, -48, 0.7794228634),
        mesh: 1,
      },
      {
        name: "RAPTOR inner 3_5",
        matrix: translation(-0.45, -48, -0.7794228634),
        mesh: 2,
      },
      {
        name: "Gridfin Y+_0",
        matrix: translation(-4.68, 14.26, 0),
        mesh: 3,
      },
    ],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 } }] },
      { primitives: [{ attributes: { POSITION: 0 } }] },
      { primitives: [{ attributes: { POSITION: 0 } }] },
      { primitives: [{ attributes: { POSITION: 1 } }] },
      { primitives: [{ attributes: { POSITION: 2 } }] },
    ],
    accessors: [
      { min: [-0.05, -1.5, -0.05], max: [0.05, 1.5, 0.05] },
      { min: [-3.16, -0.165, -1.297], max: [0.0, 0.165, 1.297] },
      { min: [-4.5, -50, -4.5], max: [4.5, 21, 4.5] },
    ],
  };
}

describe("nodeWorldMatrices", () => {
  it("composes a child translation under a parent translation", () => {
    const nodes = [
      { children: [1], matrix: translation(10, 0, 0) },
      { matrix: translation(0, 5, 0) },
    ];
    const worlds = nodeWorldMatrices(nodes);
    assert.equal(worlds.length, 2);
    assert.equal(worlds[1]![12], 10);
    assert.equal(worlds[1]![13], 5);
    assert.equal(worlds[1]![14], 0);
  });
});

describe("measureSketchfabBooster", () => {
  it("reports the inner Raptor ring radius from world-space centroids", () => {
    const m = measureSketchfabBooster(toyBooster());
    assert.equal(m.raptorRings.inner.count, 3);
    assert.equal(m.raptorRings.mid.count, 0);
    assert.equal(m.raptorRings.outer.count, 0);
    assert.ok(Math.abs(m.raptorRings.inner.radiusM - 0.9) < 1e-6);
  });

  it("ignores Sketchfab root translation when measuring ring radius", () => {
    const inner = toyBooster();
    const wrapped: GltfDoc = {
      nodes: [
        {
          name: "Sketchfab_model",
          children: [1],
          matrix: translation(0, 50, 20),
        },
        ...inner.nodes.map((n) => ({
          ...n,
          children: n.children?.map((c) => c + 1),
        })),
      ],
      meshes: inner.meshes,
      accessors: inner.accessors,
    };
    const m = measureSketchfabBooster(wrapped);
    assert.equal(m.raptorRings.inner.count, 3);
    assert.ok(
      Math.abs(m.raptorRings.inner.radiusM - 0.9) < 1e-5,
      `radius ${m.raptorRings.inner.radiusM}`,
    );
  });

  it("places the grid fin relative to the booster top in Y-up meters", () => {
    const m = measureSketchfabBooster(toyBooster());
    assert.equal(m.gridFins.length, 1);
    const fin = m.gridFins[0]!;
    assert.ok(fin.radiusM > 4);
    assert.ok(Math.abs(fin.fromTopM - (21 - 14.26)) < 0.2);
    assert.ok(fin.spanM > 2 && fin.spanM < 4);
    assert.ok(fin.widthM > 2 && fin.widthM < 3);
  });
});

describe("committed Sketchfab scene.gltf", () => {
  it("has 3/10/20 named Raptors and three V3 grid fins", () => {
    const file = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../assets/sketchfab/scene.gltf",
    );
    const doc = JSON.parse(fs.readFileSync(file, "utf8")) as GltfDoc;
    const m = measureSketchfabBooster(doc);
    assert.equal(m.raptorRings.inner.count, 3);
    assert.equal(m.raptorRings.mid.count, 10);
    assert.equal(m.raptorRings.outer.count, 20);
    assert.equal(m.gridFins.length, 3);
    assert.ok(m.raptorRings.outer.radiusM > 3.8);
    assert.ok(m.raptorRings.outer.radiusM < 4.5);
    const fromTop =
      m.gridFins.reduce((s, f) => s + f.fromTopM, 0) / m.gridFins.length;
    assert.ok(fromTop > 5 && fromTop < 8, `fromTop ${fromTop}`);
  });
});

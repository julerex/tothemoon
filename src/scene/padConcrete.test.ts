/**
 * Procedural Starbase apron concrete: wrap-safe mottling + tiled UVs.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import {
  CONCRETE_MAP_SIZE,
  CONCRETE_SLABS,
  CONCRETE_TILE_KM,
  concreteAlbedo,
  concreteNoise,
  fillConcreteAlbedo,
  makeConcreteTexture,
  slabJoint,
} from "./earthTheater/padConcrete.ts";
import { addPadHardstand } from "./earthTheater/padHardstand.ts";
import { makePadSurroundMats } from "./earthTheater/padSurroundMats.ts";

function luma(u: number, v: number): number {
  const { r, g, b } = concreteAlbedo(u, v);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("concrete albedo", () => {
  it("is periodic on the unit square so RepeatWrapping has no seam", () => {
    for (const [u, v] of [
      [0, 0.4],
      [0.2, 0],
      [0.33, 0.71],
    ] as const) {
      const a = concreteAlbedo(u, v);
      const b = concreteAlbedo(u + 1, v + 2);
      assert.deepEqual(a, b);
    }
    assert.equal(concreteNoise(0, 0.5, 5, 1), concreteNoise(1, 0.5, 5, 1));
  });

  it("darkens pour joints relative to slab interiors", () => {
    const interior = 0.5 / CONCRETE_SLABS;
    assert.ok(slabJoint(0, interior) > 0.85, "u=0 is a joint");
    assert.ok(slabJoint(interior, interior) < 0.05, "slab center is open");
    assert.ok(
      luma(0, interior) < luma(interior, interior) - 8,
      "joints read darker than the pour",
    );
  });

  it("is mottled, not a single grey", () => {
    const samples: number[] = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) samples.push(luma((i + 0.5) / 8, (j + 0.5) / 8));
    }
    const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
    const variance =
      samples.reduce((s, x) => s + (x - mean) ** 2, 0) / samples.length;
    assert.ok(Math.max(...samples) - Math.min(...samples) > 18, "visible range");
    assert.ok(variance > 20, `luma variance ${variance}`);
  });

  it("stays a warm pad grey (not cool blue-grey plastic)", () => {
    const { r, g, b } = concreteAlbedo(0.125, 0.125);
    assert.ok(r >= b, `r=${r} b=${b}`);
    assert.ok(g >= b - 4);
  });

  it("fills an opaque RGBA tile", () => {
    const data = new Uint8Array(4 * 4 * 4);
    fillConcreteAlbedo(data, 4);
    assert.equal(data.length, 64);
    for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255);
    assert.ok(data[0] !== data[4] || data[1] !== data[5] || data[2] !== data[6]);
  });
});

describe("concrete texture + apron", () => {
  it("builds a repeating sRGB DataTexture", () => {
    const tex = makeConcreteTexture();
    assert.ok(tex instanceof THREE.DataTexture);
    assert.equal(tex.image.width, CONCRETE_MAP_SIZE);
    assert.equal(tex.wrapS, THREE.RepeatWrapping);
    assert.equal(tex.wrapT, THREE.RepeatWrapping);
    assert.equal(tex.colorSpace, THREE.SRGBColorSpace);
  });

  it("maps pad2-apron in pad metres, not a single 0–1 stamp", () => {
    const g = new THREE.Group();
    addPadHardstand(g, makePadSurroundMats());
    const apron = g.getObjectByName("pad2-apron") as THREE.Mesh | undefined;
    assert.ok(apron?.isMesh);
    const mat = apron!.material as THREE.MeshStandardMaterial;
    assert.ok(mat.map, "apron has a concrete map");
    assert.equal(mat.color.getHex(), 0xffffff);
    const uv = apron!.geometry.getAttribute("uv");
    let minU = Infinity;
    let maxU = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i));
      maxU = Math.max(maxU, uv.getX(i));
    }
    assert.ok(
      maxU - minU > 2,
      `UV span ${maxU - minU} should tile (${CONCRETE_TILE_KM} km cells)`,
    );
    const lip = g.getObjectByName("pad-olm-apron") as THREE.Mesh;
    assert.equal((lip.material as THREE.MeshStandardMaterial).map, mat.map);
  });
});

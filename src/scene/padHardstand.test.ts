/**
 * V23.3 circular hardstand: apron is a RingGeometry, not a box slab.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { addPadHardstand } from "./earthTheater/padHardstand.ts";
import { makePadSurroundMats } from "./earthTheater/padSurroundMats.ts";

describe("padHardstand V23.3", () => {
  it("names pad-olm-apron as a ring, not a box", () => {
    const g = new THREE.Group();
    addPadHardstand(g, makePadSurroundMats());
    const apron = g.getObjectByName("pad-olm-apron") as THREE.Mesh | undefined;
    assert.ok(apron?.isMesh);
    assert.ok(apron!.geometry instanceof THREE.RingGeometry);
    assert.ok(!(apron!.geometry instanceof THREE.BoxGeometry));
    assert.ok(g.getObjectByName("pad-hardstand-outer"));
  });
});

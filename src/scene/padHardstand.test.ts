/**
 * Pad 2 hardstand: polygonal apron plus a small circular OLM ring.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { addPadHardstand } from "./earthTheater/padHardstand.ts";
import { pad2ApronXz } from "./earthTheater/starbaseSurvey.ts";
import { makePadSurroundMats } from "./earthTheater/padSurroundMats.ts";

describe("padHardstand Pad 2 apron", () => {
  it("names pad-olm-apron as a ring and pad2-apron as a polygon", () => {
    const g = new THREE.Group();
    addPadHardstand(g, makePadSurroundMats());
    const lip = g.getObjectByName("pad-olm-apron") as THREE.Mesh | undefined;
    assert.ok(lip?.isMesh);
    assert.ok(lip!.geometry instanceof THREE.RingGeometry);
    const apron = g.getObjectByName("pad2-apron") as THREE.Mesh | undefined;
    assert.ok(apron?.isMesh);
    assert.ok(apron!.geometry instanceof THREE.ShapeGeometry);
    assert.ok(!(apron!.geometry instanceof THREE.BoxGeometry));
    assert.equal(pad2ApronXz().length, 15);
    assert.ok((apron!.geometry.index?.count ?? 0) >= 90, "concave 15-gon triangulates");
    assert.ok(g.getObjectByName("pad-hardstand-outer"));
  });
});

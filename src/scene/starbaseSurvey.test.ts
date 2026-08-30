/**
 * WGS84 survey → pad-local km for OLP-2 origin, OLP-1, and the Pad 2 apron.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAD1_X_KM, PAD1_Z_KM } from "./earthTheater/mechazillaDims.ts";
import {
  OLP1_LAT_DEG,
  OLP1_LON_DEG,
  OLP2_LAT_DEG,
  OLP2_LON_DEG,
  geodeticDeltaToPadLocal,
  olp1FromOlp2,
  pad2ApronXz,
} from "./earthTheater/starbaseSurvey.ts";

describe("starbaseSurvey", () => {
  it("places the OLP-2 origin at pad-local zero", () => {
    const p = geodeticDeltaToPadLocal(OLP2_LAT_DEG, OLP2_LON_DEG);
    assert.ok(Math.abs(p.x) < 1e-12);
    assert.ok(Math.abs(p.z) < 1e-12);
  });

  it("puts OLP-1 ~338 m east and ~74 m south of OLP-2", () => {
    assert.equal(PAD1_X_KM, olp1FromOlp2.x);
    assert.equal(PAD1_Z_KM, olp1FromOlp2.z);
    const p = geodeticDeltaToPadLocal(OLP1_LAT_DEG, OLP1_LON_DEG);
    const dist = Math.hypot(p.x, p.z);
    assert.ok(dist > 0.33 && dist < 0.35, `pad spacing ${dist} km`);
    assert.ok(p.x < -0.32 && p.x > -0.34, "east is −X");
    assert.ok(p.z < -0.07 && p.z > -0.08, "OLP-1 is south of OLP-2");
  });

  it("keeps the OLM inside the surveyed Pad 2 apron triangle", () => {
    const v = pad2ApronXz();
    assert.equal(v.length, 3);
    const [a, b, c] = v as [
      readonly [number, number],
      readonly [number, number],
      readonly [number, number],
    ];
    const sign = (
      p1: readonly [number, number],
      p2: readonly [number, number],
      p3: readonly [number, number],
    ) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    const b1 = sign([0, 0], a, b) < 0;
    const b2 = sign([0, 0], b, c) < 0;
    const b3 = sign([0, 0], c, a) < 0;
    assert.equal(b1, b2);
    assert.equal(b2, b3);
    assert.ok(a[0] > 0 && a[1] > 0.12, "NW corner west and toward SH 4");
    assert.ok(c[0] < -0.14, "east vertex toward the farm");
  });
});

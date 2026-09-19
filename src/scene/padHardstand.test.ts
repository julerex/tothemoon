/**
 * Pad 2 hardstand: polygonal apron plus a small circular OLM ring.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { EARTH_SURFACE_ALT_KM, STARBASE_LAT } from "../physics/constants.ts";
import { geocentricRadiusAt } from "../physics/wgs84.ts";
import { addPadHardstand } from "./earthTheater/padHardstand.ts";
import { pad2ApronXz, starbasePlatePinFromOlp2 } from "./earthTheater/starbaseSurvey.ts";
import { makePadSurroundMats } from "./earthTheater/padSurroundMats.ts";
import {
  STARBASE_PAD_PLATE_Y_KM,
  STARBASE_PLATE_Y_KM,
  drapePlatePoint,
} from "./starbasePlate.ts";

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

  it("does not float the site apron metres above the NAIP ground plate", () => {
    const g = new THREE.Group();
    addPadHardstand(g, makePadSurroundMats());
    const apron = g.getObjectByName("pad2-apron") as THREE.Mesh;
    assert.ok(apron?.isMesh);
    const pin = starbasePlatePinFromOlp2;
    const radiusKm = geocentricRadiusAt(STARBASE_LAT, EARTH_SURFACE_ALT_KM);
    let worst = 0;
    for (const [x, z] of pad2ApronXz()) {
      const draped = drapePlatePoint(x - pin.x, z - pin.z, radiusKm);
      const groundY = draped.y + STARBASE_PAD_PLATE_Y_KM;
      const step = apron.position.y - groundY;
      if (step > worst) worst = step;
    }
    assert.ok(worst > 0, "apron sits above the photo ground");
    assert.ok(
      worst <= 0.001,
      `apron-to-NAIP step ${worst * 1000} m (want ≤ 1 m, not a few metres)`,
    );
    assert.ok(
      STARBASE_PAD_PLATE_Y_KM > STARBASE_PLATE_Y_KM,
      "NAIP stays a hair above the wide Sentinel-2 plate",
    );
  });
});

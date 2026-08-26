/**
 * V23.1 tank farm: 12 m cryo shells, SH-4-parallel rows, west of Mechazilla.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOWER_FACE_M, TOWER_OX } from "./earthTheater/mechazillaDims.ts";
import {
  CRYO_COL_X_KM,
  CRYO_ROW_Z_KM,
  CRYO_SHELL_D_KM,
  CRYO_VERTICAL_H_KM,
  HORIZ_LARGE_LEN_KM,
  SH4_Z_KM,
  cryoVerticalCenters,
  tankFarmVentAnchors,
} from "./earthTheater/padFarmLayout.ts";
import { buildTankFarm } from "./earthTheater/padTankFarm.ts";
import { makePadSurroundMats } from "./earthTheater/padSurroundMats.ts";

describe("padFarmLayout vs tower / road", () => {
  it("uses 12 m cryo shells as wide as the tower face", () => {
    assert.equal(CRYO_SHELL_D_KM, 0.012);
    assert.equal(TOWER_FACE_M, 12);
    assert.ok(CRYO_VERTICAL_H_KM < 0.03, "tanks stay much shorter than the 146 m OLT");
    assert.ok(HORIZ_LARGE_LEN_KM > CRYO_SHELL_D_KM * 2);
  });

  it("puts two E–W rows west of Mechazilla and south of SH 4", () => {
    assert.equal(cryoVerticalCenters().length, 8);
    assert.equal(CRYO_ROW_Z_KM.length, 2);
    for (const x of CRYO_COL_X_KM) {
      assert.ok(x > TOWER_OX, `tank column ${x} should be west of tower ${TOWER_OX}`);
    }
    for (const z of CRYO_ROW_Z_KM) {
      assert.ok(z < SH4_Z_KM, "farm sits south of Boca Chica Blvd");
    }
  });

  it("anchors vents on the cryo bank", () => {
    const anchors = tankFarmVentAnchors();
    assert.equal(anchors.length, 10);
    assert.ok(anchors.every((a) => a[0] > TOWER_OX));
  });
});

describe("padTankFarm V23.1", () => {
  it("names the farm, berm, blast wall, and pipe rack", () => {
    const farm = buildTankFarm(makePadSurroundMats());
    assert.equal(farm.name, "pad-tank-farm");
    assert.equal(farm.position.x, 0);
    assert.ok(farm.getObjectByName("pad-tank-farm-berm"));
    assert.ok(farm.getObjectByName("pad-blast-wall"));
    assert.ok(farm.getObjectByName("pad-pipe-rack"));
    const cryo = farm.getObjectByName("pad-cryo-tank-0");
    assert.ok(cryo);
    assert.ok(Math.abs(cryo!.position.x - CRYO_COL_X_KM[0]) < 1e-9);
    let meshCount = 0;
    farm.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh) meshCount++;
    });
    assert.ok(meshCount >= 40, `expected dense farm, got ${meshCount}`);
  });
});

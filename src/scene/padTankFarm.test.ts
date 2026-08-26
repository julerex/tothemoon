/**
 * Orbital tank farm: E–W horizontal cryo rows between OLP-2 and OLP-1.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAD1_X_KM, TOWER_OX } from "./earthTheater/mechazillaDims.ts";
import {
  BLAST_WALL_Z_KM,
  CRYO_COL_X_KM,
  CRYO_ROW_Z_KM,
  CRYO_TANK_COUNT,
  CRYO_TANK_D_KM,
  CRYO_TANK_LEN_KM,
  SH4_Z_KM,
  cryoEwCenters,
  tankFarmVentAnchors,
} from "./earthTheater/padFarmLayout.ts";
import { buildTankFarm } from "./earthTheater/padTankFarm.ts";
import { makePadSurroundMats } from "./earthTheater/padSurroundMats.ts";

describe("padFarmLayout vs pads / road", () => {
  it("uses long E–W horizontal shells, not 12 m verticals", () => {
    assert.ok(CRYO_TANK_D_KM >= 0.008 && CRYO_TANK_D_KM <= 0.012);
    assert.ok(CRYO_TANK_LEN_KM > CRYO_TANK_D_KM * 2, "cylinders read as horizontals");
    assert.ok(CRYO_TANK_LEN_KM < 0.05, "tanks stay much shorter than the 146 m OLT");
  });

  it("puts two E–W rows between the pads and south of SH 4", () => {
    assert.equal(cryoEwCenters().length, CRYO_TANK_COUNT);
    assert.equal(CRYO_ROW_Z_KM.length, 2);
    assert.ok(TOWER_OX > 0, "live tower stays west of the OLM");
    for (const x of CRYO_COL_X_KM) {
      assert.ok(x < 0, `tank column ${x} should be east of the OLP-2 OLM`);
      assert.ok(x > PAD1_X_KM, `tank column ${x} should be west of OLP-1 ${PAD1_X_KM}`);
    }
    for (const z of CRYO_ROW_Z_KM) {
      assert.ok(z > 0, "farm sits north of the pad line");
      assert.ok(z < SH4_Z_KM, "farm sits south of Boca Chica Blvd");
    }
    assert.ok(BLAST_WALL_Z_KM < Math.min(...CRYO_ROW_Z_KM));
    assert.ok(BLAST_WALL_Z_KM > 0);
  });

  it("anchors vents on the cryo bank between the pads", () => {
    const anchors = tankFarmVentAnchors();
    assert.equal(anchors.length, 4);
    assert.ok(anchors.every((a) => a[0] < 0 && a[0] > PAD1_X_KM));
    assert.ok(anchors.every((a) => a[2] > 0 && a[2] < SH4_Z_KM));
  });
});

describe("padTankFarm between pads", () => {
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
    assert.ok(Math.abs(cryo!.rotation.z - Math.PI / 2) < 1e-9, "tank-0 is E–W");
    let meshCount = 0;
    farm.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh) meshCount++;
    });
    assert.ok(meshCount >= 40, `expected dense farm, got ${meshCount}`);
  });
});

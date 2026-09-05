/**
 * Orbital tank farm: N–S horizontal cryo banks between OLP-2 and OLP-1.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { PAD1_X_KM, TOWER_OX, TOWER_OZ } from "./earthTheater/mechazillaDims.ts";
import {
  BLAST_WALL_Z_KM,
  CRYO_BANKS,
  CRYO_TANK_COUNT,
  CRYO_TANK_D_KM,
  CRYO_TANK_LEN_KM,
  MAIN_CRYO_D_KM,
  MAIN_CRYO_LEN_KM,
  OFFLOAD_E_CRYO_D_KM,
  OFFLOAD_E_CRYO_LEN_KM,
  OFFLOAD_W_CRYO_D_KM,
  OFFLOAD_W_CRYO_LEN_KM,
  PAD2_WEST_A_LEN_KM,
  PAD2_WEST_B_LEN_KM,
  SH4_Z_KM,
  cryoBankCentroid,
  cryoTankPlacements,
  farmBankSlabs,
  farmLayoutCentroid,
  farmPlanBounds,
  farmSurveyMidpoint,
  surveyedFarmXz,
  tankFarmVentAnchors,
} from "./earthTheater/padFarmLayout.ts";
import {
  farmAxisYawRad,
  farmEastFromOlp2,
  farmWestFromOlp2,
} from "./earthTheater/starbaseSurvey.ts";
import { buildTankFarm } from "./earthTheater/padTankFarm.ts";
import { makePadSurroundMats } from "./earthTheater/padSurroundMats.ts";

describe("padFarmLayout vs pads / road", () => {
  it("uses long N–S horizontal shells, not 12 m verticals", () => {
    assert.ok(CRYO_TANK_D_KM >= 0.003 && CRYO_TANK_D_KM <= 0.006);
    assert.ok(CRYO_TANK_LEN_KM > CRYO_TANK_D_KM * 2, "cylinders read as horizontals");
    assert.ok(CRYO_TANK_LEN_KM < 0.05, "tanks stay much shorter than the 146 m OLT");
    assert.ok(CRYO_BANKS.every((b) => b.axis === "ns"));
  });

  it("sizes the Pad 2 west banks at 39 m and 26 m", () => {
    const westA = CRYO_BANKS.find((b) => b.id === "pad2-west-a");
    const westB = CRYO_BANKS.find((b) => b.id === "pad2-west-b");
    assert.ok(westA && westB);
    assert.equal(westA!.count, 5);
    assert.equal(westB!.count, 6);
    assert.equal(westA!.len, PAD2_WEST_A_LEN_KM);
    assert.equal(westB!.len, PAD2_WEST_B_LEN_KM);
    assert.equal(PAD2_WEST_A_LEN_KM, 0.039);
    assert.equal(PAD2_WEST_B_LEN_KM, 0.026);
    assert.ok(westA!.x0 > westB!.x0, "five thin tanks sit west of the six shorter ones");
  });

  it("sizes the middle bank at 6 m × 49 m", () => {
    assert.equal(MAIN_CRYO_D_KM, 0.006);
    assert.equal(MAIN_CRYO_LEN_KM, 0.049);
    const main = CRYO_BANKS.find((b) => b.id === "main");
    assert.ok(main);
    assert.equal(main!.d, MAIN_CRYO_D_KM);
    assert.equal(main!.len, MAIN_CRYO_LEN_KM);
    const shells = cryoTankPlacements().filter((p) => p.d === MAIN_CRYO_D_KM);
    assert.ok(shells.length >= 10);
    assert.ok(shells.every((p) => p.len === MAIN_CRYO_LEN_KM));
  });

  it("sizes the far-east offload pair at 8 m × 30 m", () => {
    assert.equal(OFFLOAD_E_CRYO_D_KM, 0.008);
    assert.equal(OFFLOAD_E_CRYO_LEN_KM, 0.03);
    const east = CRYO_BANKS.find((b) => b.id === "offload-e");
    assert.ok(east);
    assert.equal(east!.count, 2);
    assert.equal(east!.d, OFFLOAD_E_CRYO_D_KM);
    assert.equal(east!.len, OFFLOAD_E_CRYO_LEN_KM);
    assert.ok(east!.pitch > OFFLOAD_E_CRYO_D_KM, "8 m shells must not overlap");
  });

  it("sizes the four west offload shells at 5.5 m × 48 m", () => {
    assert.equal(OFFLOAD_W_CRYO_D_KM, 0.0055);
    assert.equal(OFFLOAD_W_CRYO_LEN_KM, 0.048);
    const west = CRYO_BANKS.find((b) => b.id === "offload-w");
    assert.ok(west);
    assert.equal(west!.count, 4);
    assert.equal(west!.d, OFFLOAD_W_CRYO_D_KM);
    assert.equal(west!.len, OFFLOAD_W_CRYO_LEN_KM);
    assert.ok(west!.pitch > OFFLOAD_W_CRYO_D_KM, "5.5 m shells must not overlap");
  });

  it("puts N–S banks between the pads and south of SH 4", () => {
    const pts = cryoTankPlacements();
    assert.equal(pts.length, CRYO_TANK_COUNT);
    assert.ok(TOWER_OX > 0 && TOWER_OZ > TOWER_OX, "live tower is north-west of the OLM");
    for (const p of pts) {
      assert.ok(p.x < 0, `tank at x=${p.x} should be east of the OLP-2 OLM`);
      assert.ok(p.z > 0, "farm sits north of the OLP-2 pad line");
      assert.ok(p.z < SH4_Z_KM, "farm sits south of Boca Chica Blvd");
    }
    const west = pts.filter((p) => p.x > -0.12);
    const main = pts.filter((p) => p.x < -0.2 && p.x > PAD1_X_KM);
    const offload = pts.filter((p) => p.x < PAD1_X_KM);
    assert.ok(west.length >= 10, "Pad 2 west banks on the apron");
    assert.ok(main.length >= 10, "main farm between the pads");
    assert.ok(offload.length >= 6, "offload east of OLP-1");
    assert.ok(BLAST_WALL_Z_KM > 0 && BLAST_WALL_Z_KM < SH4_Z_KM);
  });

  it("pours a concrete slab per bank, not one farm rectangle", () => {
    const slabs = farmBankSlabs();
    assert.equal(slabs.length, CRYO_BANKS.length);
    const main = slabs.find((s) => s.id === "main");
    assert.ok(main);
    const farmW = farmPlanBounds().xWest - farmPlanBounds().xEast;
    const mainW = main!.xWest - main!.xEast;
    assert.ok(mainW < farmW * 0.4, "main slab is a strip, not the whole farm");
  });

  it("anchors vents on the cryo bank between the pads", () => {
    const anchors = tankFarmVentAnchors();
    assert.equal(anchors.length, 4);
    assert.ok(anchors.every((a) => a[0] < 0));
    assert.ok(anchors.every((a) => a[2] > -0.02 && a[2] < SH4_Z_KM));
  });

  it("aligns the farm packing axis with the surveyed west→east GPS line", () => {
    const p0 = surveyedFarmXz(-0.2, 0.05);
    const p1 = surveyedFarmXz(-0.3, 0.05);
    const fx = p1.x - p0.x;
    const fz = p1.z - p0.z;
    const gx = farmEastFromOlp2.x - farmWestFromOlp2.x;
    const gz = farmEastFromOlp2.z - farmWestFromOlp2.z;
    const fLen = Math.hypot(fx, fz);
    const gLen = Math.hypot(gx, gz);
    const dot = (fx * gx + fz * gz) / (fLen * gLen);
    assert.ok(dot > 0.999, `farm axis vs GPS dot ${dot}`);
    const mid = farmSurveyMidpoint();
    const c = surveyedFarmXz(farmLayoutCentroid().x, farmLayoutCentroid().z);
    assert.ok(Math.abs(c.x - mid.x) < 1e-9);
    assert.ok(Math.abs(c.z - mid.z) < 1e-9);
  });
});

describe("cryoBankCentroid", () => {
  it("sits halfway along a packed N–S bank", () => {
    const main = CRYO_BANKS.find((b) => b.id === "main")!;
    const c = cryoBankCentroid(main);
    const lastX = main.x0 - (main.count - 1) * main.pitch;
    assert.equal(c.x, (main.x0 + lastX) * 0.5);
    assert.equal(c.z, main.z0);
  });
});

describe("padTankFarm between pads", () => {
  it("names the farm, berm, blast wall, and pipe rack", () => {
    const farm = buildTankFarm(makePadSurroundMats());
    assert.equal(farm.name, "pad-tank-farm");
    const mid = farmSurveyMidpoint();
    assert.ok(Math.abs(farm.position.x - mid.x) < 1e-9);
    assert.ok(Math.abs(farm.position.z - mid.z) < 1e-9);
    assert.ok(Math.abs(farm.rotation.y - farmAxisYawRad()) < 1e-9);
    assert.ok(farm.getObjectByName("pad-tank-farm-layout"));
    assert.ok(farm.getObjectByName("pad-tank-farm-berm"));
    assert.ok(farm.getObjectByName("pad-blast-wall"));
    assert.ok(farm.getObjectByName("pad-pipe-rack"));
    const north = farm.getObjectByName("pad-pipe-rack-north") as THREE.Mesh | undefined;
    assert.ok(north?.isMesh);
    assert.ok(north!.geometry instanceof THREE.BoxGeometry);
    const mainSlab = farm.getObjectByName("pad-cryo-slab-main") as THREE.Mesh | undefined;
    assert.ok(mainSlab?.isMesh);
    assert.ok(mainSlab!.geometry instanceof THREE.BoxGeometry);
    assert.ok(farm.getObjectByName("pad-vertical-tanks"));
    const cryo = farm.getObjectByName("pad-cryo-tank-0");
    assert.ok(cryo);
    const first = cryoTankPlacements()[0]!;
    assert.ok(Math.abs(cryo!.position.x - first.x) < 1e-9);
    assert.ok(Math.abs(cryo!.rotation.x - Math.PI / 2) < 1e-9, "tank-0 is N–S");
    let meshCount = 0;
    farm.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh) meshCount++;
    });
    assert.ok(meshCount >= 80, `expected dense farm, got ${meshCount}`);
  });
});

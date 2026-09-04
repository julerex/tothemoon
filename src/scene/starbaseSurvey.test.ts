/**
 * WGS84 survey → pad-local km for OLP-2 origin, OLP-1, and the Pad 2 apron.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAD1_X_KM, PAD1_Z_KM } from "./earthTheater/mechazillaDims.ts";
import {
  FARM_EAST_LAT_DEG,
  FARM_EAST_LON_DEG,
  FARM_WEST_LAT_DEG,
  FARM_WEST_LON_DEG,
  OLP1_LAT_DEG,
  OLP1_LON_DEG,
  OLP1_TOWER_LAT_DEG,
  OLP1_TOWER_LON_DEG,
  OLP2_LAT_DEG,
  OLP2_LON_DEG,
  PAD_AERIAL_LAT_DEG,
  PAD_AERIAL_LON_DEG,
  farmAxisYawRad,
  farmEastFromOlp2,
  farmWestFromOlp2,
  geodeticDeltaToPadLocal,
  padAerialFromOlp2,
  padLocalAzimuthDeg,
  olp1FromOlp2,
  olp1TowerFromOlp2,
  pad2ApronContains,
  pad2ApronXz,
  starbasePlatePinFromOlp2,
} from "./earthTheater/starbaseSurvey.ts";

describe("starbaseSurvey", () => {
  it("places the OLP-2 origin at pad-local zero", () => {
    const p = geodeticDeltaToPadLocal(OLP2_LAT_DEG, OLP2_LON_DEG);
    assert.ok(Math.abs(p.x) < 1e-12);
    assert.ok(Math.abs(p.z) < 1e-12);
  });

  it("puts the committed JPEG pin ~209 m east of OLP-2", () => {
    const p = starbasePlatePinFromOlp2;
    const dist = Math.hypot(p.x, p.z);
    assert.ok(dist > 0.2 && dist < 0.22, `pin ${dist} km from OLP-2`);
    assert.ok(p.x < -0.2 && p.x > -0.22, "east is −X");
    assert.ok(p.z > 0.02 && p.z < 0.03, "rounded pin is north of OLP-2");
  });

  it("puts OLP-1 ~363 m east and ~69 m south of OLP-2", () => {
    assert.equal(PAD1_X_KM, olp1FromOlp2.x);
    assert.equal(PAD1_Z_KM, olp1FromOlp2.z);
    const p = geodeticDeltaToPadLocal(OLP1_LAT_DEG, OLP1_LON_DEG);
    const dist = Math.hypot(p.x, p.z);
    assert.ok(dist > 0.36 && dist < 0.38, `pad spacing ${dist} km`);
    assert.ok(p.x < -0.35 && p.x > -0.38, "east is −X");
    assert.ok(p.z < -0.06 && p.z > -0.08, "OLP-1 is south of OLP-2");
  });

  it("keeps the OLP-1 tower base ~32 m west of the empty mount", () => {
    const pad = geodeticDeltaToPadLocal(OLP1_LAT_DEG, OLP1_LON_DEG);
    const tower = geodeticDeltaToPadLocal(OLP1_TOWER_LAT_DEG, OLP1_TOWER_LON_DEG);
    assert.equal(olp1TowerFromOlp2.x, tower.x);
    const dx = tower.x - pad.x;
    const dz = tower.z - pad.z;
    assert.ok(dx > 0.03 && dx < 0.035, `tower ${dx} km west of mount`);
    assert.ok(dz < 0 && dz > -0.008, "tower slightly south of the mount");
  });

  it("puts the T−5 pad drone pin south of the OLM, ~164 m out", () => {
    const p = geodeticDeltaToPadLocal(PAD_AERIAL_LAT_DEG, PAD_AERIAL_LON_DEG);
    assert.equal(padAerialFromOlp2.x, p.x);
    assert.equal(padAerialFromOlp2.z, p.z);
    const horiz = Math.hypot(p.x, p.z);
    assert.ok(horiz > 0.16 && horiz < 0.17, `horiz ${horiz} km`);
    assert.ok(Math.abs(p.x) < 0.005, "nearly on the OLM meridian");
    assert.ok(p.z < 0, "south of the OLM");
    const az = padLocalAzimuthDeg(p);
    assert.ok(az > 268 && az < 272, `az ${az} (due south of the OLM)`);
  });

  it("yaws the cryo farm so west→east follows the surveyed GPS line", () => {
    const west = geodeticDeltaToPadLocal(FARM_WEST_LAT_DEG, FARM_WEST_LON_DEG);
    const east = geodeticDeltaToPadLocal(FARM_EAST_LAT_DEG, FARM_EAST_LON_DEG);
    assert.equal(farmWestFromOlp2.x, west.x);
    assert.equal(farmEastFromOlp2.x, east.x);
    const dx = east.x - west.x;
    const dz = east.z - west.z;
    const len = Math.hypot(dx, dz);
    assert.ok(len > 0.4 && len < 0.45, `farm axis ${len} km`);
    assert.ok(dx < -0.4, "east end is further −X");
    assert.ok(dz < 0, "east end is south of the west end");
    const yaw = farmAxisYawRad();
    assert.ok(yaw < 0 && yaw > -0.3, `yaw ${yaw} rad (eastbound runs south of due east)`);
    assert.ok(Math.abs(yaw - Math.atan2(dz, -dx)) < 1e-12);
  });

  it("keeps the OLM and OLP-1 inside the surveyed site apron", () => {
    const v = pad2ApronXz();
    assert.equal(v.length, 15);
    assert.ok(pad2ApronContains(0, 0), "OLP-2 OLM is on the apron");
    assert.ok(pad2ApronContains(olp1FromOlp2.x, olp1FromOlp2.z), "OLP-1 mount is on the apron");
    const nw = v[0]!;
    assert.ok(nw[0] > 0 && nw[1] > 0.12, "first vertex is Pad 2 NW, west and toward SH 4");
    const east = Math.min(...v.map((p) => p[0]));
    assert.ok(east < PAD1_X_KM, "apron reaches east of OLP-1");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GEO_RADIUS_KM } from "../physics/constants.ts";
import { WGS84_A } from "../physics/wgs84.ts";
import { earthNorthPole } from "../physics/earthFrame.ts";
import {
  cameraAltEarthKm,
  cameraHeadingDeg,
  cameraHudTelemetry,
  cameraReadoutLabels,
  formatHeadingDeg,
  formatLookVec3,
  formatSceneVec3,
} from "./hudCameraPose.ts";

describe("GEO_RADIUS_KM", () => {
  it("is the Kepler GEO radius (~42 164 km)", () => {
    assert.ok(GEO_RADIUS_KM > 42_160 && GEO_RADIUS_KM < 42_170);
  });
});

describe("cameraAltEarthKm", () => {
  const earth = { x: 10, y: 20, z: 30 };

  it("returns WGS84 height inside GEO and null beyond it", () => {
    const near = cameraAltEarthKm(
      { x: earth.x + WGS84_A + 0.19, y: earth.y, z: earth.z },
      earth,
    );
    assert.ok(near != null);
    assert.ok(Math.abs(near! - 0.19) < 0.02);

    const far = cameraAltEarthKm(
      { x: earth.x + GEO_RADIUS_KM + 1, y: earth.y, z: earth.z },
      earth,
    );
    assert.equal(far, null);
  });

  it("is null at GEO and when inputs are missing", () => {
    assert.equal(
      cameraAltEarthKm(
        { x: earth.x + GEO_RADIUS_KM, y: earth.y, z: earth.z },
        earth,
      ),
      null,
    );
    assert.equal(cameraAltEarthKm(null, earth), null);
    assert.equal(cameraAltEarthKm({ x: 1, y: 2, z: 3 }, null), null);
  });
});

describe("formatSceneVec3 / formatLookVec3", () => {
  it("stacks km components and uses a HUD minus", () => {
    const s = formatSceneVec3({ x: 1.5e8, y: -2.5, z: 0 });
    assert.match(s, /^x 1\.5000e\+8\ny −2\.500\nz 0$/);
    assert.equal(formatSceneVec3(null), "—");
  });

  it("prints unit look to five decimals", () => {
    assert.equal(
      formatLookVec3({ x: 1, y: 0, z: -0.5 }),
      "x 1.00000\ny 0.00000\nz −0.50000",
    );
  });
});

describe("cameraHudTelemetry / cameraReadoutLabels", () => {
  it("copies pose and shows altitude only inside GEO", () => {
    const earth = { x: 0, y: 0, z: 0 };
    const pose = {
      position: { x: WGS84_A + 0.2, y: 0, z: 0 },
      target: { x: WGS84_A, y: 1, z: -2 },
      look: { x: -1, y: 0, z: 0 },
    };
    const tel = cameraHudTelemetry(pose, earth);
    assert.ok(tel);
    assert.deepEqual(tel!.cameraTarget, pose.target);
    assert.notEqual(tel!.cameraPosition, pose.position);
    assert.ok(tel!.cameraAltEarth != null);
    assert.match(tel!.cameraCompassTransform, /^matrix3d\(/);

    const labels = cameraReadoutLabels(tel!);
    assert.equal(labels.cameraAltitudeVisible, true);
    assert.match(labels.cameraAltitude, /m$/);
    assert.match(labels.cameraTarget, /y 1\.000/);
    assert.match(labels.cameraDirection, /x −1\.00000/);
  });

  it("hides altitude and dashes missing pose", () => {
    assert.equal(cameraHudTelemetry(null, { x: 0, y: 0, z: 0 }), null);
    const empty = cameraReadoutLabels({});
    assert.equal(empty.cameraAltitudeVisible, false);
    assert.equal(empty.cameraTarget, "—");
    assert.equal(empty.cameraPosition, "—");
    assert.equal(empty.cameraDirection, "—");
    assert.equal(empty.cameraAltitude, "—");
    assert.equal(empty.cameraHeadingDeg, null);
    assert.equal(empty.cameraHeadingLabel, "—");
    assert.match(empty.cameraCompassTransform, /^matrix3d\(/);
  });
});

describe("cameraHeadingDeg", () => {
  const earth = { x: 0, y: 0, z: 0 };
  const cam = { x: 10_000, y: 0, z: 0 };

  function enuAtCam() {
    const pole = earthNorthPole();
    const up = { x: 1, y: 0, z: 0 };
    const el = Math.hypot(
      pole.y * up.z - pole.z * up.y,
      pole.z * up.x - pole.x * up.z,
      pole.x * up.y - pole.y * up.x,
    );
    const east = {
      x: (pole.y * up.z - pole.z * up.y) / el,
      y: (pole.z * up.x - pole.x * up.z) / el,
      z: (pole.x * up.y - pole.y * up.x) / el,
    };
    const north = {
      x: up.y * east.z - up.z * east.y,
      y: up.z * east.x - up.x * east.z,
      z: up.x * east.y - up.y * east.x,
    };
    return { east, north, up };
  }

  it("is 0 looking local north and 90 looking local east", () => {
    const { east, north } = enuAtCam();
    const n = cameraHeadingDeg(north, cam, earth);
    const e = cameraHeadingDeg(east, cam, earth);
    assert.ok(n != null);
    assert.ok(e != null);
    assert.ok(Math.abs(n!) < 1e-6, `north=${n}`);
    assert.ok(Math.abs(e! - 90) < 1e-6, `east=${e}`);
  });

  it("is null looking along local up or with missing inputs", () => {
    assert.equal(cameraHeadingDeg({ x: 1, y: 0, z: 0 }, cam, earth), null);
    assert.equal(cameraHeadingDeg({ x: 0, y: 1, z: 0 }, cam, null), null);
    assert.equal(cameraHeadingDeg(null, cam, earth), null);
  });

  it("formats a three-digit degree label", () => {
    assert.equal(formatHeadingDeg(7.2), "007°");
    assert.equal(formatHeadingDeg(270), "270°");
    assert.equal(formatHeadingDeg(359.6), "000°");
    assert.equal(formatHeadingDeg(null), "—");
  });
});

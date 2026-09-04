import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enuOffsetKm } from "./enuPose.ts";
import { padAerialFromOlp2 } from "../scene/earthTheater/starbaseSurvey.ts";
import {
  FLIGHT13_WEBCAST_SHOTS,
  GROUND1_AZ_DEG,
  GROUND1_EL_DEG,
  GROUND1_FOV,
  GROUND1_FRAME_SCALE,
  GROUND1_T0,
  PAD_AERIAL_AZ_DEG,
  PAD_AERIAL_EL_DEG,
  PAD_AERIAL_FOV,
  PAD_AERIAL_FRAME_SCALE,
  PAD_AERIAL_LOOK_NORTH_KM,
  PAD_AERIAL_LOOK_WEST_KM,
  SPLASH_DRONE_T0,
  splashDroneAzimuthDeg,
  webcastShotAt,
} from "./webcastShots.ts";

describe("FLIGHT13_WEBCAST_SHOTS", () => {
  it("is sorted by t0 with unique keys", () => {
    const keys = new Set<string>();
    for (let i = 0; i < FLIGHT13_WEBCAST_SHOTS.length; i++) {
      const shot = FLIGHT13_WEBCAST_SHOTS[i]!;
      assert.equal(keys.has(shot.key), false, shot.key);
      keys.add(shot.key);
      if (i === 0) continue;
      assert.ok(shot.t0 > FLIGHT13_WEBCAST_SHOTS[i - 1]!.t0, shot.key);
    }
  });

  it("opens on a wide pad aerial and tracks the stack through liftoff", () => {
    const open = webcastShotAt(-300);
    assert.equal(open.mode, "aerial");
    assert.equal(open.padTrack, undefined);
    assert.ok((open.elevationDeg ?? 0) > 15);
    assert.ok((open.fov ?? 0) > 50);
    assert.equal(open.azimuthDeg, PAD_AERIAL_AZ_DEG);
    assert.equal(open.frameScale, PAD_AERIAL_FRAME_SCALE);
    const half = ((PAD_AERIAL_FOV * Math.PI) / 180) * 0.25;
    const dist = (0.12 / Math.tan(half)) * PAD_AERIAL_FRAME_SCALE;
    const off = enuOffsetKm(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      PAD_AERIAL_AZ_DEG,
      PAD_AERIAL_EL_DEG,
      dist,
    );
    const wantX = padAerialFromOlp2.x - PAD_AERIAL_LOOK_WEST_KM;
    const wantZ = padAerialFromOlp2.z - PAD_AERIAL_LOOK_NORTH_KM;
    const miss = Math.hypot(-off.x - wantX, off.y - wantZ);
    assert.ok(miss < 0.002, `ground track miss ${miss * 1000} m`);
    assert.ok((open.frameScale ?? 1) < 0.5, "close T−5 pad drone, not a gulf hover");
    assert.ok(
      (open.azimuthDeg ?? 0) > 268 && (open.azimuthDeg ?? 0) < 272,
      "south of Mechazilla, looking north",
    );
    assert.equal(webcastShotAt(-180).key, "pad-wide");
    assert.equal(webcastShotAt(-180).mode, "aerial");
    const ground = webcastShotAt(GROUND1_T0);
    assert.equal(ground.key, "ground-cam-1");
    assert.equal(ground.mode, "ground1");
    assert.equal(ground.padTrack, true);
    assert.equal(ground.azimuthDeg, GROUND1_AZ_DEG);
    assert.equal(ground.elevationDeg, GROUND1_EL_DEG);
    assert.equal(ground.fov, GROUND1_FOV);
    assert.equal(ground.frameScale, GROUND1_FRAME_SCALE);
    assert.ok(GROUND1_EL_DEG < 10, "rooftop / pad-fence height");
    assert.ok(GROUND1_FOV < 45, "telephoto stack+tower");
    const hold = webcastShotAt(-2);
    assert.equal(hold.mode, "ground1");
    assert.equal(hold.padTrack, true);
    assert.equal(webcastShotAt(16).key, "ascent-track");
  });

  it("uses booster hull-down at max-Q (left-analog onboard)", () => {
    const s = webcastShotAt(56);
    assert.equal(s.mode, "gridfin");
    assert.equal(s.mount, "boosterHull");
  });

  it("picks the left engine-bay pane at hot-stage and keeps it after sep", () => {
    const hot = webcastShotAt(141);
    assert.equal(hot.mode, "engines");
    assert.equal(hot.mount, "engines");
    assert.equal(webcastShotAt(160).mount, "engines");
  });

  it("follows left-pane booster cuts through boostback and Super Heavy splash", () => {
    assert.equal(webcastShotAt(190).mode, "enginesDown");
    assert.equal(webcastShotAt(190).mount, "enginesDown");
    assert.equal(webcastShotAt(255).mount, "boosterHull");
    assert.equal(webcastShotAt(280).mode, "engines");
    assert.equal(webcastShotAt(280).mount, "engines");
    assert.equal(webcastShotAt(320).mount, "boosterHull");
    assert.equal(webcastShotAt(340).mode, "engines");
    assert.equal(webcastShotAt(340).mount, "engines");
    assert.equal(webcastShotAt(386).mount, "boosterHull");
    assert.equal(webcastShotAt(400).mount, "boosterHull");
    assert.equal(webcastShotAt(420).mode, "hull");
  });

  it("holds ship hull through coast and landing, flap-cam on the entry split", () => {
    assert.equal(webcastShotAt(500).mode, "hull");
    assert.equal(webcastShotAt(2845).mode, "fin");
    assert.equal(webcastShotAt(2845).mount, "flap");
    assert.equal(webcastShotAt(3750).mode, "hull");
    assert.equal(webcastShotAt(3900).mode, "hull");
  });

  it("cuts to an aerial chase for splashdown, then a sea-level drone", () => {
    const splash = webcastShotAt(3920);
    assert.equal(splash.mode, "chase");
    assert.ok((splash.elevationDeg ?? 0) > 40);
    assert.ok((splash.frameScale ?? 1) > 1.3);
    const drone = webcastShotAt(SPLASH_DRONE_T0);
    assert.equal(drone.key, "splash-drone");
    assert.equal(drone.mode, "drone");
    assert.equal(drone.droneTrack, true);
    assert.ok((drone.elevationDeg ?? 90) < 15);
    assert.equal(webcastShotAt(4000).key, "splash-drone");
  });

  it("orbits the drone azimuth with mission time", () => {
    const a0 = splashDroneAzimuthDeg(SPLASH_DRONE_T0);
    const a1 = splashDroneAzimuthDeg(SPLASH_DRONE_T0 + 60);
    assert.ok(a1 > a0);
    assert.ok(a1 - a0 > 20 && a1 - a0 < 45);
    assert.equal(splashDroneAzimuthDeg(0), a0);
  });

  it("chooses chase for the payload-receding still, hull otherwise mid-coast", () => {
    assert.equal(webcastShotAt(1000).mode, "hull");
    assert.equal(webcastShotAt(1210).mode, "chase");
    assert.equal(webcastShotAt(1660).mode, "hull");
  });
});

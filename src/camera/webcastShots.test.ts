import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASCENT_TRACK_T0,
  FLIGHT13_WEBCAST_SHOTS,
  GROUND1_AZ_DEG,
  GROUND1_EL_DEG,
  GROUND1_FOV,
  GROUND1_FRAME_SCALE,
  GROUND1_HOLD_T0,
  GROUND1_T0,
  PAD_AERIAL_FOV,
  PAD_TRACK_T0,
  SPLASH_DRONE_T0,
  TRENCH_T0,
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

  it("only cuts to cameras the theater can mount", () => {
    for (const shot of FLIGHT13_WEBCAST_SHOTS) {
      assert.notEqual(shot.mode, "free", shot.key);
      if (shot.mount) assert.ok(shot.fov ?? 0 > 0, `${shot.key} mount needs a lens`);
    }
  });

  it("opens on the wide pad drone and holds it until the T−2:00 ground cut", () => {
    const open = webcastShotAt(-300);
    assert.equal(open.key, "pad-wide");
    assert.equal(open.mode, "aerial");
    assert.equal(open.fov, PAD_AERIAL_FOV);
    // The Launchpad Drone flies padDrone.ts; no fixed bearing on the shot.
    assert.equal(open.azimuthDeg, undefined);
    assert.equal(open.padTrack, undefined);
    assert.equal(webcastShotAt(-150).key, "pad-wide");
  });

  it("walks the countdown cuts: ground cam, flame trench, drone, ground cam", () => {
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
    // T−1:48 drone still, then the T−1:46 engines-up trench cut.
    assert.equal(webcastShotAt(-110).mode, "aerial");
    const trench = webcastShotAt(TRENCH_T0);
    assert.equal(trench.mode, "trench");
    assert.equal(webcastShotAt(-90).mode, "trench", "T−1:30 still is the same cut");
    // T−1:15 back on the drone, T−0:30 back on Ground Camera One.
    assert.equal(webcastShotAt(-75).mode, "aerial");
    assert.equal(webcastShotAt(-42).mode, "aerial");
    assert.equal(webcastShotAt(GROUND1_HOLD_T0).key, "ground-cam-1-hold");
    assert.equal(webcastShotAt(-10).mode, "ground1");
  });

  it("tracks liftoff from the pad, the tower peak, then the perched drone", () => {
    const pad = webcastShotAt(PAD_TRACK_T0);
    assert.equal(pad.key, "pad-track-liftoff");
    assert.equal(pad.mode, "starbase");
    assert.equal(pad.padTrack, true);
    assert.equal(webcastShotAt(2).key, "pad-track-liftoff");
    // T+3 → T+7 tower-down stills: OLP-2 peak panning with the stack.
    const tower = webcastShotAt(3);
    assert.equal(tower.mode, "tower2cam");
    assert.equal(tower.towerTrack, true);
    assert.equal(webcastShotAt(7).mode, "tower2cam");
    // T+8 → T+17 aerial stills: drone above the pad tilting up.
    assert.equal(webcastShotAt(8).key, "pad-drone-ascent");
    assert.equal(webcastShotAt(8).mode, "aerial");
    assert.equal(webcastShotAt(16).mode, "aerial");
    // T+18 → T+28 pad long lens.
    const track = webcastShotAt(ASCENT_TRACK_T0);
    assert.equal(track.key, "ascent-track");
    assert.equal(track.mode, "starbase");
    assert.equal(track.padTrack, true);
    assert.equal(webcastShotAt(28).key, "ascent-track");
  });

  it("uses the ship hull-cam on ascent and engines-down at Max Q", () => {
    const hull = webcastShotAt(29);
    assert.equal(hull.mode, "hull");
    assert.equal(hull.mount, "hull");
    assert.equal(webcastShotAt(55).mount, "hull");
    const maxq = webcastShotAt(58);
    assert.equal(maxq.mode, "enginesDown");
    assert.equal(maxq.mount, "enginesDown");
    assert.equal(webcastShotAt(80).mode, "hull", "T+1:15 back on the hull-cam");
    assert.equal(webcastShotAt(120).mode, "hull");
  });

  it("picks the left engine-bay pane at hot-stage, ship hull after sep", () => {
    const hot = webcastShotAt(130);
    assert.equal(hot.mode, "engines");
    assert.equal(hot.mount, "engines");
    assert.equal(webcastShotAt(150).mount, "engines");
    assert.equal(webcastShotAt(160).mode, "hull", "T+2:37 post-sep ship hull");
    assert.equal(webcastShotAt(180).mode, "engines", "T+3:00 booster bay");
  });

  it("follows left-pane booster cuts through boostback and Super Heavy splash", () => {
    assert.equal(webcastShotAt(255).mount, "boosterHull");
    assert.equal(webcastShotAt(270).mode, "engines");
    assert.equal(webcastShotAt(300).mount, "boosterHull");
    assert.equal(webcastShotAt(315).mount, "gridfin");
    assert.equal(webcastShotAt(340).mode, "engines");
    assert.equal(webcastShotAt(390).mount, "boosterHull");
    assert.equal(webcastShotAt(420).mode, "hull", "T+6:50 back on the ship");
    assert.equal(webcastShotAt(500).mode, "hull");
  });

  it("mounts the payload-bay cam for the Starlink deploy window", () => {
    const bay = webcastShotAt(1006);
    assert.equal(bay.key, "payload-bay");
    assert.equal(bay.mode, "payload");
    assert.equal(bay.mount, "payload");
    assert.equal(webcastShotAt(1279).mode, "payload", "T+21:19 still");
    assert.equal(webcastShotAt(1700).mode, "hull", "T+27:39 deploy complete");
  });

  it("holds flap-cam on relight and entry, hull-cam through the landing burn", () => {
    assert.equal(webcastShotAt(2343).mode, "fin");
    assert.equal(webcastShotAt(2343).mount, "flap");
    assert.equal(webcastShotAt(2933).mount, "flap", "T+48:53 plasma still");
    assert.equal(webcastShotAt(3739).mount, "flap", "T+1:02:19 transonic flap");
    assert.equal(webcastShotAt(3800).mode, "hull");
    assert.equal(webcastShotAt(3912).mode, "hull", "T+1:05:12 landing plume");
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
});

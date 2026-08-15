import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FLIGHT13_WEBCAST_SHOTS,
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
    const open = webcastShotAt(-120);
    assert.equal(open.mode, "starbase");
    assert.equal(open.padTrack, undefined);
    const track = webcastShotAt(-2);
    assert.equal(track.mode, "starbase");
    assert.equal(track.padTrack, true);
    assert.equal(webcastShotAt(16).key, track.key);
  });

  it("uses booster hull-down at max-Q (left-analog onboard)", () => {
    const s = webcastShotAt(56);
    assert.equal(s.mode, "gridfin");
    assert.equal(s.mount, "boosterHull");
  });

  it("picks the left engine-bay pane at hot-stage, then ship hull after sep", () => {
    const hot = webcastShotAt(141);
    assert.equal(hot.mode, "gridfin");
    assert.equal(hot.mount, "engines");
    const hull = webcastShotAt(160);
    assert.equal(hull.mode, "hull");
  });

  it("stays on booster hull through Super Heavy splash, then ship hull", () => {
    assert.equal(webcastShotAt(386).mount, "boosterHull");
    assert.equal(webcastShotAt(400).mount, "boosterHull");
    assert.equal(webcastShotAt(420).mode, "hull");
  });

  it("holds ship hull through coast, entry, and landing approach", () => {
    assert.equal(webcastShotAt(500).mode, "hull");
    assert.equal(webcastShotAt(2845).mode, "hull");
    assert.equal(webcastShotAt(3900).mode, "hull");
  });

  it("cuts to an aerial chase for splashdown", () => {
    const splash = webcastShotAt(3920);
    assert.equal(splash.mode, "chase");
    assert.ok((splash.elevationDeg ?? 0) > 40);
    assert.ok((splash.frameScale ?? 1) > 1.3);
  });

  it("chooses chase for the payload-receding still, hull otherwise mid-coast", () => {
    assert.equal(webcastShotAt(1000).mode, "hull");
    assert.equal(webcastShotAt(1210).mode, "chase");
    assert.equal(webcastShotAt(1660).mode, "hull");
  });
});

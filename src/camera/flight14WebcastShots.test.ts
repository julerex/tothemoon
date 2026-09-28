import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FLIGHT14_WEBCAST_SHOTS,
  webcastShotAt,
} from "./flight14WebcastShots.ts";
import { F14 } from "../physics/flight14Timeline.ts";

describe("FLIGHT14_WEBCAST_SHOTS", () => {
  it("is sorted by t0 with unique keys", () => {
    const keys = new Set<string>();
    for (let i = 0; i < FLIGHT14_WEBCAST_SHOTS.length; i++) {
      const shot = FLIGHT14_WEBCAST_SHOTS[i]!;
      assert.equal(keys.has(shot.key), false, shot.key);
      keys.add(shot.key);
      if (i === 0) continue;
      assert.ok(shot.t0 > FLIGHT14_WEBCAST_SHOTS[i - 1]!.t0, shot.key);
    }
  });

  it("only cuts to cameras the theater can mount", () => {
    for (const shot of FLIGHT14_WEBCAST_SHOTS) {
      assert.notEqual(shot.mode, "free", shot.key);
      if (shot.mount) assert.ok((shot.fov ?? 0) > 0, `${shot.key} mount needs a lens`);
    }
  });

  it("holds payload-bay through the 26-sat window then hull for orbit", () => {
    assert.equal(webcastShotAt(F14.PAYLOAD_START + 10).key, "payload-bay");
    assert.equal(webcastShotAt(F14.PAYLOAD_END + 10).key, "orbit-hull");
  });

  it("cuts to flap at public entry and drone after splash", () => {
    assert.equal(webcastShotAt(F14.ENTRY + 1).key, "entry-flap");
    assert.equal(webcastShotAt(F14.SPLASH + 20).key, "splash-drone");
    assert.equal(webcastShotAt(F14.SPLASH + 20).droneTrack, true);
  });
});

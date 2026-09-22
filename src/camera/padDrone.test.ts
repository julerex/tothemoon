import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PAD_DRONE_HOVER,
  PAD_DRONE_KEYS,
  PAD_DRONE_PERCH_NORTH_KM,
  PAD_DRONE_PERCH_UP_KM,
  PAD_DRONE_TOWER_LOOK,
  PAD_DRONE_TRACK_MAX_KM,
  padDronePoseAt,
  padDroneTracksCraft,
  padDroneUpAxis,
} from "./padDrone.ts";
import { padAerialFromOlp2 } from "../scene/earthTheater/starbaseSurvey.ts";
import { TOWER_H } from "../scene/earthTheater/mechazillaDims.ts";

describe("PAD_DRONE_KEYS", () => {
  it("is sorted and starts on the surveyed T− hover", () => {
    for (let i = 1; i < PAD_DRONE_KEYS.length; i++) {
      assert.ok(PAD_DRONE_KEYS[i]!.t > PAD_DRONE_KEYS[i - 1]!.t);
    }
    assert.equal(PAD_DRONE_HOVER.north, padAerialFromOlp2.z);
    assert.equal(PAD_DRONE_HOVER.west, padAerialFromOlp2.x);
    // Above the tower mid-truss look-at, below the tower top.
    assert.ok(PAD_DRONE_HOVER.up > TOWER_H * 0.5);
    assert.ok(PAD_DRONE_HOVER.up < TOWER_H * 1.2);
  });

  it("holds the wide tableau through the countdown, then climbs", () => {
    const wide = padDronePoseAt(-300);
    assert.deepEqual(padDronePoseAt(-50), wide);
    assert.equal(wide.aim, "tower");
    const climbing = padDronePoseAt(-20);
    assert.ok(climbing.up > wide.up, "off the tableau by T−20");
    assert.equal(climbing.aim, "tower", "still framing Mechazilla on the transit");
    assert.equal(padDronePoseAt(-3).aim, "craft", "on the stack before liftoff");
    assert.equal(padDronePoseAt(0).aim, "craft");
  });

  it("is perched above the pad for the T+8 aerial still", () => {
    const perch = padDronePoseAt(8);
    assert.ok(perch.up > 0.4, "high enough to look down on the stack");
    assert.ok(Math.abs(perch.up - PAD_DRONE_PERCH_UP_KM) < 0.05);
    assert.ok(perch.north < 0, "south of the OLM, off the plume column");
    assert.ok(Math.abs(perch.north - PAD_DRONE_PERCH_NORTH_KM) < 0.03);
    assert.equal(perch.aim, "craft");
    // Theater ascent: ~0.15 km above the pad at T+8, ~0.55 km at T+16. The lens
    // walks from near-nadir to level across that, which is the still sequence.
    const downDeg = (Math.atan2(perch.up - 0.15, Math.abs(perch.north)) * 180) / Math.PI;
    assert.ok(downDeg > 60, `looking down ${downDeg.toFixed(0)}°`);
    const levelDeg = (Math.atan2(perch.up - 0.55, Math.abs(perch.north)) * 180) / Math.PI;
    assert.ok(Math.abs(levelDeg) < 25, `near level ${levelDeg.toFixed(0)}°`);
  });

  it("eases between legs and sinks back to the tableau", () => {
    const a = padDronePoseAt(-30);
    const b = padDronePoseAt(-18);
    const c = padDronePoseAt(-6);
    assert.ok(a.up < b.up && b.up < c.up, "monotone climb");
    const late = padDronePoseAt(600);
    assert.ok(Math.abs(late.up - PAD_DRONE_HOVER.up) < 1e-9);
    assert.equal(late.aim, "tower");
  });

  it("is deterministic and finite-safe", () => {
    assert.deepEqual(padDronePoseAt(12), padDronePoseAt(12));
    assert.deepEqual(padDronePoseAt(Number.NaN), padDronePoseAt(-300));
  });
});

describe("padDroneTracksCraft", () => {
  it("only chases the stack while it is near the pad", () => {
    assert.equal(padDroneTracksCraft("craft", 0.5), true);
    assert.equal(padDroneTracksCraft("craft", PAD_DRONE_TRACK_MAX_KM + 1), false);
    assert.equal(padDroneTracksCraft("tower", 0.5), false);
    assert.equal(padDroneTracksCraft("craft", Number.NaN), false);
  });
});

describe("padDroneUpAxis", () => {
  it("keeps local vertical as screen-up on a level look", () => {
    const up = padDroneUpAxis({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    assert.ok(Math.abs(up.y - 1) < 1e-9);
  });

  it("falls back to the horizontal axis when the lens points at the zenith", () => {
    const up = padDroneUpAxis({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    assert.ok(Math.abs(up.z - 1) < 1e-9, "north, not a degenerate up");
  });

  it("stays unit length and perpendicular to the view", () => {
    const dir = { x: 0.2, y: 0.96, z: 0.19 };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    const unit = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
    const up = padDroneUpAxis(unit, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    assert.ok(Math.abs(Math.hypot(up.x, up.y, up.z) - 1) < 1e-9);
    assert.ok(Math.abs(up.x * unit.x + up.y * unit.y + up.z * unit.z) < 1e-9);
  });
});

describe("PAD_DRONE_TOWER_LOOK", () => {
  it("frames Mechazilla mid-truss", () => {
    assert.equal(PAD_DRONE_TOWER_LOOK.up, TOWER_H * 0.5);
  });
});

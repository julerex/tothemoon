import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  broadcastAltitude,
  broadcastClock,
  broadcastSpeedKmh,
  buildBroadcastHud,
  engineDots,
  velocityTiltDeg,
  type BroadcastEvent,
} from "./broadcastHud.ts";

const ASCENT: readonly BroadcastEvent[] = [
  { id: "liftoff", t: 0 },
  { id: "max-q", t: 58 },
  { id: "staging", t: 141 },
  { id: "seco", t: 487 },
  { id: "entry", t: 2845 },
  { id: "splashdown", t: 3921 },
];

describe("broadcast clock and dials", () => {
  it("splits the webcast clock the way the overlay draws it", () => {
    assert.deepEqual(broadcastClock(70), { sign: "T+", body: "00:01:10" });
    assert.deepEqual(broadcastClock(-120), { sign: "T−", body: "00:02:00" });
  });

  it("prints integer km/h and one-decimal altitude under 100 km", () => {
    assert.equal(broadcastSpeedKmh(1739 / 3600), "1739");
    assert.equal(broadcastSpeedKmh(0), "0");
    assert.deepEqual(broadcastAltitude(12.14), { value: "12.1", unit: "KM" });
    assert.deepEqual(broadcastAltitude(148.4), { value: "148", unit: "KM" });
    assert.equal(broadcastAltitude(384_400).unit, "×10³ KM");
  });

  it("tilts the rocket from vertical with the ground-relative velocity", () => {
    assert.ok(velocityTiltDeg(1, 0) < 1);
    assert.ok(Math.abs(velocityTiltDeg(1, 1) - 45) < 0.01);
    assert.ok(Math.abs(velocityTiltDeg(0, 1) - 90) < 0.01);
    assert.equal(velocityTiltDeg(Number.NaN, 1), 0);
  });
});

describe("broadcast timeline", () => {
  it("shows liftoff, max-q, and stage sep at T+1:10 with the playhead past max-q", () => {
    const hud = buildBroadcastHud({
      t: 70,
      speedKmS: 1739 / 3600,
      altKm: 12.1,
      events: ASCENT,
      staged: false,
      lit: true,
      tiltDeg: 18,
    });
    assert.deepEqual(hud.markers.map((m) => m.label), ["LIFTOFF", "MAX Q", "STAGE SEP"]);
    assert.equal(hud.markers[0]?.above, true);
    assert.equal(hud.markers[1]?.above, false);
    assert.equal(hud.markers[1]?.passed, true);
    assert.equal(hud.markers[2]?.passed, false);
    assert.ok(hud.playheadU > (hud.markers[1]?.u ?? 1));
    assert.ok(hud.playheadU < (hud.markers[2]?.u ?? 0));
    assert.equal(hud.clockBody, "00:01:10");
    assert.equal(hud.speed, "1739");
    assert.equal(hud.altitude, "12.1");
    assert.equal(hud.caption, "STARSHIP FLIGHT TEST");
    assert.equal(hud.engines.length, 33);
    assert.ok(hud.engines.every((e) => e.lit));
  });

  it("slides the three beats forward after stage sep", () => {
    const hud = buildBroadcastHud({
      t: 200,
      speedKmS: 2,
      altKm: 40,
      events: ASCENT,
      staged: true,
      lit: true,
      tiltDeg: 70,
    });
    assert.deepEqual(hud.markers.map((m) => m.id), ["max-q", "staging", "seco"]);
    assert.equal(hud.engines.length, 6);
  });

  it("names the lunar arc when the timeline is not a flight test", () => {
    const hud = buildBroadcastHud({
      t: 10,
      speedKmS: 0.2,
      altKm: 1,
      events: [
        { id: "liftoff", t: 0 },
        { id: "max-q", t: 58 },
        { id: "staging", t: 160 },
        { id: "translunarInjection", t: 1200 },
      ],
      staged: false,
      lit: false,
      tiltDeg: 0,
    });
    assert.equal(hud.caption, "STARBASE → MOON");
    assert.ok(hud.engines.every((e) => !e.lit));
  });
});

describe("engine dots", () => {
  it("keeps the booster cluster inside the dial", () => {
    const dots = engineDots("booster", true);
    assert.equal(dots.length, 33);
    for (const d of dots) {
      assert.ok(d.x * d.x + d.y * d.y <= 1);
    }
  });
});

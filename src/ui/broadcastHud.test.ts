import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  broadcastAltitude,
  broadcastClock,
  broadcastSpeedKmh,
  buildBroadcastHud,
  engineDots,
  gaugeArcPath,
  gaugeChevronPath,
  gaugeFuelDasharray,
  gaugePoint,
  GAUGE_ARC_END_DEG,
  GAUGE_ARC_START_DEG,
  GAUGE_R,
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
      fuel: 0.56,
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
    assert.equal(hud.fuel, 0.56);
  });

  it("slides the three beats forward after stage sep", () => {
    const hud = buildBroadcastHud({
      t: 200,
      speedKmS: 2,
      altKm: 40,
      events: ASCENT,
      staged: true,
      lit: true,
      fuel: 0.4,
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
      fuel: Number.NaN,
      tiltDeg: 0,
    });
    assert.equal(hud.caption, "STARBASE → MOON");
    assert.ok(hud.engines.every((e) => !e.lit));
    assert.equal(hud.fuel, 0);
  });
});

describe("webcast gauge arc", () => {
  it("opens across the bottom, from 8 o'clock clockwise to 4 o'clock", () => {
    const start = gaugePoint(GAUGE_ARC_START_DEG);
    const end = gaugePoint(GAUGE_ARC_END_DEG);
    assert.ok(start.x < 15 && start.y > 70, `8 o'clock start ${start.x},${start.y}`);
    assert.ok(end.x > 85 && end.y > 70, `4 o'clock end ${end.x},${end.y}`);
    const path = gaugeArcPath();
    assert.match(path, new RegExp(`^M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${GAUGE_R}`));
    assert.match(path, / 0 1 1 /);
  });

  it("grows the fuel dash clockwise from empty to full", () => {
    assert.equal(gaugeFuelDasharray(0), "0.00 100");
    assert.equal(gaugeFuelDasharray(0.56), "56.00 100");
    assert.equal(gaugeFuelDasharray(1), "100.00 100");
    assert.equal(gaugeFuelDasharray(2), "100.00 100");
    assert.equal(gaugeFuelDasharray(Number.NaN), "0.00 100");
  });

  it("puts each chevron tip just outside the arc", () => {
    for (const deg of [GAUGE_ARC_START_DEG, GAUGE_ARC_END_DEG]) {
      const path = gaugeChevronPath(deg);
      const tip = path.split(" L ")[1];
      assert.ok(tip, path);
      const [x, y] = tip.split(" ").map(Number);
      const dx = x - 50;
      const dy = y - 50;
      assert.ok(Math.hypot(dx, dy) > GAUGE_R, `tip inside the arc at ${deg}°`);
    }
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

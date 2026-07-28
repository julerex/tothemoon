import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MissionClock } from "./clock.ts";

describe("MissionClock", () => {
  it("starts paused at t=0 with speed 1", () => {
    const c = new MissionClock();
    assert.equal(c.t, 0);
    assert.equal(c.playing, false);
    assert.equal(c.speed, 1);
  });

  it("seek clamps to [0, 1] and notifies subscribers", () => {
    const c = new MissionClock();
    const seen: number[] = [];
    c.subscribe((t) => seen.push(t));
    c.seek(0.5);
    c.seek(-1);
    c.seek(2);
    assert.deepEqual(seen, [0.5, 0, 1]);
    assert.equal(c.t, 1);
  });

  it("unsubscribe stops further notifications", () => {
    const c = new MissionClock();
    let n = 0;
    const unsub = c.subscribe(() => {
      n++;
    });
    c.seek(0.2);
    unsub();
    c.seek(0.4);
    assert.equal(n, 1);
  });

  it("setSpeed rejects zero/non-finite and clamps |speed| ≥ 0.1", () => {
    const c = new MissionClock();
    c.setSpeed(0);
    assert.equal(c.speed, 1);
    c.setSpeed(Number.NaN);
    assert.equal(c.speed, 1);
    c.setSpeed(0.01);
    assert.equal(c.speed, 0.1);
    c.setSpeed(-0.05);
    assert.equal(c.speed, -0.1);
    c.setSpeed(-2);
    assert.equal(c.speed, -2);
  });

  it("tick advances only while playing and pauses at end", () => {
    const c = new MissionClock();
    const duration = 100; // s
    c.tick(10, duration);
    assert.equal(c.t, 0); // still paused
    c.play();
    c.tick(10, duration); // +0.1 at speed 1
    assert.ok(Math.abs(c.t - 0.1) < 1e-12);
    c.setSpeed(10);
    c.tick(10, duration); // +1.0 → clamp to 1 and pause
    assert.equal(c.t, 1);
    assert.equal(c.playing, false);
  });

  it("negative speed rewinds and pauses at start", () => {
    const c = new MissionClock();
    c.seek(0.5);
    c.setSpeed(-1);
    c.play();
    c.tick(60, 100); // −0.6 → clamp to 0
    assert.equal(c.t, 0);
    assert.equal(c.playing, false);
  });

  it("toggle flips playing", () => {
    const c = new MissionClock();
    c.toggle();
    assert.equal(c.playing, true);
    c.toggle();
    assert.equal(c.playing, false);
  });
});

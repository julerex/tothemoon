import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMissionClock,
  clockPause,
  clockPlay,
  clockSeek,
  clockSetSpeed,
  clockTick,
  clockToggle,
  initialClockState,
  normalizeSpeed,
} from "./clock.ts";

describe("pure ClockState transitions", () => {
  it("initialClockState is paused at t=0 speed 1", () => {
    const s = initialClockState();
    assert.deepEqual(s, { t: 0, playing: false, speed: 1 });
  });

  it("normalizeSpeed rejects zero/non-finite and clamps |speed| ≥ 0.1", () => {
    assert.equal(normalizeSpeed(0), 1);
    assert.equal(normalizeSpeed(Number.NaN), 1);
    assert.equal(normalizeSpeed(0.01), 0.1);
    assert.equal(normalizeSpeed(-0.05), -0.1);
    assert.equal(normalizeSpeed(-2), -2);
    assert.equal(normalizeSpeed(5), 5);
  });

  it("clockSetSpeed is pure and structural-share when unchanged", () => {
    const s0 = initialClockState();
    const s1 = clockSetSpeed(s0, 10);
    assert.equal(s1.speed, 10);
    assert.equal(s0.speed, 1);
    assert.equal(clockSetSpeed(s1, 10), s1);
  });

  it("play / pause / toggle", () => {
    const s0 = initialClockState();
    const playing = clockPlay(s0);
    assert.equal(playing.playing, true);
    assert.equal(clockPlay(playing), playing);
    const paused = clockPause(playing);
    assert.equal(paused.playing, false);
    assert.equal(clockToggle(paused).playing, true);
    assert.equal(clockToggle(playing).playing, false);
  });

  it("clockSeek clamps to [0, 1]", () => {
    const s0 = initialClockState();
    assert.equal(clockSeek(s0, 0.5).t, 0.5);
    assert.equal(clockSeek(s0, -1).t, 0);
    assert.equal(clockSeek(s0, 2).t, 1);
    const mid = clockSeek(s0, 0.5);
    assert.equal(clockSeek(mid, 0.5), mid);
  });

  it("clockTick advances only while playing and pauses at end", () => {
    const duration = 100;
    const s0 = initialClockState();
    assert.equal(clockTick(s0, 10, duration), s0);
    const playing = clockPlay(s0);
    const mid = clockTick(playing, 10, duration);
    assert.ok(Math.abs(mid.t - 0.1) < 1e-12);
    assert.equal(mid.playing, true);
    const fast = clockSetSpeed(mid, 10);
    const end = clockTick(fast, 10, duration);
    assert.equal(end.t, 1);
    assert.equal(end.playing, false);
  });

  it("clockTick rewinds and pauses at start", () => {
    let s = clockSeek(initialClockState(), 0.5);
    s = clockSetSpeed(s, -1);
    s = clockPlay(s);
    s = clockTick(s, 60, 100);
    assert.equal(s.t, 0);
    assert.equal(s.playing, false);
  });
});

describe("MissionClock shell", () => {
  it("starts paused at t=0 with speed 1", () => {
    const c = createMissionClock();
    assert.equal(c.t, 0);
    assert.equal(c.playing, false);
    assert.equal(c.speed, 1);
    assert.deepEqual(c.getState(), initialClockState());
  });

  it("seek clamps to [0, 1] and notifies subscribers", () => {
    const c = createMissionClock();
    const seen: number[] = [];
    c.subscribe((t) => seen.push(t));
    c.seek(0.5);
    c.seek(-1);
    c.seek(2);
    assert.deepEqual(seen, [0.5, 0, 1]);
    assert.equal(c.t, 1);
  });

  it("unsubscribe stops further notifications", () => {
    const c = createMissionClock();
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
    const c = createMissionClock();
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
    const c = createMissionClock();
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
    const c = createMissionClock();
    c.seek(0.5);
    c.setSpeed(-1);
    c.play();
    c.tick(60, 100); // −0.6 → clamp to 0
    assert.equal(c.t, 0);
    assert.equal(c.playing, false);
  });

  it("toggle flips playing", () => {
    const c = createMissionClock();
    c.toggle();
    assert.equal(c.playing, true);
    c.toggle();
    assert.equal(c.playing, false);
  });
});

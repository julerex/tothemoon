/**
 * Unit tests for mission-time news ticker beats.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNewsBeats,
  expandEventCopy,
  formatTickerCrawl,
  formatTickerText,
  isFlightTestTimeline,
  NEWS_TICKER_BASE_PERIOD_S,
  newsAtMissionTime,
  newsTickerPeriodS,
} from "./newsTicker.ts";
import type { MissionTimeline } from "./timeline.ts";

function lunarTimeline(): MissionTimeline {
  return {
    durationS: 1000,
    segments: [
      {
        phase: "launch",
        label: "Liftoff",
        shortLabel: "Lift",
        t0: 0,
        t1: 12,
        u0: 0,
        u1: 0.012,
      },
      {
        phase: "ascent",
        label: "Ascent",
        shortLabel: "Ascent",
        t0: 12,
        t1: 200,
        u0: 0.012,
        u1: 0.2,
      },
      {
        phase: "coast",
        label: "Coast",
        shortLabel: "Coast",
        t0: 200,
        t1: 1000,
        u0: 0.2,
        u1: 1,
      },
    ],
    events: [
      { id: "liftoff", t: 0, u: 0, title: "Liftoff", detail: "Starbase" },
      { id: "staging", t: 150, u: 0.15, title: "Staging", detail: "Sep" },
      {
        id: "coast",
        t: 200,
        u: 0.2,
        title: "Translunar injection complete",
        detail: "Ballistic",
      },
    ],
  };
}

function flight13Timeline(): MissionTimeline {
  return {
    durationS: 3000,
    segments: [
      {
        phase: "launch",
        label: "Liftoff",
        shortLabel: "Lift",
        t0: 0,
        t1: 12,
        u0: 0,
        u1: 0.004,
      },
      {
        phase: "ascent",
        label: "Ascent",
        shortLabel: "Ascent",
        t0: 12,
        t1: 485,
        u0: 0.004,
        u1: 0.16,
      },
      {
        phase: "coast",
        label: "Coast",
        shortLabel: "Coast",
        t0: 485,
        t1: 2338,
        u0: 0.16,
        u1: 0.78,
      },
      {
        phase: "entry",
        label: "Entry",
        shortLabel: "Entry",
        t0: 2338,
        t1: 2800,
        u0: 0.78,
        u1: 0.93,
      },
      {
        phase: "descent",
        label: "Descent",
        shortLabel: "Descent",
        t0: 2800,
        t1: 3000,
        u0: 0.93,
        u1: 1,
      },
      {
        phase: "splashdown",
        label: "Splash",
        shortLabel: "Splash",
        t0: 3000,
        t1: 3000,
        u0: 1,
        u1: 1,
      },
    ],
    events: [
      { id: "liftoff", t: 0, u: 0, title: "Liftoff" },
      { id: "max-q", t: 58, u: 0.02, title: "Max Q" },
      { id: "staging", t: 141, u: 0.05, title: "Staging" },
      { id: "seco", t: 485, u: 0.16, title: "SECO" },
      { id: "relight", t: 2338, u: 0.78, title: "Relight" },
      { id: "entry", t: 2400, u: 0.8, title: "Entry" },
      { id: "splashdown", t: 3000, u: 1, title: "Splashdown" },
    ],
  };
}

describe("isFlightTestTimeline", () => {
  it("detects entry/splashdown packs", () => {
    assert.equal(isFlightTestTimeline(lunarTimeline()), false);
    assert.equal(isFlightTestTimeline(flight13Timeline()), true);
  });
});

describe("expandEventCopy", () => {
  it("uses Flight 13-specific liftoff copy", () => {
    const { line } = expandEventCopy(
      { id: "liftoff", t: 0, u: 0, title: "Liftoff" },
      true,
    );
    assert.match(line, /Flight 13/i);
  });

  it("falls back to title for unknown ids", () => {
    const { line } = expandEventCopy(
      { id: "custom-x", t: 1, u: 0, title: "Hello", detail: "World" },
      false,
    );
    assert.match(line, /Hello/);
    assert.match(line, /World/);
  });
});

describe("buildNewsBeats + newsAtMissionTime", () => {
  it("uses T−5:00 pad-hold copy during countdown", () => {
    const beats = buildNewsBeats(flight13Timeline());
    const hold = newsAtMissionTime(beats, -300);
    assert.ok(hold);
    assert.equal(hold!.id, "prelaunch");
    assert.match(hold!.line, /T−5:00/);
    assert.equal(newsAtMissionTime(beats, -1)!.id, "prelaunch");
  });

  it("returns beats sorted by time and covers liftoff", () => {
    const beats = buildNewsBeats(flight13Timeline());
    assert.ok(beats.length >= 5);
    for (let i = 1; i < beats.length; i++) {
      assert.ok(beats[i]!.t >= beats[i - 1]!.t);
    }
    const at0 = newsAtMissionTime(beats, 0);
    assert.ok(at0);
    assert.match(at0!.line, /lift|Starship|Starbase/i);
  });

  it("advances headline after Max Q and staging", () => {
    const beats = buildNewsBeats(flight13Timeline());
    const mid = newsAtMissionTime(beats, 100);
    assert.ok(mid);
    assert.match(mid!.line, /Max Q|aerodynamic/i);
    const afterStage = newsAtMissionTime(beats, 150);
    assert.ok(afterStage);
    assert.match(afterStage!.line, /stag|Hot-stag|separat/i);
  });

  it("is scrub-stable (same t → same beat)", () => {
    const beats = buildNewsBeats(flight13Timeline());
    const a = newsAtMissionTime(beats, 2400);
    const b = newsAtMissionTime(beats, 2400);
    assert.deepEqual(a, b);
  });

  it("formatTickerText is headline only (no wire / BREAKING)", () => {
    const beats = buildNewsBeats(lunarTimeline());
    const b = newsAtMissionTime(beats, 0)!;
    const text = formatTickerText(b);
    assert.ok(text.length > 10);
    assert.ok(!/^BREAKING/i.test(text));
    assert.ok(!text.includes("LAUNCH  ·"));
  });

  it("formatTickerCrawl joins a trail of beats", () => {
    const beats = buildNewsBeats(flight13Timeline());
    const crawl = formatTickerCrawl(beats, 200, 2);
    assert.ok(crawl.length > 20);
  });

  it("newsTickerPeriodS scales with |playback rate|", () => {
    assert.equal(newsTickerPeriodS(1), NEWS_TICKER_BASE_PERIOD_S);
    assert.equal(newsTickerPeriodS(10), NEWS_TICKER_BASE_PERIOD_S / 10);
    assert.equal(newsTickerPeriodS(-10), NEWS_TICKER_BASE_PERIOD_S / 10);
    assert.ok(newsTickerPeriodS(0) >= NEWS_TICKER_BASE_PERIOD_S);
  });
});

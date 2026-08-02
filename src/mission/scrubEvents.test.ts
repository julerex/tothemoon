import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MissionEvent } from "./timeline.ts";
import {
  buildScrubEventTicks,
  isSecondaryScrubEvent,
} from "./scrubEvents.ts";

function ev(id: string, t: number): MissionEvent {
  return { id, t, u: t / 1000, title: id };
}

describe("buildScrubEventTicks", () => {
  it("maps each event and flags secondary beats", () => {
    const events = [
      ev("liftoff", 0),
      ev("staging", 100),
      ev("dogleg", 150),
      ev("tli", 200),
      ev("boostback", 104),
    ];
    const ticks = buildScrubEventTicks(events);
    assert.equal(ticks.length, 5);
    assert.equal(ticks[0]!.secondary, false);
    assert.equal(ticks[1]!.secondary, true);
    assert.equal(ticks[2]!.secondary, true);
    assert.equal(ticks[3]!.secondary, false);
    assert.equal(ticks[4]!.secondary, true);
    assert.equal(ticks[1]!.event.id, "staging");
  });

  it("returns empty for empty input", () => {
    assert.deepEqual(buildScrubEventTicks([]), []);
  });
});

describe("isSecondaryScrubEvent", () => {
  it("recognizes staging / dogleg / RTLS theater ids", () => {
    assert.equal(isSecondaryScrubEvent("staging"), true);
    assert.equal(isSecondaryScrubEvent("dogleg"), true);
    assert.equal(isSecondaryScrubEvent("boostback"), true);
    assert.equal(isSecondaryScrubEvent("booster-catch"), true);
    assert.equal(isSecondaryScrubEvent("liftoff"), false);
    assert.equal(isSecondaryScrubEvent("tli"), false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PhaseId, Sample } from "../physics/mission.ts";
import { v3 } from "../physics/vec3.ts";
import {
  BOOKMARK_IDS,
  bookmarkForDigit,
  keymapDigitAction,
  cycleBookmark,
  buildBookmarks,
  openingBookmark,
} from "./bookmarks.ts";
import { PRELAUNCH_COUNTDOWN_S } from "./prelaunch.ts";
import { buildTimeline } from "./timeline.ts";

function sample(
  t: number,
  phase: PhaseId,
  opts: Partial<Sample> = {},
): Sample {
  return {
    t,
    pos: v3(t, 0, 0),
    vel: v3(1, 0, 0),
    phase,
    burning: opts.burning ?? false,
    fuelBooster:
      opts.fuelBooster ?? (phase === "launch" || phase === "ascent" ? 1 : 0),
    fuelShip: opts.fuelShip ?? 1,
    thrustN: opts.thrustN ?? 0,
    staged: opts.staged ?? !(phase === "launch" || phase === "ascent"),
  };
}

/** Full theater arc with staging, lunar orbit insertion, and soft land. */
function landingArcSamples(): Sample[] {
  return [
    sample(0, "launch", { staged: false }),
    sample(50, "ascent", { staged: false, fuelBooster: 0.5 }),
    sample(100, "lowEarthOrbit", { staged: true, fuelBooster: 0 }),
    sample(200, "translunarInjection", { staged: true }),
    sample(300, "coast", { staged: true }),
    sample(800, "approach", { staged: true }),
    sample(850, "braking", { staged: true }),
    sample(900, "descent", { staged: true }),
    sample(950, "landed", { staged: true }),
  ];
}

describe("buildBookmarks", () => {
  it("fills a landing arc through touchdown and keeps at most ten bookmarks", () => {
    const tl = buildTimeline(landingArcSamples(), 1000);
    const marks = buildBookmarks(tl);
    assert.ok(marks.length <= 10);
    assert.equal(marks[0]!.id, "opening");
    assert.equal(marks[marks.length - 1]!.id, "touchdown");
    assert.deepEqual(
      marks.map((m) => m.id),
      [
        "opening",
        "pad",
        "lowEarthOrbit",
        "staging",
        "translunarInjection",
        "landingBurn",
        "boosterCatch",
        "halfway",
        "lunarOrbitInsertion",
        "touchdown",
      ],
    );
    const byId = (id: string) => marks.find((m) => m.id === id);
    assert.equal(byId("opening")!.t, -PRELAUNCH_COUNTDOWN_S);
    assert.equal(byId("opening")!.u, 0);
    assert.equal(byId("pad")!.mode, "starbase");
    assert.equal(byId("staging")!.mode, "chase");
    assert.equal(byId("translunarInjection")!.mode, "chase");
    assert.equal(byId("halfway")!.mode, "earth");
    assert.ok((byId("halfway")!.frameScale ?? 1) > 1);
    assert.equal(byId("lunarOrbitInsertion")!.mode, "moon");
    assert.equal(byId("touchdown")!.mode, "chase");
    assert.equal(byId("touchdown")!.label, "Touchdown");
  });

  it("places halfway at the midpoint of the coast segment", () => {
    const tl = buildTimeline(landingArcSamples(), 1000);
    const marks = buildBookmarks(tl);
    const half = marks.find((m) => m.id === "halfway");
    assert.ok(half);
    // coast [300, 800] → mid 550
    assert.equal(half!.t, 550);
    assert.equal(half!.u, 0.55);
  });

  it("omits staging when the stack never stages", () => {
    const samples: Sample[] = [
      sample(0, "launch", { staged: true }),
      sample(10, "translunarInjection", { staged: true }),
      sample(20, "coast", { staged: true }),
      sample(100, "impact", { staged: true }),
    ];
    const tl = buildTimeline(samples, 100);
    const marks = buildBookmarks(tl);
    assert.ok(!marks.some((m) => m.id === "staging"));
    assert.ok(marks.some((m) => m.id === "pad"));
    assert.ok(marks.some((m) => m.id === "translunarInjection"));
  });

  it("labels Flight 13 splashdown as Splash on the touchdown bookmark", () => {
    const samples: Sample[] = [
      sample(0, "launch", { staged: false }),
      sample(50, "ascent", { staged: false }),
      sample(150, "coast", { staged: true }),
      sample(2000, "entry", { staged: true }),
      sample(2500, "descent", { staged: true }),
      sample(2800, "splashdown", { staged: true }),
    ];
    const tl = buildTimeline(samples, 4200);
    const marks = buildBookmarks(tl);
    const end = marks.find((m) => m.id === "touchdown");
    assert.ok(end);
    assert.equal(end!.label, "Splashdown");
    assert.equal(end!.shortLabel, "Splash");
    assert.equal(end!.mode, "chase");
    assert.equal(end!.t, 2800);
  });

  it("uses Impact framing when there is no soft landing", () => {
    const samples: Sample[] = [
      sample(0, "launch", { staged: false }),
      sample(50, "ascent", { staged: false }),
      sample(100, "lowEarthOrbit", { staged: true }),
      sample(200, "translunarInjection", { staged: true }),
      sample(300, "coast", { staged: true }),
      sample(700, "impact", { staged: true }),
    ];
    const tl = buildTimeline(samples, 700);
    const marks = buildBookmarks(tl);
    const end = marks.find((m) => m.id === "touchdown");
    assert.ok(end);
    assert.equal(end!.label, "Impact");
    assert.equal(end!.shortLabel, "Impact");
    assert.equal(end!.mode, "moon");
    assert.ok(!marks.some((m) => m.id === "loi"));
  });

  it("keeps times sorted and u in [0, 1]", () => {
    const tl = buildTimeline(landingArcSamples(), 1000);
    const marks = buildBookmarks(tl);
    for (let i = 1; i < marks.length; i++) {
      assert.ok(marks[i]!.t >= marks[i - 1]!.t);
    }
    for (const m of marks) {
      assert.ok(m.u >= 0 && m.u <= 1);
      if (m.id === "opening") assert.equal(m.u, 0);
      else assert.equal(m.u, m.t / 1000);
      assert.equal(typeof m.frame, "boolean");
    }
  });

  it("still offers Pad at t=0 for an empty sample list", () => {
    const tl = buildTimeline([], 100);
    // pad resolves to t=0 via fallback; no other beats without segments/events
    const marks = buildBookmarks(tl);
    assert.ok(marks.length >= 2);
    assert.equal(marks[0]!.id, "opening");
    assert.equal(marks.find((m) => m.id === "pad")!.t, 0);
  });

  it("exports a stable BOOKMARK_IDS catalog", () => {
    assert.deepEqual([...BOOKMARK_IDS], [
      "pad",
      "maxQ",
      "staging",
      "boostback",
      "lowEarthOrbit",
      "landingBurn",
      "boosterCatch",
      "seco",
      "translunarInjection",
      "payload",
      "coastStart",
      "halfway",
      "entry",
      "lunarOrbitInsertion",
      "touchdown",
    ]);
  });
});

describe("bookmarkForDigit", () => {
  it("maps 1-based digits onto the built list", () => {
    const tl = buildTimeline(landingArcSamples(), 1000);
    const marks = buildBookmarks(tl);
    assert.equal(bookmarkForDigit(marks, 0)?.id, "opening");
    assert.equal(bookmarkForDigit(marks, 0)?.t, openingBookmark().t);
    assert.equal(bookmarkForDigit(marks, 0)?.u, 0);
    assert.equal(bookmarkForDigit(marks, 1)?.id, "pad");
    assert.equal(bookmarkForDigit(marks, 4)?.id, "translunarInjection");
    assert.equal(bookmarkForDigit(marks, 9)?.id, "touchdown");
    assert.equal(bookmarkForDigit(marks, 99), null);
  });
});

describe("keymapDigitAction", () => {
  it("names Flight 13 number keys 0–9 by the bookmark stage", () => {
    const tl = buildTimeline(
      [
        sample(0, "launch", { staged: false, burning: true }),
        sample(142, "ascent", { staged: true, burning: true, fuelBooster: 0 }),
        sample(400, "ascent", { staged: true, burning: true, thrustN: 2e6 }),
        sample(434, "coast", { staged: true, burning: false }),
        sample(2338, "entry", { staged: true }),
        sample(3907, "descent", { staged: true }),
        sample(3922.5, "splashdown", { staged: true }),
      ],
      4200,
    );
    const marks = buildBookmarks(tl);
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => keymapDigitAction(marks, digit)),
      ["T−5", "Pad", "Max Q", "Staging", "Booster land", "SECO", "Payload", "Halfway", "Entry", "Splashdown"],
    );
    assert.equal(keymapDigitAction(marks, 10), undefined);
  });

  it("names a long lunar coast on keys 0–9", () => {
    const tl = buildTimeline(
      [
        sample(0, "launch", { staged: false }),
        sample(13, "ascent", { staged: false }),
        sample(147, "ascent", { staged: true, fuelBooster: 0 }),
        sample(304, "lowEarthOrbit", { staged: true }),
        sample(6930, "translunarInjection", { staged: true }),
        sample(7163, "coast", { staged: true }),
        sample(700_000, "coast", { staged: true }),
      ],
      710_000,
    );
    const marks = buildBookmarks(tl);
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => keymapDigitAction(marks, digit)),
      [
        "T−5",
        "Pad",
        "Staging",
        "Boostback",
        "Earth orbit",
        "Booster land",
        "Booster catch",
        "Translunar injection",
        "Coast",
        "Halfway",
      ],
    );
  });
});

describe("cycleBookmark", () => {
  it("steps forward and wraps", () => {
    const tl = buildTimeline(landingArcSamples(), 1000);
    const marks = buildBookmarks(tl);
    const first = cycleBookmark(marks, -1, 1);
    assert.equal(first?.index, 0);
    assert.equal(first?.bookmark.id, "opening");
    const second = cycleBookmark(marks, 0, 1);
    assert.equal(second?.index, 1);
    assert.equal(second?.bookmark.id, "pad");
    const wrap = cycleBookmark(marks, marks.length - 1, 1);
    assert.equal(wrap?.index, 0);
  });

  it("steps backward from an unknown index to the last bookmark", () => {
    const tl = buildTimeline(landingArcSamples(), 1000);
    const marks = buildBookmarks(tl);
    const last = cycleBookmark(marks, -1, -1);
    assert.equal(last?.index, marks.length - 1);
    assert.equal(cycleBookmark([], -1, 1), null);
  });
});

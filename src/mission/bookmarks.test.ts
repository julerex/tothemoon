import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PhaseId, Sample } from "../physics/mission.ts";
import { v3 } from "../physics/vec3.ts";
import {
  BOOKMARK_IDS,
  bookmarkForDigit,
  buildBookmarks,
} from "./bookmarks.ts";
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
  it("emits Pad · Stage · translunar injection · Half · lunar orbit insertion · Land for a landing arc", () => {
    const tl = buildTimeline(landingArcSamples(), 1000);
    const marks = buildBookmarks(tl);
    assert.deepEqual(
      marks.map((m) => m.id),
      [
        "pad",
        "staging",
        "translunarInjection",
        "halfway",
        "lunarOrbitInsertion",
        "touchdown",
      ],
    );
    assert.equal(marks[0]!.mode, "starbase");
    assert.equal(marks[1]!.mode, "chase");
    assert.equal(marks[2]!.mode, "chase");
    assert.equal(marks[3]!.mode, "earth");
    assert.ok((marks[3]!.frameScale ?? 1) > 1);
    assert.equal(marks[4]!.mode, "moon");
    assert.equal(marks[5]!.mode, "chase");
    assert.equal(marks[5]!.label, "Touchdown");
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
      assert.equal(m.u, m.t / 1000);
      assert.equal(typeof m.frame, "boolean");
    }
  });

  it("still offers Pad at t=0 for an empty sample list", () => {
    const tl = buildTimeline([], 100);
    // pad resolves to t=0 via fallback; no other beats without segments/events
    const marks = buildBookmarks(tl);
    assert.ok(marks.length >= 1);
    assert.equal(marks[0]!.id, "pad");
    assert.equal(marks[0]!.t, 0);
  });

  it("exports a stable BOOKMARK_IDS order", () => {
    assert.deepEqual([...BOOKMARK_IDS], [
      "pad",
      "staging",
      "translunarInjection",
      "halfway",
      "lunarOrbitInsertion",
      "touchdown",
    ]);
  });
});

describe("bookmarkForDigit", () => {
  it("maps 1-based digits onto the built list", () => {
    const tl = buildTimeline(landingArcSamples(), 1000);
    const marks = buildBookmarks(tl);
    assert.equal(bookmarkForDigit(marks, 1)?.id, "pad");
    assert.equal(bookmarkForDigit(marks, 3)?.id, "translunarInjection");
    assert.equal(bookmarkForDigit(marks, marks.length)?.id, "touchdown");
    assert.equal(bookmarkForDigit(marks, 0), null);
    assert.equal(bookmarkForDigit(marks, 99), null);
  });
});

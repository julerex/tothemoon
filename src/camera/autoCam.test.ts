import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PhaseId } from "../physics/missionTypes.ts";
import {
  autoCamForPhase,
  autoCamForPhaseFlight13,
  autoCamForStaging,
  finaleChaseBias,
  lunarFinaleChaseScale,
  lunarFinaleShouldCut,
  nextAutoCamCut,
} from "./autoCam.ts";

const ALL_PHASES: PhaseId[] = [
  "launch",
  "ascent",
  "lowEarthOrbit",
  "translunarInjection",
  "coast",
  "approach",
  "braking",
  "descent",
  "landed",
  "impact",
  "entry",
  "splashdown",
];

describe("autoCamForPhase (lunar)", () => {
  it("returns a focus mode for every PhaseId", () => {
    for (const phase of ALL_PHASES) {
      const s = autoCamForPhase(phase, "lunar");
      assert.ok(s.mode, phase);
      assert.equal(typeof s.frame, "boolean");
    }
  });

  it("uses pad framing at liftoff and ship chase for powered early flight", () => {
    assert.equal(autoCamForPhase("launch", "lunar").mode, "starbase");
    assert.equal(autoCamForPhase("ascent", "lunar").mode, "chase");
    assert.equal(autoCamForPhase("lowEarthOrbit", "lunar").mode, "chase");
    assert.equal(autoCamForPhase("translunarInjection", "lunar").mode, "chase");
  });

  it("uses a wide Earth overview for ballistic coast", () => {
    const coast = autoCamForPhase("coast", "lunar");
    assert.equal(coast.mode, "earth");
    assert.equal(coast.frame, true);
    assert.ok((coast.frameScale ?? 1) > 1);
  });

  it("favors Moon for Lunar orbit insertion / low lunar orbit and Ship for descent / land", () => {
    assert.equal(autoCamForPhase("approach", "lunar").mode, "moon");
    assert.equal(autoCamForPhase("braking", "lunar").mode, "moon");
    assert.equal(autoCamForPhase("descent", "lunar").mode, "chase");
    assert.equal(autoCamForPhase("landed", "lunar").mode, "chase");
    assert.equal(autoCamForPhase("impact", "lunar").mode, "moon");
  });
});

describe("autoCamForPhaseFlight13", () => {
  it("returns a focus mode for every PhaseId", () => {
    for (const phase of ALL_PHASES) {
      const s = autoCamForPhaseFlight13(phase);
      assert.ok(s.mode, phase);
    }
  });

  it("uses trench at launch, ship on ascent, ship on coast, ship on entry", () => {
    assert.equal(autoCamForPhaseFlight13("launch").mode, "trench");
    assert.equal(autoCamForPhaseFlight13("ascent").mode, "chase");
    assert.equal(autoCamForPhaseFlight13("coast").mode, "chase");
    assert.equal(autoCamForPhaseFlight13("entry").mode, "chase");
    assert.equal(autoCamForPhaseFlight13("descent").mode, "chase");
    assert.equal(autoCamForPhaseFlight13("splashdown").mode, "chase");
    assert.ok((autoCamForPhaseFlight13("splashdown").frameScale ?? 1) > 1.3);
    assert.ok((autoCamForPhaseFlight13("descent").frameScale ?? 1) > 1);
  });
});

describe("autoCamForStaging", () => {
  it("cuts to framed ship chase on lunar profile", () => {
    const s = autoCamForStaging("lunar");
    assert.equal(s.mode, "chase");
    assert.equal(s.frame, true);
  });

  it("cuts to booster grid-fin cam on Flight 13 profile", () => {
    const s = autoCamForStaging("flight13");
    assert.equal(s.mode, "gridfin");
    assert.equal(s.frame, true);
  });
});

describe("nextAutoCamCut", () => {
  it("does nothing when disabled (still advances prev markers)", () => {
    const r = nextAutoCamCut(false, "ascent", false, {
      phase: "launch",
      staged: false,
    });
    assert.equal(r.suggestion, null);
    assert.equal(r.phase, "ascent");
  });

  it("suggests on first tick (null prev phase) — lunar pad", () => {
    const r = nextAutoCamCut(
      true,
      "launch",
      false,
      { phase: null, staged: false },
      "lunar",
    );
    assert.ok(r.suggestion);
    assert.equal(r.suggestion!.mode, "starbase");
  });

  it("suggests trench on first Flight 13 launch tick", () => {
    const r = nextAutoCamCut(
      true,
      "launch",
      false,
      { phase: null, staged: false },
      "flight13",
    );
    assert.ok(r.suggestion);
    assert.equal(r.suggestion!.mode, "trench");
  });

  it("suggests only when phase changes", () => {
    const same = nextAutoCamCut(true, "coast", false, {
      phase: "coast",
      staged: false,
    });
    assert.equal(same.suggestion, null);

    const change = nextAutoCamCut(
      true,
      "coast",
      false,
      { phase: "translunarInjection", staged: true },
      "lunar",
    );
    assert.ok(change.suggestion);
    assert.equal(change.suggestion!.mode, "earth");
  });

  it("suggests ship chase on lunar staging rising edge", () => {
    const r = nextAutoCamCut(
      true,
      "ascent",
      true,
      { phase: "ascent", staged: false },
      "lunar",
    );
    assert.ok(r.suggestion);
    assert.equal(r.suggestion!.mode, "chase");
  });

  it("suggests gridfin on Flight 13 staging rising edge", () => {
    const r = nextAutoCamCut(
      true,
      "ascent",
      true,
      { phase: "ascent", staged: false },
      "flight13",
    );
    assert.ok(r.suggestion);
    assert.equal(r.suggestion!.mode, "gridfin");
  });

  it("does not re-fire staging while already staged", () => {
    const r = nextAutoCamCut(true, "lowEarthOrbit", true, {
      phase: "lowEarthOrbit",
      staged: true,
    });
    assert.equal(r.suggestion, null);
  });
});

describe("lunarFinaleChaseScale", () => {
  it("is null outside the last 30 s", () => {
    assert.equal(lunarFinaleChaseScale(40), null);
    assert.equal(lunarFinaleChaseScale(-20), null);
  });

  it("widens toward landT", () => {
    const far = lunarFinaleChaseScale(30);
    const near = lunarFinaleChaseScale(0);
    assert.ok(far != null && near != null);
    assert.ok(near > far);
    assert.ok(near > 1.3);
  });

  it("cuts once on descent when Auto-cam is on", () => {
    assert.equal(lunarFinaleShouldCut(true, "descent", 10, false), true);
    assert.equal(lunarFinaleShouldCut(true, "descent", 10, true), false);
    assert.equal(lunarFinaleShouldCut(false, "descent", 10, false), false);
    assert.equal(lunarFinaleShouldCut(true, "approach", 10, false), false);
  });
});

describe("finaleChaseBias", () => {
  it("is identity when Auto-cam is off", () => {
    assert.deepEqual(finaleChaseBias(false, "flight13", "splashdown"), {
      lookAheadScale: 1, lookDownKm: 0,
    });
  });

  it("looks down more on splash than mid-descent", () => {
    const d = finaleChaseBias(true, "flight13", "descent");
    const s = finaleChaseBias(true, "flight13", "splashdown");
    assert.ok(s.lookDownKm > d.lookDownKm);
    assert.ok(s.lookAheadScale > d.lookAheadScale);
  });
});

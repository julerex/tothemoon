import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PhaseId } from "../physics/missionTypes.ts";
import {
  autoCamForPhase,
  autoCamForStaging,
  nextAutoCamCut,
} from "./autoCam.ts";

const ALL_PHASES: PhaseId[] = [
  "launch",
  "ascent",
  "leo",
  "tli",
  "coast",
  "approach",
  "braking",
  "descent",
  "landed",
  "impact",
];

describe("autoCamForPhase", () => {
  it("returns a focus mode for every PhaseId", () => {
    for (const phase of ALL_PHASES) {
      const s = autoCamForPhase(phase);
      assert.ok(s.mode, phase);
      assert.equal(typeof s.frame, "boolean");
    }
  });

  it("uses pad framing at liftoff and ship chase for powered early flight", () => {
    assert.equal(autoCamForPhase("launch").mode, "starbase");
    assert.equal(autoCamForPhase("ascent").mode, "chase");
    assert.equal(autoCamForPhase("leo").mode, "chase");
    assert.equal(autoCamForPhase("tli").mode, "chase");
  });

  it("uses a wide Earth overview for ballistic coast", () => {
    const coast = autoCamForPhase("coast");
    assert.equal(coast.mode, "earth");
    assert.equal(coast.frame, true);
    assert.ok((coast.frameScale ?? 1) > 1);
  });

  it("favors Moon for LOI / LLO and Ship for descent / land", () => {
    assert.equal(autoCamForPhase("approach").mode, "moon");
    assert.equal(autoCamForPhase("braking").mode, "moon");
    assert.equal(autoCamForPhase("descent").mode, "chase");
    assert.equal(autoCamForPhase("landed").mode, "chase");
    assert.equal(autoCamForPhase("impact").mode, "moon");
  });
});

describe("autoCamForStaging", () => {
  it("cuts to framed ship chase", () => {
    const s = autoCamForStaging();
    assert.equal(s.mode, "chase");
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

  it("suggests on first tick (null prev phase)", () => {
    const r = nextAutoCamCut(true, "launch", false, {
      phase: null,
      staged: false,
    });
    assert.ok(r.suggestion);
    assert.equal(r.suggestion!.mode, "starbase");
  });

  it("suggests only when phase changes", () => {
    const same = nextAutoCamCut(true, "coast", false, {
      phase: "coast",
      staged: false,
    });
    assert.equal(same.suggestion, null);

    const change = nextAutoCamCut(true, "coast", false, {
      phase: "tli",
      staged: true,
    });
    assert.ok(change.suggestion);
    assert.equal(change.suggestion!.mode, "earth");
  });

  it("suggests ship chase on staging rising edge within the same phase", () => {
    const r = nextAutoCamCut(true, "ascent", true, {
      phase: "ascent",
      staged: false,
    });
    assert.ok(r.suggestion);
    assert.equal(r.suggestion!.mode, "chase");
  });

  it("does not re-fire staging while already staged", () => {
    const r = nextAutoCamCut(true, "leo", true, {
      phase: "leo",
      staged: true,
    });
    assert.equal(r.suggestion, null);
  });
});

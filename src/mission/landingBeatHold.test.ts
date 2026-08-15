/**
 * Unit tests for the landing-beat hold reducer (`landingBeatHold.ts`).
 *
 * Covers the rising complete edge, the one-shot settle, the wall-clock card
 * delay, the paused-at-complete case, and scrubbing back before complete.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LANDING_BEAT_HOLD_S } from "./landingBeat.ts";
import {
  createLandingBeatState,
  stepLandingBeat,
  type LandingBeatInput,
} from "./landingBeatHold.ts";

const AT_LANDING: LandingBeatInput = {
  completeRaw: true,
  phase: "landed",
  playing: true,
  nowMs: 10_000,
  clockSpeed: 1,
  staged: true,
};

describe("stepLandingBeat before complete", () => {
  it("reports no card and asks for no effects", () => {
    const step = stepLandingBeat(createLandingBeatState(), {
      ...AT_LANDING, completeRaw: false, phase: "descent",
    });
    assert.equal(step.showCompleteCard, false);
    assert.equal(step.effects.settleCamera, null);
    assert.equal(step.effects.pinSpeed1x, false);
    assert.equal(step.state.wasComplete, false);
  });

  it("clears a running hold when scrubbing back", () => {
    const held = stepLandingBeat(createLandingBeatState(), AT_LANDING).state;
    assert.equal(held.wasComplete, true);
    const rewound = stepLandingBeat(held, { ...AT_LANDING, completeRaw: false }).state;
    assert.deepEqual(rewound, createLandingBeatState());
  });
});

describe("stepLandingBeat at the complete edge", () => {
  it("latches the beat kind and starts the hold clock", () => {
    const step = stepLandingBeat(createLandingBeatState(), AT_LANDING);
    assert.equal(step.state.kind, "landed");
    assert.equal(step.state.wasComplete, true);
    assert.equal(step.state.holdStartMs, AT_LANDING.nowMs);
  });

  it("settles the camera onto the landed chase view once", () => {
    const first = stepLandingBeat(createLandingBeatState(), AT_LANDING);
    assert.equal(first.effects.settleCamera, "chase");
    assert.deepEqual(first.effects.autoCamPhase, { phase: "landed", staged: true });
    assert.equal(first.state.settled, true);

    const second = stepLandingBeat(first.state, { ...AT_LANDING, nowMs: 10_100 });
    assert.equal(second.effects.settleCamera, null, "settle is one-shot");
    assert.equal(second.effects.autoCamPhase, null);
  });

  it("pins playback to 1x only when running fast", () => {
    assert.equal(stepLandingBeat(createLandingBeatState(), AT_LANDING).effects.pinSpeed1x, false);
    const fast = stepLandingBeat(createLandingBeatState(), { ...AT_LANDING, clockSpeed: 200 });
    assert.equal(fast.effects.pinSpeed1x, true);
    const rewinding = stepLandingBeat(createLandingBeatState(), { ...AT_LANDING, clockSpeed: -50 });
    assert.equal(rewinding.effects.pinSpeed1x, true, "magnitude, not sign");
  });

  it("focuses the Moon for an impact or flyby instead of the ship", () => {
    const impact = stepLandingBeat(createLandingBeatState(), { ...AT_LANDING, phase: "impact" });
    assert.equal(impact.state.kind, "impact");
    assert.equal(impact.effects.settleCamera, "moon");
  });

  it("classifies splashdown as a landing when the caller remaps the phase", () => {
    const step = stepLandingBeat(createLandingBeatState(), {
      ...AT_LANDING, phase: "splashdown", classifyPhase: "landed",
    });
    assert.equal(step.state.kind, "landed");
    assert.equal(step.effects.settleCamera, "chase");
  });
});

describe("stepLandingBeat card timing", () => {
  it("holds the card back until the beat has played out", () => {
    const start = stepLandingBeat(createLandingBeatState(), AT_LANDING);
    assert.equal(start.showCompleteCard, false);

    const holdMs = LANDING_BEAT_HOLD_S * 1000;
    const early = stepLandingBeat(start.state, {
      ...AT_LANDING, nowMs: AT_LANDING.nowMs + holdMs - 1,
    });
    assert.equal(early.showCompleteCard, false);

    const ready = stepLandingBeat(early.state, {
      ...AT_LANDING, nowMs: AT_LANDING.nowMs + holdMs,
    });
    assert.equal(ready.showCompleteCard, true);
  });

  it("shows the card immediately when paused at complete", () => {
    const step = stepLandingBeat(createLandingBeatState(), { ...AT_LANDING, playing: false });
    assert.equal(step.state.holdStartMs, null);
    assert.equal(step.showCompleteCard, true);
    assert.equal(step.effects.settleCamera, null, "no settle while paused");
  });
});

describe("stepLandingBeat purity", () => {
  it("leaves the input state untouched and freezes its output", () => {
    const before = createLandingBeatState();
    const step = stepLandingBeat(before, AT_LANDING);
    assert.deepEqual(before, createLandingBeatState());
    assert.ok(Object.isFrozen(step.state));
    assert.ok(Object.isFrozen(step.effects));
  });

  it("is deterministic for the same state and frame", () => {
    const state = stepLandingBeat(createLandingBeatState(), AT_LANDING).state;
    assert.deepEqual(
      stepLandingBeat(state, { ...AT_LANDING, nowMs: 12_000 }),
      stepLandingBeat(state, { ...AT_LANDING, nowMs: 12_000 }),
    );
  });
});

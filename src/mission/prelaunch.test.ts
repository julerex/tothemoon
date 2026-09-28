import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  physicsDurationForTimeline,
  physicsStepTransportU,
  PRELAUNCH_COUNTDOWN_S,
  physicsTToSampleU,
  physicsTToTransportU,
  timelineWithPrelaunch,
  transportDurationS,
  transportUToPhysicsT,
} from "./prelaunch.ts";
import type { MissionTimeline } from "./timeline.ts";

describe("prelaunch countdown", () => {
  it("maps transport u=0 to T−5:00 and liftoff to T+0", () => {
    const dur = 1000;
    assert.equal(transportUToPhysicsT(0, dur), -PRELAUNCH_COUNTDOWN_S);
    assert.ok(
      Math.abs(transportUToPhysicsT(physicsTToTransportU(0, dur), dur)) < 1e-9,
    );
    assert.equal(transportDurationS(dur), dur + PRELAUNCH_COUNTDOWN_S);
  });

  it("samples stay on the pad for pre-liftoff", () => {
    assert.equal(physicsTToSampleU(-60, 1000), 0);
    assert.equal(physicsTToSampleU(0, 1000), 0);
    assert.ok(physicsTToSampleU(500, 1000) === 0.5);
  });

  it("remaps timeline scrub u while keeping physics event times", () => {
    const tl: MissionTimeline = {
      durationS: 1000,
      segments: [
        {
          phase: "launch",
          label: "L",
          shortLabel: "L",
          t0: 0,
          t1: 12,
          u0: 0,
          u1: 0.012,
        },
      ],
      events: [{ id: "liftoff", t: 0, u: 0, title: "Liftoff" }],
    };
    const remapped = timelineWithPrelaunch(tl, 1000);
    const total = 1000 + PRELAUNCH_COUNTDOWN_S;
    assert.equal(remapped.durationS, total);
    assert.equal(remapped.events[0]!.t, 0);
    assert.ok(remapped.events[0]!.u > 0.1);
    assert.ok(
      Math.abs(remapped.events[0]!.u - PRELAUNCH_COUNTDOWN_S / total) < 1e-9,
    );
  });
});

describe("physicsStepTransportU", () => {
  it("steps one physics second forward from liftoff", () => {
    assert.equal(physicsStepTransportU(0, 1, 1000), physicsTToTransportU(1, 1000));
  });

  it("stays at the countdown start when stepping backward", () => {
    assert.equal(
      physicsStepTransportU(-300, -1, 1000),
      physicsTToTransportU(-300, 1000),
    );
  });

  it("stays at the physics duration when stepping forward", () => {
    assert.equal(
      physicsStepTransportU(1000, 1, 1000),
      physicsTToTransportU(1000, 1000),
    );
  });
});

describe("physicsDurationForTimeline", () => {
  it("accepts a span whose transport length matches the timeline", () => {
    assert.equal(physicsDurationForTimeline(1000, transportDurationS(1000)), 1000);
  });

  it("throws when given the transport length itself", () => {
    const transport = transportDurationS(1000);
    assert.throws(() => physicsDurationForTimeline(transport, transport));
  });
});

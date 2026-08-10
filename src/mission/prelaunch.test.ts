import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRELAUNCH_COUNTDOWN_S,
  physicsTToSampleU,
  physicsTToTransportU,
  timelineWithPrelaunch,
  transportDurationS,
  transportUToPhysicsT,
} from "./prelaunch.ts";
import type { MissionTimeline } from "./timeline.ts";

describe("prelaunch countdown", () => {
  it("maps transport u=0 to T−2:00 and liftoff to T+0", () => {
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
    assert.equal(remapped.durationS, 1120);
    assert.equal(remapped.events[0]!.t, 0);
    assert.ok(remapped.events[0]!.u > 0.1);
    assert.ok(Math.abs(remapped.events[0]!.u - 120 / 1120) < 1e-9);
  });
});

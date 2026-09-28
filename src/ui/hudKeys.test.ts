import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { physicsDurationForTimeline, physicsTToTransportU, transportDurationS, transportUToPhysicsT } from "../mission/prelaunch.ts";
import { arrowSeekDir, isPlayPauseCode, speedNudgeDir } from "./hudKeys.ts";
import { seekOnePhysicsSecond } from "./hudTransport.ts";
import type { HudRuntime } from "./hudTypes.ts";

describe("isPlayPauseCode", () => {
  it("treats P and Space as play/pause", () => {
    assert.equal(isPlayPauseCode("KeyP"), true);
    assert.equal(isPlayPauseCode("Space"), true);
  });

  it("leaves other keys alone", () => {
    assert.equal(isPlayPauseCode("KeyK"), false);
    assert.equal(isPlayPauseCode("KeyO"), false);
  });
});

describe("speedNudgeDir", () => {
  it("maps minus to slower and equals to faster", () => {
    assert.equal(speedNudgeDir("Minus"), -1);
    assert.equal(speedNudgeDir("Equal"), 1);
  });

  it("does not use comma or period for speed", () => {
    assert.equal(speedNudgeDir("Comma"), null);
    assert.equal(speedNudgeDir("Period"), null);
  });
});

describe("arrowSeekDir", () => {
  it("maps left and right arrows to one physics second", () => {
    assert.equal(arrowSeekDir("ArrowLeft"), -1);
    assert.equal(arrowSeekDir("ArrowRight"), 1);
    assert.equal(arrowSeekDir("ArrowUp"), null);
    assert.equal(arrowSeekDir("KeyA"), null);
  });
});

describe("seekOnePhysicsSecond", () => {
  it("seeks one physics second back and does not pause", () => {
    const span = 1000;
    const start = physicsTToTransportU(10, span);
    let clockT = start;
    const scrubbed: number[] = [];
    let playing: boolean | null = null;
    const scrub = { value: "leave-me" };
    const rt = {
      dom: { scrub },
      data: {
        clock: { t: start },
        physicsDurationS: physicsDurationForTimeline(span, transportDurationS(span)),
        handlers: {
          onScrub(u: number) {
            scrubbed.push(u);
            clockT = u;
          },
          setPlaying(next: boolean) {
            playing = next;
          },
        },
      },
    } as HudRuntime;
    Object.defineProperty(rt.data.clock, "t", { get: () => clockT });
    seekOnePhysicsSecond(rt, -1);
    assert.equal(scrubbed.length, 1);
    assert.equal(scrubbed[0], physicsTToTransportU(9, span));
    assert.equal(transportUToPhysicsT(scrubbed[0]!, span), 9);
    assert.equal(playing, null);
    assert.equal(scrub.value, "leave-me");
  });
});

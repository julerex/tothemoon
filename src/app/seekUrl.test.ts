import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMissionClock } from "../mission/clock";
import { physicsTToTransportU } from "../mission/prelaunch";
import {
  applyTheaterSeek,
  attachMissionSeek,
  formatSeekTime,
  missionSeekHash,
  parseSeekTime,
  seekParamFromQuery,
} from "./seekUrl";

describe("parseSeekTime", () => {
  it("reads webcast T+/T− clocks and URL-decoded T space", () => {
    assert.equal(parseSeekTime("T+01:05:21"), 3921);
    assert.equal(parseSeekTime("T-00:02:00"), -120);
    assert.equal(parseSeekTime("T−00:02:00"), -120);
    assert.equal(parseSeekTime("T 01:05:21"), 3921);
    assert.equal(parseSeekTime("t+1:05:21"), 3921);
  });

  it("reads bare colon clocks and M:SS", () => {
    assert.equal(parseSeekTime("1:05:21"), 3921);
    assert.equal(parseSeekTime("01:05:21"), 3921);
    assert.equal(parseSeekTime("65:21"), 3921);
    assert.equal(parseSeekTime("-0:02:00"), -120);
    assert.equal(parseSeekTime("50:00:00"), 50 * 3600);
    assert.equal(parseSeekTime("1:02:03:04"), 93784);
  });

  it("reads raw seconds and compact units", () => {
    assert.equal(parseSeekTime("3921"), 3921);
    assert.equal(parseSeekTime("-30"), -30);
    assert.equal(parseSeekTime("+74"), 74);
    assert.equal(parseSeekTime("1h5m21s"), 3921);
    assert.equal(parseSeekTime("5m21s"), 321);
    assert.equal(parseSeekTime("90s"), 90);
    assert.equal(parseSeekTime("2d"), 2 * 86400);
  });

  it("rejects empty and invalid", () => {
    assert.equal(parseSeekTime(""), null);
    assert.equal(parseSeekTime("   "), null);
    assert.equal(parseSeekTime("nope"), null);
    assert.equal(parseSeekTime("1:99:00"), null);
    assert.equal(parseSeekTime("1:05:99"), null);
  });
});

describe("formatSeekTime", () => {
  it("writes URL-safe H:MM:SS without a T prefix", () => {
    assert.equal(formatSeekTime(0), "0:00:00");
    assert.equal(formatSeekTime(3921), "1:05:21");
    assert.equal(formatSeekTime(-120), "-0:02:00");
    assert.equal(formatSeekTime(74), "0:01:14");
  });

  it("round-trips through parseSeekTime", () => {
    for (const t of [0, -120, -5, 74, 3921, 50 * 3600, 3 * 86400 + 10]) {
      assert.equal(parseSeekTime(formatSeekTime(t)), t);
    }
  });
});

describe("attachMissionSeek", () => {
  it("seeks and pauses on boot, then applyTheaterSeek follows", () => {
    const clock = createMissionClock();
    clock.play();
    attachMissionSeek(clock, 4200, "flight-13", 3921);
    assert.equal(clock.playing, false);
    assert.ok(Math.abs(clock.t - physicsTToTransportU(3921, 4200)) < 1e-9);
    applyTheaterSeek(0);
    assert.ok(Math.abs(clock.t - physicsTToTransportU(0, 4200)) < 1e-9);
  });
});

describe("missionSeekHash / seekParamFromQuery", () => {
  it("builds a hash query and reads it back", () => {
    assert.equal(
      missionSeekHash("flight-13", 3921),
      "#/mission/flight-13?t=1:05:21",
    );
    assert.equal(
      seekParamFromQuery(new URLSearchParams("t=1:05:21")),
      3921,
    );
    assert.equal(seekParamFromQuery(new URLSearchParams("")), undefined);
    assert.equal(seekParamFromQuery(new URLSearchParams("t=nope")), undefined);
  });
});

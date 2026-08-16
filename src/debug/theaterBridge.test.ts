import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMissionClock } from "../mission/clock";
import { physicsTToTransportU } from "../mission/prelaunch";
import {
  EVAL_PAUSE,
  EVAL_PLAY,
  EVAL_SNAPSHOT,
  EVAL_WAIT_READY,
  evalSeek,
  evalSetCamera,
  theaterUrl,
} from "./cdpCommands";
import {
  inspectWebgl,
  parseCameraMode,
  resolveBridgeSeek,
  scrapeHud,
  snapshotFromHandle,
  THEATER_HUD_IDS,
} from "./theaterBridge";

describe("resolveBridgeSeek", () => {
  it("accepts numbers and the same t= forms as seek URLs", () => {
    assert.equal(resolveBridgeSeek(3921), 3921);
    assert.equal(resolveBridgeSeek("1:05:21"), 3921);
    assert.equal(resolveBridgeSeek("T+01:05:21"), 3921);
    assert.equal(resolveBridgeSeek("-0:02:00"), -120);
    assert.equal(resolveBridgeSeek("nope"), null);
    assert.equal(resolveBridgeSeek(Number.NaN), null);
  });
});

describe("parseCameraMode", () => {
  it("accepts live rail modes and rejects unknown", () => {
    assert.equal(parseCameraMode("chase"), "chase");
    assert.equal(parseCameraMode("hull"), "hull");
    assert.equal(parseCameraMode("starbase"), "starbase");
    assert.equal(parseCameraMode("drone"), null);
    assert.equal(parseCameraMode(""), null);
  });
});

describe("inspectWebgl / scrapeHud without a document", () => {
  it("does not invent a context and reports an empty HUD in node", () => {
    const gl = inspectWebgl();
    assert.equal(gl.ok, false);
    assert.equal(gl.lost, false);
    assert.deepEqual(scrapeHud(), {
      clock: null,
      phase: null,
      cam: null,
      altitude: null,
      speed: null,
      autoCam: null,
    });
    assert.equal(THEATER_HUD_IDS.clock, "mission-clock-value");
  });
});

describe("snapshotFromHandle", () => {
  it("reports physics time and camera from the handle", () => {
    const clock = createMissionClock();
    clock.seek(physicsTToTransportU(3921, 4200));
    const snap = snapshotFromHandle({
      mission: "flight-13",
      clock,
      physicsDurationS: 4200,
      director: {
        getMode: () => "chase",
        setMode: () => {},
        frameMode: () => {},
      },
      craftPos: { x: 1, y: 2, z: 3 },
      craftVel: { x: 3, y: 4, z: 0 },
      disableAutoCam: () => {},
      autoCamEnabled: () => true,
      phaseId: () => "splashdown",
    });
    assert.equal(snap.ready, true);
    assert.equal(snap.mission, "flight-13");
    assert.equal(snap.camera, "chase");
    assert.equal(snap.phaseId, "splashdown");
    assert.equal(snap.clock, "T+01:05:21");
    assert.ok(Math.abs(snap.physicsT - 3921) < 1e-6);
    assert.equal(snap.craft.speed, 5);
    assert.equal(snap.autoCam, true);
  });
});

describe("cdpCommands", () => {
  it("builds a full-document mission URL with an agent nonce", () => {
    const url = theaterUrl("flight-13", "1:05:21", "http://localhost:5173/tothemoon");
    assert.match(url, /^http:\/\/localhost:5173\/tothemoon\/\?agent=/);
    assert.match(url, /#\/mission\/flight-13\?t=1:05:21$/);
  });

  it("emits function-declaration evaluate strings", () => {
    assert.match(EVAL_SNAPSHOT, /^\(\) => /);
    assert.match(EVAL_WAIT_READY, /^async \(\) => /);
    assert.match(EVAL_PLAY, /play\(\)/);
    assert.match(EVAL_PAUSE, /pause\(\)/);
    assert.match(evalSeek("1:05:21"), /seek\("1:05:21"\)/);
    assert.match(evalSetCamera("hull", true), /frameCamera\("hull"\)/);
  });
});

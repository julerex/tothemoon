import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMissionClock } from "../mission/clock";
import { physicsTToTransportU } from "../mission/prelaunch";
import {
  EVAL_GET_CAMERA,
  EVAL_PAUSE,
  EVAL_PLAY,
  EVAL_SNAPSHOT,
  EVAL_WAIT_READY,
  evalSeek,
  evalSetCamera,
  evalSetCameraPose,
  theaterUrl,
} from "./cdpCommands";
import { readCameraWorldPose } from "../camera/worldPose";
import {
  inspectWebgl,
  parseCameraMode,
  resolveBridgeSeek,
  scrapeHud,
  setCameraPoseOnHandle,
  snapshotFromHandle,
  THEATER_HUD_IDS,
  type TheaterBridgeHandle,
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
    assert.equal(parseCameraMode("aerial"), "aerial");
    assert.equal(parseCameraMode("drone"), "drone");
    assert.equal(parseCameraMode(""), null);
    assert.equal(parseCameraMode("nope"), null);
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

function flight13Handle(
  over: Partial<TheaterBridgeHandle> = {},
): TheaterBridgeHandle {
  const clock = createMissionClock();
  const pose = readCameraWorldPose({
    mode: "chase",
    position: { x: 10, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    fov: 50,
    near: 0.05,
    far: 1000,
  });
  return {
    mission: "flight-13",
    clock,
    physicsDurationS: 4200,
    director: {
      getMode: () => "chase",
      setMode: () => {},
      frameMode: () => {},
      getWorldPose: () => pose,
      setWorldPose: () => {},
    },
    camera: { position: pose.position },
    craftPos: { x: 1, y: 2, z: 3 },
    craftVel: { x: 3, y: 4, z: 0 },
    disableAutoCam: () => {},
    autoCamEnabled: () => true,
    phaseId: () => "splashdown",
    ...over,
  };
}

describe("snapshotFromHandle", () => {
  it("reports physics time and camera from the handle", () => {
    const handle = flight13Handle();
    handle.clock.seek(physicsTToTransportU(3921, 4200));
    const snap = snapshotFromHandle(handle);
    assert.equal(snap.ready, true);
    assert.equal(snap.mission, "flight-13");
    assert.equal(snap.camera, "chase");
    assert.equal(snap.phaseId, "splashdown");
    assert.equal(snap.clock, "T+01:05:21");
    assert.ok(Math.abs(snap.physicsT - 3921) < 1e-6);
    assert.equal(snap.craft.speed, 5);
    assert.equal(snap.autoCam, true);
    assert.equal(snap.cam?.distance, 10);
    assert.deepEqual(snap.cam?.look, { x: -1, y: 0, z: 0 });
    assert.deepEqual(snap.camPos, { x: 10, y: 0, z: 0 });
  });
});

describe("setCameraPoseOnHandle", () => {
  it("turns Auto-cam off and seats a world pose", () => {
    let autoOff = false;
    let applied: unknown;
    const handle = flight13Handle({
      disableAutoCam: () => {
        autoOff = true;
      },
      director: {
        getMode: () => "chase",
        setMode: () => {},
        frameMode: () => {},
        setWorldPose: (input) => {
          applied = input;
        },
      },
    });
    setCameraPoseOnHandle(handle, { position: [1, 2, 3], fov: 80 });
    assert.equal(autoOff, true);
    assert.deepEqual(applied, { position: [1, 2, 3], fov: 80 });
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
    assert.match(EVAL_GET_CAMERA, /getCamera\(\)/);
    assert.match(
      evalSetCameraPose({ position: [1, 2, 3], target: [0, 0, 0] }),
      /setCameraPose\(/,
    );
  });
});

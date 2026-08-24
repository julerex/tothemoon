import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boosterMetricsLabel,
  buildTelemetryView,
  enginesLabel,
  keplerDevLabel,
  scrubRangeValue,
  stagedLabel,
  type Telemetry,
} from "./telemetryView.ts";

function baseTel(over: Partial<Telemetry> = {}): Telemetry {
  return {
    phase: "Ascent",
    phaseId: "ascent",
    t: 120,
    durationS: 1000,
    distanceToMoon: 380_000,
    altitude: 40,
    speed: 2.5,
    fuelBooster: 0.8,
    fuelShip: 1,
    thrustN: 5e6,
    playing: true,
    dateUtc: "2027-07-18 12:00 UTC",
    dateTexas: "2027-07-18 7:00 a.m. CDT",
    dateAustralia: "2027-07-18 8:00 p.m. AWST",
    playbackSpeed: 10,
    missionComplete: false,
    translunarInjectionDeltaV: 3.1,
    minMoonAlt: 200,
    focusDistance: 50,
    cameraMode: "earth",
    altEarth: 40,
    altMoon: 200_000,
    distMoon: 380_000,
    speedEarth: 2.4,
    speedMoon: 1.0,
    staged: false,
    burning: true,
    ...over,
  };
}

describe("label helpers", () => {
  it("enginesLabel / stagedLabel", () => {
    assert.equal(enginesLabel(true, 1000), "burning");
    assert.equal(enginesLabel(true, 100), "coast / idle");
    assert.equal(enginesLabel(false, 1e6), "coast / idle");
    assert.equal(stagedLabel(true), "yes · ship only");
    assert.equal(stagedLabel(false), "no · full stack");
  });

  it("boosterMetricsLabel empty after stage", () => {
    assert.equal(boosterMetricsLabel(true, 0, 0), "staged · empty");
    assert.match(boosterMetricsLabel(false, 0.5, 1000), /50\.00%/);
  });

  it("keplerDevLabel", () => {
    assert.equal(keplerDevLabel(undefined), "—");
    assert.equal(keplerDevLabel(0), "—");
    assert.match(keplerDevLabel(12.5), /12\.500 km/);
  });

  it("scrubRangeValue", () => {
    assert.equal(scrubRangeValue(0, 100), "0");
    assert.equal(scrubRangeValue(50, 100), "500");
    assert.equal(scrubRangeValue(100, 100), "1000");
    assert.equal(scrubRangeValue(10, 0), "0");
  });
});

describe("buildTelemetryView", () => {
  it("maps main strip from telemetry", () => {
    const v = buildTelemetryView(baseTel(), {
      skyLine: () => "sky-test",
    });
    assert.equal(v.main.phase, "Ascent");
    assert.equal(v.main.nextPhase, "—");
    assert.equal(v.main.phaseLeft, "—");
    assert.equal(v.main.cameraMode, "Earth");
    assert.match(v.main.cameraDetail, /Focus/i);
    assert.equal(v.main.missionClock, "T+00:02:00");
    assert.equal(v.main.dateUtc, "2027-07-18 12:00 UTC");
    assert.equal(v.main.dateTexas, "2027-07-18 7:00 a.m. CDT");
    assert.equal(v.main.dateAustralia, "2027-07-18 8:00 p.m. AWST");
    assert.equal(v.metrics.dateTexas, "2027-07-18 7:00 a.m. CDT");
    assert.equal(v.metrics.dateAustralia, "2027-07-18 8:00 p.m. AWST");
    assert.equal(v.main.progress, "12%");
    assert.equal(v.main.playLabel, "Pause");
    assert.equal(v.main.playPressed, true);
    assert.equal(v.main.sky, "sky-test");
    assert.equal(v.main.scrubValue, "120");
    assert.ok(Math.abs(v.main.progressU - 0.12) < 1e-12);
    assert.equal(v.complete, null);
    assert.equal(v.metrics.engines, "burning");
    assert.equal(v.metrics.sky, "sky-test");
    assert.match(v.metrics.playback, /10×/);
    assert.equal(v.metrics.forceCheckVisible, false);
    assert.equal(v.main.cameraTarget, "—");
    assert.equal(v.main.cameraAltitudeVisible, false);
    assert.equal(v.main.cameraPosition, "—");
    assert.equal(v.main.cameraDirection, "—");
  });

  it("fills camera target, GEO-gated altitude, and raw pose", () => {
    const v = buildTelemetryView(
      baseTel({
        cameraTarget: { x: 10, y: -2, z: 3 },
        cameraPosition: { x: 11, y: -2, z: 3 },
        cameraLook: { x: -1, y: 0, z: 0 },
        cameraAltEarth: 0.19,
      }),
      { skyLine: () => "sky-test" },
    );
    assert.match(v.main.cameraTarget, /x 10\.000/);
    assert.match(v.main.cameraTarget, /y −2\.000/);
    assert.equal(v.main.cameraAltitudeVisible, true);
    assert.equal(v.main.cameraAltitude, "190 m");
    assert.match(v.main.cameraPosition, /x 11\.000/);
    assert.match(v.main.cameraDirection, /x −1\.00000/);
  });

  it("formats Flight 13 main speed as km/h when flagged", () => {
    const v = buildTelemetryView(baseTel({ speed: 7.36, speedKmh: true }), {
      skyLine: () => "sky-test",
    });
    assert.equal(v.main.speed, "26,496 km/h");
  });

  it("maps next phase from timeline segments", () => {
    const v = buildTelemetryView(baseTel({ t: 10, phase: "Launch", phaseId: "launch" }), {
      skyLine: () => "sky-test",
      segments: [
        {
          phase: "launch",
          label: "Launch",
          shortLabel: "Lift",
          t0: 0,
          t1: 20,
          u0: 0,
          u1: 0.02,
        },
        {
          phase: "ascent",
          label: "Ascent",
          shortLabel: "Ascent",
          t0: 20,
          t1: 1000,
          u0: 0.02,
          u1: 1,
        },
      ],
    });
    assert.equal(v.main.nextPhase, "Ascent");
    assert.equal(v.main.phaseLeft, "10s left");
  });

  it("maps cameraMode to the HUD Cam title", () => {
    const sky = { skyLine: () => "sky-test" };
    assert.equal(buildTelemetryView(baseTel(), sky).main.cameraMode, "Earth");
    assert.equal(
      buildTelemetryView(baseTel({ cameraMode: "starbase" }), sky).main.cameraMode,
      "Starbase",
    );
    assert.equal(
      buildTelemetryView(baseTel({ cameraMode: "sun" }), sky).main.cameraMode,
      "Sun",
    );
    assert.equal(
      buildTelemetryView(baseTel({ cameraMode: "drone" }), sky).main.cameraMode,
      "Drone",
    );
    assert.equal(
      buildTelemetryView(baseTel({ cameraMode: "aerial" }), sky).main.cameraMode,
      "Aerial",
    );
  });

  it("builds complete card when missionComplete", () => {
    const v = buildTelemetryView(
      baseTel({
        missionComplete: true,
        completeKind: "landed",
        phaseId: "landed",
        phase: "Landed",
        t: 1000,
        fuelShip: 0.2,
        peakSpeedKmS: 11,
        stageT: 150,
        minMoonAlt: 0.05,
      }),
      { skyLine: (t) => `sky@${t}` },
    );
    assert.ok(v.complete);
    assert.match(v.complete!.subtitle, /Malapert|south pole|Starbase/i);
    assert.equal(v.complete!.minMoonAlt, "50 m");
    assert.equal(v.complete!.peakSpeed, "11.00 km/s");
    assert.equal(v.complete!.sky, "sky@1000");
    assert.equal(v.main.missionComplete, true);
  });

  it("splashdown complete subtitle flag", () => {
    const v = buildTelemetryView(
      baseTel({
        missionComplete: true,
        completeKind: "landed",
        phaseId: "splashdown",
        phase: "Splashdown",
      }),
      { skyLine: () => "—" },
    );
    assert.match(v.complete!.subtitle, /Flight 13|splash/i);
  });

  it("metrics force check row", () => {
    const v = buildTelemetryView(
      baseTel({ forceCompareLine: "  coast ok  " }),
      { skyLine: () => "—" },
    );
    assert.equal(v.metrics.forceCheckVisible, true);
    assert.equal(v.metrics.forceCheck, "coast ok");
  });

  it("staged metrics booster cell", () => {
    const v = buildTelemetryView(
      baseTel({ staged: true, fuelBooster: 0 }),
      { skyLine: () => "—" },
    );
    assert.equal(v.metrics.booster, "staged · empty");
    assert.equal(v.metrics.staged, "yes · ship only");
  });

  it("paused play label", () => {
    const v = buildTelemetryView(baseTel({ playing: false }), {
      skyLine: () => "—",
    });
    assert.equal(v.main.playLabel, "Play");
    assert.equal(v.main.playPressed, false);
    assert.match(v.metrics.playback, /paused/);
  });
});

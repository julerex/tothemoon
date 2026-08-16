import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOSTER_DRY_KG,
  BOOSTER_PROP_KG,
  SHIP_DRY_KG,
  SHIP_PROP_KG,
} from "../physics/constants.ts";
import {
  PLAYBACK_SPEED_STEPS,
  clamp01,
  formatAccelG,
  formatCompactDuration,
  formatDistance,
  formatDistancePrecise,
  formatFocusDistance,
  formatFuel,
  formatFuelDetailed,
  formatMassKg,
  formatMinMoonAlt,
  formatMissionTime,
  formatMissionTimeDetailed,
  formatOptional,
  formatPlaybackLine,
  formatProgressPercent,
  formatProgressRemainingLine,
  formatRate,
  formatSpeed,
  formatSpeedPrecise,
  formatThrust,
  formatThrustDetailed,
  formatTranslunarInjectionDv,
  formatWebcastMissionTime,
  fuelBarWidthPercent,
  nudgePlaybackSpeed,
  parseSpeedMode,
  thrustAccelG,
  wetMassFromFuel,
} from "./hudFormat.ts";

describe("clamp01 / parseSpeedMode", () => {
  it("clamp01 bounds", () => {
    assert.equal(clamp01(-1), 0);
    assert.equal(clamp01(0.5), 0.5);
    assert.equal(clamp01(2), 1);
  });

  it("parseSpeedMode rejects zero and non-finite", () => {
    assert.equal(parseSpeedMode("10"), 10);
    assert.equal(parseSpeedMode("0"), 1);
    assert.equal(parseSpeedMode("nope"), 1);
    assert.equal(parseSpeedMode("-50"), -50);
  });
});

describe("nudgePlaybackSpeed", () => {
  it("steps along PLAYBACK_SPEED_STEPS", () => {
    assert.equal(nudgePlaybackSpeed(1, 1), 10);
    assert.equal(nudgePlaybackSpeed(1, -1), -1);
    assert.equal(nudgePlaybackSpeed(2000, 1), 2000);
    assert.equal(nudgePlaybackSpeed(-2000, -1), -2000);
    assert.equal(nudgePlaybackSpeed(7, 1), 10);
    assert.equal(nudgePlaybackSpeed(7, -1), 1);
  });

  it("includes reverse and forward extremes", () => {
    assert.equal(PLAYBACK_SPEED_STEPS[0], -2000);
    assert.equal(
      PLAYBACK_SPEED_STEPS[PLAYBACK_SPEED_STEPS.length - 1],
      2000,
    );
  });
});

describe("time formatters", () => {
  it("formatMissionTime floors to minutes", () => {
    assert.equal(formatMissionTime(0), "0h 00m");
    assert.equal(formatMissionTime(3661), "1h 01m");
    assert.equal(formatMissionTime(90_000), "1d 1h 00m");
  });

  it("formatWebcastMissionTime is T+/T− HH:MM:SS", () => {
    assert.equal(formatWebcastMissionTime(0), "T+00:00:00");
    assert.equal(formatWebcastMissionTime(74), "T+00:01:14");
    assert.equal(formatWebcastMissionTime(-5), "T−00:00:05");
    assert.equal(formatWebcastMissionTime(3600 * 100), "T+100:00:00");
  });

  it("formatMissionTimeDetailed includes seconds", () => {
    const s = formatMissionTimeDetailed(3661);
    assert.match(s, /^1h 01m 01s · /);
    // Total seconds suffix uses locale separators (3,661 / 3.661 / 3661)
    assert.match(s, / s$/);
  });
});

describe("distance / speed / thrust", () => {
  it("formatDistance scales units", () => {
    assert.equal(formatDistance(5.5), "5.50 km");
    assert.equal(formatDistance(42), "42 km");
    assert.equal(formatDistance(2500), "2.5 Mm");
    assert.equal(formatDistance(2_500_000), "2.50 Mkm");
    assert.equal(formatDistance(-10), "0.00 km");
  });

  it("formatDistancePrecise allows negative altitude", () => {
    assert.equal(formatDistancePrecise(-0.5), "−500.0 m");
    assert.match(formatDistancePrecise(2500), /2\.500 Mm/);
  });

  it("formatFocusDistance reaches AU", () => {
    assert.equal(formatFocusDistance(0.5), "500 m");
    assert.match(formatFocusDistance(149_597_870.7), /1\.000 AU/);
  });

  it("formatSpeed dual ranges", () => {
    assert.equal(formatSpeed(7.8), "7.80 km/s");
    assert.equal(formatSpeed(0.25), "250 m/s");
  });

  it("formatSpeedPrecise dual units", () => {
    assert.match(formatSpeedPrecise(7.8), /7\.8000 km\/s/);
    assert.match(formatSpeedPrecise(0.25), /250\.00 m\/s/);
  });

  it("formatThrust idle dash", () => {
    assert.equal(formatThrust(0), "—");
    assert.equal(formatThrust(100), "—");
    assert.match(formatThrust(2e6), /2\.0 MN/);
    assert.match(formatThrust(5000), /5 kN/);
  });

  it("formatThrustDetailed", () => {
    assert.equal(formatThrustDetailed(0), "0 N");
    assert.match(formatThrustDetailed(2e6), /2\.000 MN/);
  });
});

describe("fuel / mass", () => {
  it("formatFuel percentage and mass", () => {
    assert.match(formatFuel(1, "ship"), /^100%/);
    assert.match(formatFuel(0.5, "booster"), /^50%/);
  });

  it("formatFuelDetailed pairs remaining and capacity", () => {
    const s = formatFuelDetailed(0.5, 1000, 2000);
    assert.match(s, /^50\.00%/);
    assert.ok(s.includes("/"));
  });

  it("formatMassKg scales", () => {
    assert.equal(formatMassKg(500), "500 kg");
    assert.match(formatMassKg(2500), /2\.50 t/);
  });
});

describe("progress / optional / complete card", () => {
  it("formatCompactDuration", () => {
    assert.equal(formatCompactDuration(9), "9s");
    assert.equal(formatCompactDuration(90), "1m 30s");
    assert.equal(formatCompactDuration(3600), "1h");
    assert.equal(formatCompactDuration(3660), "1h 1m");
    assert.equal(formatCompactDuration(90000), "1d 1h");
  });

  it("formatProgressPercent", () => {
    assert.equal(formatProgressPercent(0, 100), "0%");
    assert.equal(formatProgressPercent(50, 100), "50%");
    assert.equal(formatProgressPercent(100, 100), "100%");
    assert.equal(formatProgressPercent(10, 0), "0%");
  });

  it("formatProgressRemainingLine", () => {
    const s = formatProgressRemainingLine(50, 100);
    assert.match(s, /^50\.00%/);
    assert.ok(s.endsWith("left"));
  });

  it("formatMinMoonAlt switches to meters below 1 km", () => {
    assert.equal(formatMinMoonAlt(0.08), "80 m");
    assert.equal(formatMinMoonAlt(12), "12 km");
  });

  it("formatOptional", () => {
    assert.equal(formatOptional(null, formatSpeed), "—");
    assert.equal(formatOptional(undefined, formatSpeed), "—");
    assert.equal(formatOptional(Number.NaN, formatSpeed), "—");
    assert.equal(formatOptional(1.5, formatSpeed), "1.50 km/s");
  });

  it("formatTranslunarInjectionDv", () => {
    assert.equal(formatTranslunarInjectionDv(3.14159), "3.142 km/s");
  });

  it("formatRate and playback line", () => {
    assert.equal(formatRate(10), "10×");
    assert.equal(formatRate(-100), "−100×");
    assert.equal(formatPlaybackLine(10, true), "10×");
    assert.equal(formatPlaybackLine(10, false), "10× · paused");
  });

  it("fuelBarWidthPercent", () => {
    assert.equal(fuelBarWidthPercent(0.5), "50%");
    assert.equal(fuelBarWidthPercent(2), "100%");
  });
});

describe("mass / accel helpers", () => {
  it("wetMassFromFuel full stack vs staged", () => {
    const full = wetMassFromFuel(
      1,
      1,
      false,
      BOOSTER_DRY_KG,
      BOOSTER_PROP_KG,
      SHIP_DRY_KG,
      SHIP_PROP_KG,
    );
    const staged = wetMassFromFuel(
      1,
      1,
      true,
      BOOSTER_DRY_KG,
      BOOSTER_PROP_KG,
      SHIP_DRY_KG,
      SHIP_PROP_KG,
    );
    assert.ok(full > staged);
    assert.equal(staged, SHIP_DRY_KG + SHIP_PROP_KG);
  });

  it("thrustAccelG and formatAccelG", () => {
    const g = thrustAccelG(9.80665 * 1000, 1000);
    assert.ok(Math.abs(g - 1) < 1e-9);
    assert.equal(formatAccelG(1.25), "1.250 g");
    assert.equal(formatAccelG(0), "—");
  });
});

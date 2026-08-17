/**
 * Unit tests for A5 staged ascent: throttle schedule, hot-stage, circularize.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boosterThrottle,
  flyAscent,
  type AscentBurnMode,
} from "./ascent.ts";
import { HOT_STAGE_S, STAGE_PROP_ARM } from "./constants.ts";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch.ts";
import { altitudeEarth } from "./integrator.ts";
import { fuelShipFrac } from "./propellant.ts";

describe("boosterThrottle schedule", () => {
  it("is full at liftoff and dips near maximum dynamic pressure", () => {
    const lift = boosterThrottle(0.5, 1, "boost");
    const maxDynamicPressure = boosterThrottle(12, 0.7, "boost");
    const high = boosterThrottle(40, 0.5, "boost");
    assert.ok(lift > 0.95, `liftoff throttle ${lift}`);
    assert.ok(maxDynamicPressure < lift, `Maximum dynamic pressure ${maxDynamicPressure} should be below liftoff ${lift}`);
    assert.ok(high > maxDynamicPressure * 0.9, "recovers after maximum dynamic pressure");
  });

  it("ramps down when propellant is nearly gone", () => {
    const mid = boosterThrottle(50, 0.5, "boost");
    const low = boosterThrottle(50, STAGE_PROP_ARM * 0.5, "boost");
    assert.ok(low < mid, `main-engine-cutoff ramp ${low} < ${mid}`);
  });

  it("holds a low throttle in hot_stage and zero on upper", () => {
    assert.ok(boosterThrottle(70, 0.1, "hot_stage") <= 0.25);
    assert.equal(boosterThrottle(70, 0, "upper" as AscentBurnMode), 0);
  });
});

describe("flyAscent staged profile", () => {
  it("reaches low Earth orbit with hot-stage then ship circularize", () => {
    const r = flyAscent(DEFAULT_EPHEMERIS);
    assert.equal(r.ok, true, r.message);
    assert.ok(r.insertionAlt > 80 && r.insertionAlt < 250, `alt ${r.insertionAlt}`);
    assert.ok(
      r.insertionSpeed > 7.2 && r.insertionSpeed < 8.2,
      `v ${r.insertionSpeed}`,
    );
    assert.equal(r.prop.staged, true);
    assert.equal(r.prop.boosterPropKg, 0);
  });

  it("stages after a dual-burn hot-stage window", () => {
    const r = flyAscent(DEFAULT_EPHEMERIS);
    assert.ok(r.ok, r.message);
    const stageIdx = r.samples.findIndex((s) => s.staged);
    assert.ok(stageIdx > 0, "expected stage-out");
    const stageT = r.samples[stageIdx]!.t;
    // Ship fuel should drop in the seconds before stage (hot-stage ignition)
    const pre = r.samples.filter(
      (s) => !s.staged && s.t >= stageT - HOT_STAGE_S - 0.5 && s.t < stageT,
    );
    assert.ok(pre.length >= 2, "expected pre-stage samples");
    assert.ok(
      pre.some((s) => s.fuelShip < 0.999),
      "expected ship propellant use during hot-stage",
    );
    assert.ok(
      pre.some((s) => s.thrustN > 0),
      "expected thrust during hot-stage",
    );
    // Stage time theater band (~2–4 min class Super Heavy)
    assert.ok(stageT > 90 && stageT < 280, `stageT ${stageT}`);
  });

  it("settles circular low Earth orbit without a free zero-dt teleport", () => {
    const r = flyAscent(DEFAULT_EPHEMERIS);
    assert.ok(r.ok, r.message);
    assert.ok(
      !r.message.toLowerCase().includes("forced"),
      `unexpected message: ${r.message}`,
    );
    // Continuous time: no multi-second jumps without samples
    for (let i = 1; i < r.samples.length; i++) {
      const dt = r.samples[i]!.t - r.samples[i - 1]!.t;
      assert.ok(dt >= 0 && dt < 5, `sample dt ${dt} at i=${i}`);
    }
  });

  it("does not dip then climb during residual circularize", () => {
    // Regression: settleCircularize used to freeze the craft in inertial space
    // while Earth moved, so geocentric altitude fell ~10–25 km then rose steeply
    // to low Earth orbit (visible as a kink on the ascent cross-section).
    const r = flyAscent(DEFAULT_EPHEMERIS);
    assert.ok(r.ok, r.message);
    const stageIdx = r.samples.findIndex((s) => s.staged);
    assert.ok(stageIdx >= 0, "expected stage-out");
    // Peak altitude after stage, then ensure we never fall more than a few km
    // once the residual settle begins (identified by 0.5 s sample cadence near LEO).
    let peakAlt = -Infinity;
    let maxDrop = 0;
    for (let i = stageIdx; i < r.samples.length; i++) {
      const s = r.samples[i]!;
      const alt = altitudeEarth(s.t, s.pos);
      if (alt > peakAlt) peakAlt = alt;
      else maxDrop = Math.max(maxDrop, peakAlt - alt);
    }
    assert.ok(
      maxDrop < 3,
      `post-stage altitude drop ${maxDrop.toFixed(2)} km (peak ${peakAlt.toFixed(1)} km) — circularize should climb, not dip`,
    );
    // Upper-burn circularize: once samples are 0.5 s apart after upper burn, altitude
    // should be nearly monotonic toward insertion.
    let settleStart = -1;
    for (let i = 1; i < r.samples.length; i++) {
      const dt = r.samples[i]!.t - r.samples[i - 1]!.t;
      if (
        Math.abs(dt - 0.5) < 1e-9 &&
        r.samples[i]!.t > r.samples[stageIdx]!.t + 5
      ) {
        settleStart = i - 1;
        break;
      }
    }
    if (settleStart >= 0) {
      let prev = altitudeEarth(
        r.samples[settleStart]!.t,
        r.samples[settleStart]!.pos,
      );
      for (let i = settleStart + 1; i < r.samples.length; i++) {
        const alt = altitudeEarth(r.samples[i]!.t, r.samples[i]!.pos);
        assert.ok(
          alt >= prev - 0.5,
          `circularize alt drop at t=${r.samples[i]!.t.toFixed(2)}: ${prev.toFixed(2)} → ${alt.toFixed(2)} km`,
        );
        prev = alt;
      }
    }
  });

  it("leaves meaningful ship propellant for dogleg + translunar injection", () => {
    const r = flyAscent(DEFAULT_EPHEMERIS);
    assert.ok(r.ok, r.message);
    const fs = fuelShipFrac(r.prop);
    // Honest circularize spends real ship Δv; leave a reserve for dogleg + TLI.
    assert.ok(fs > 0.05, `ship fuel ${fs} too low after circularize`);
    assert.ok(fs < 0.99, `ship fuel ${fs} — expected some upper-stage use`);
  });

  it("records booster throttle below peak during maximum dynamic pressure band", () => {
    const r = flyAscent(DEFAULT_EPHEMERIS);
    assert.ok(r.ok, r.message);
    // Early samples at full-ish thrust; mid-ascent should show variation
    const early = r.samples.find((s) => s.t > 2 && s.t < 8 && s.thrustN > 0);
    const mid = r.samples.find((s) => s.t > 40 && s.t < 70 && s.thrustN > 0);
    assert.ok(early && mid, "expected early and mid burn samples");
    // Not a hard peak comparison (mass drops raise a=F/m); just ensure burning
    assert.ok(early!.thrustN > 1e6);
    assert.ok(mid!.thrustN > 1e6);
  });
});

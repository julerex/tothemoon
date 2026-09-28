/**
 * Flight-graph series: stacked match, post-stage split, coast accel, playhead.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBoosterKeyframes } from "../physics/boosterRecovery.ts";
import { MU_EARTH } from "../physics/constants.ts";
import { loadFlight13Trajectory } from "../physics/trajectoryCache.ts";
import { v3 } from "../physics/vec3.ts";
import { stageStateFromSamples } from "./crossSection.ts";
import {
  ALT_LOG_ABOVE_KM,
  FLIGHT_GRAPH_MAX_POINTS,
  altitudeAxisIsLog,
  buildFlightGraphSeries,
  interpolateFlightGraph,
  nongravAccelG,
  playheadFraction,
} from "./flightGraphsSeries.ts";

describe("nongravAccelG", () => {
  it("is near 0 when the velocity step is pure Earth gravity", () => {
    const r = v3(6371 + 200, 0, 0);
    const g = -MU_EARTH / (r.x * r.x);
    const dt = 2;
    const v0 = v3(0, 7.5, 0);
    const v1 = v3(g * dt, 7.5, 0);
    assert.ok(nongravAccelG(v0, v1, dt, r) < 0.02);
  });

  it("reads about 1 g when ground speed is held at the surface", () => {
    const r = v3(6371, 0, 0);
    const g = nongravAccelG(v3(), v3(), 1, r);
    assert.ok(Math.abs(g - 1) < 0.05, `g ${g}`);
  });
});

describe("playheadFraction", () => {
  it("maps t / duration and clamps the ends", () => {
    assert.equal(playheadFraction(2100, 4200), 0.5);
    assert.equal(playheadFraction(-5, 4200), 0);
    assert.equal(playheadFraction(5000, 4200), 1);
    assert.equal(playheadFraction(10, 0), 0);
  });
});

describe("altitudeAxisIsLog", () => {
  it("stays linear under 2000 km and logs a lunar climb", () => {
    assert.equal(altitudeAxisIsLog(ALT_LOG_ABOVE_KM), false);
    assert.equal(altitudeAxisIsLog(ALT_LOG_ABOVE_KM + 1), true);
  });
});

describe("buildFlightGraphSeries (Flight 13)", () => {
  const cache = loadFlight13Trajectory();
  const stage = stageStateFromSamples(cache.samples);
  const keyframes = stage ? buildBoosterKeyframes(stage, "gulf", cache.epoch) : null;
  const series = buildFlightGraphSeries({
    samples: cache.samples,
    stage,
    keyframes,
    epoch: cache.epoch,
    durationS: cache.durationS,
  });

  it("keeps pad speed near 0 and a linear altitude axis", () => {
    assert.ok(stage);
    assert.ok(series.ship[0]!.speedKmS < 0.05, `pad speed ${series.ship[0]!.speedKmS}`);
    assert.equal(series.logAltitude, false);
    assert.ok(series.ship.length > 20);
    assert.ok(series.ship.length <= FLIGHT_GRAPH_MAX_POINTS + 1);
  });

  it("matches the booster to the ship before stage-out", () => {
    const t = stage!.t * 0.4;
    const ship = interpolateFlightGraph(series.ship, t, true);
    const boost = interpolateFlightGraph(series.booster, t, false);
    assert.ok(ship && boost);
    assert.ok(Math.abs(ship.altKm - boost.altKm) < 1e-6, `alt ${ship.altKm} vs ${boost.altKm}`);
    assert.ok(Math.abs(ship.speedKmS - boost.speedKmS) < 1e-6);
  });

  it("splits the booster off after stage-out and ends the booster line", () => {
    const t = stage!.t + 30;
    const ship = interpolateFlightGraph(series.ship, t, true);
    const boost = interpolateFlightGraph(series.booster, t, false);
    assert.ok(ship && boost);
    const split = Math.abs(ship.speedKmS - boost.speedKmS) > 0.05
      || Math.abs(ship.altKm - boost.altKm) > 1;
    assert.ok(split, `ship ${ship.altKm} km ${ship.speedKmS} vs boost ${boost.altKm} ${boost.speedKmS}`);
    const endB = series.booster[series.booster.length - 1]!;
    const endS = series.ship[series.ship.length - 1]!;
    assert.ok(endB.t < endS.t - 60, `booster ends ${endB.t}, ship ${endS.t}`);
    assert.equal(interpolateFlightGraph(series.booster, series.durationS, false), null);
  });
});

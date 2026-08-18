/**
 * Analytic lunar Ω̇ / ω̇ on the Kepler fallback.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moonArgPeriAt, moonNodeAt } from "./bodies.ts";
import {
  MOON_ARG_PERI,
  MOON_ARG_PERI_DOT,
  MOON_ELEMENT_EPOCH_UTC_MS,
  MOON_NODE,
  MOON_NODE_DOT,
} from "./constants.ts";
import { LANDING_UTC_MS } from "./epoch.ts";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch.ts";
import { makeFlight13Epoch } from "./flight13Epoch.ts";
import { hasFlight13HorizonsTable } from "./horizonsEpoch.ts";

describe("analytic lunar element rates", () => {
  it("matches the packed Ω, ω at the 2027 landing epoch", () => {
    const epoch = { ...DEFAULT_EPHEMERIS, horizonsLandingT: 100_000 };
    assert.equal(moonNodeAt(100_000, epoch), MOON_NODE);
    assert.equal(moonArgPeriAt(100_000, epoch), MOON_ARG_PERI);
  });

  it("regresses Ω and advances ω as time moves forward", () => {
    const epoch = { ...DEFAULT_EPHEMERIS, horizonsLandingT: 0 };
    const yr = 365.25 * 86400;
    assert.ok(moonNodeAt(yr, epoch) < MOON_NODE);
    assert.ok(moonArgPeriAt(yr, epoch) > MOON_ARG_PERI);
    assert.ok(Math.abs(moonNodeAt(yr, epoch) - (MOON_NODE + MOON_NODE_DOT * yr)) < 1e-12);
    assert.ok(Math.abs(moonArgPeriAt(yr, epoch) - (MOON_ARG_PERI + MOON_ARG_PERI_DOT * yr)) < 1e-12);
  });

  it("shares the element epoch with the lunar landing UTC", () => {
    assert.equal(MOON_ELEMENT_EPOCH_UTC_MS, LANDING_UTC_MS);
  });

  it("places Flight 13 a year earlier than the 2027 elements", () => {
    const f13 = makeFlight13Epoch(0, 3600);
    const Ω = moonNodeAt(0, f13);
    const ω = moonArgPeriAt(0, f13);
    assert.ok(Ω > MOON_NODE, "node has not yet regressed to the 2027 value");
    assert.ok(ω < MOON_ARG_PERI, "apsides have not yet advanced to the 2027 value");
  });

  it("packs a Flight 13 Horizons launch window", () => {
    assert.equal(hasFlight13HorizonsTable(), true);
    const f13 = makeFlight13Epoch();
    assert.equal(f13.useHorizons, false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysPastFullAtLanding,
  FLIGHT13_LIFTOFF_UTC_MS,
  formatMissionDateAustralia,
  formatMissionDateTexas,
  formatMissionDateUtc,
  FULL_MOON_UTC_MS,
  greenwichMeanSiderealTimeRad,
  LANDING_UTC_MS,
  missionUtcMs,
  moonElongationPastFullRad,
  sunEclipticLongitudeAtLanding,
  sunPhase0ForUtc,
} from "./epoch.ts";

describe("epoch · July 2027 theater", () => {
  it("landing is after the July 2027 full Moon", () => {
    assert.ok(LANDING_UTC_MS > FULL_MOON_UTC_MS);
    const days = daysPastFullAtLanding();
    // ~1.83 d past full (waning gibbous)
    assert.ok(days > 1.5 && days < 2.2, `days past full = ${days}`);
  });

  it("moon elongation past full is a small positive angle", () => {
    const δ = moonElongationPastFullRad();
    assert.ok(δ > 0.2 && δ < 0.5, `δ = ${δ}`);
  });

  it("sun ecliptic longitude at landing is ~117–118°", () => {
    const L = sunEclipticLongitudeAtLanding();
    const deg = (L * 180) / Math.PI;
    assert.ok(deg > 116 && deg < 119, `L = ${deg}°`);
  });

  it("missionUtcMs maps landingMissionT to the Horizons landing epoch", () => {
    const landT = 3 * 86400;
    assert.equal(missionUtcMs(landT, landT), LANDING_UTC_MS);
    assert.equal(
      missionUtcMs(0, landT),
      LANDING_UTC_MS - landT * 1000,
    );
  });

  it("formatMissionDateUtc shows landing epoch at τ=0 mission time", () => {
    const label = formatMissionDateUtc(1000, 1000);
    assert.match(label, /^2027-07-20 12:00 UTC$/);
  });

  it("formatMissionDateUtc is earlier earlier in the mission", () => {
    const landT = 2 * 86400;
    const mid = formatMissionDateUtc(landT / 2, landT);
    // One day before landing → 2027-07-19
    assert.match(mid, /^2027-07-19 /);
  });

  it("greenwichMeanSiderealTimeRad is finite; one sidereal day is one full turn (mod 2π)", () => {
    const a = greenwichMeanSiderealTimeRad(LANDING_UTC_MS);
    const b = greenwichMeanSiderealTimeRad(LANDING_UTC_MS + 86_164.0905 * 1000);
    assert.ok(Number.isFinite(a) && a >= 0 && a < 2 * Math.PI);
    const wrap = (x: number) =>
      ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const d = wrap(b - a);
    const circ = Math.min(d, 2 * Math.PI - d);
    assert.ok(circ < 2e-3, `residual ${circ}`);
  });
});

describe("epoch · Flight 13 daytime launch", () => {
  it("liftoff is 2026-07-24 22:51 UTC (5:51 p.m. CDT)", () => {
    assert.equal(
      new Date(FLIGHT13_LIFTOFF_UTC_MS).toISOString(),
      "2026-07-24T22:51:00.000Z",
    );
  });

  it("missionUtcMs follows liftoff clock when clockUtcMsAtT0 is pinned", () => {
    const clock = FLIGHT13_LIFTOFF_UTC_MS;
    assert.equal(missionUtcMs(0, 999, clock), FLIGHT13_LIFTOFF_UTC_MS);
    assert.equal(
      missionUtcMs(60, 999, clock),
      FLIGHT13_LIFTOFF_UTC_MS + 60_000,
    );
    assert.match(
      formatMissionDateUtc(0, 0, clock),
      /^2026-07-24 22:51 UTC$/,
    );
    assert.equal(
      formatMissionDateTexas(0, 0, clock),
      "2026-07-24 5:51 p.m. CDT",
    );
    assert.equal(
      formatMissionDateAustralia(0, 0, clock),
      "2026-07-25 6:51 a.m. AWST",
    );
  });

  it("formatMissionDateTexas uses CDT in July (shown above UTC on the HUD)", () => {
    assert.equal(
      formatMissionDateTexas(1000, 1000),
      "2027-07-20 7:00 a.m. CDT",
    );
  });

  it("formatMissionDateAustralia uses AWST at the lunar landing epoch", () => {
    assert.equal(
      formatMissionDateAustralia(1000, 1000),
      "2027-07-20 8:00 p.m. AWST",
    );
  });

  it("sunPhase0ForUtc is finite", () => {
    const a = sunPhase0ForUtc(FLIGHT13_LIFTOFF_UTC_MS);
    assert.ok(Number.isFinite(a));
  });
});

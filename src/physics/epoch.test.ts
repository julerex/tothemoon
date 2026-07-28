import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysPastFullAtLanding,
  formatMissionDateUtc,
  FULL_MOON_UTC_MS,
  LANDING_UTC_MS,
  missionUtcMs,
  moonElongationPastFullRad,
  sunEclipticLongitudeAtLanding,
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

  it("missionUtcMs maps t=durationS to landing epoch", () => {
    const durationS = 3 * 86400;
    assert.equal(missionUtcMs(durationS, durationS), LANDING_UTC_MS);
    assert.equal(
      missionUtcMs(0, durationS),
      LANDING_UTC_MS - durationS * 1000,
    );
  });

  it("formatMissionDateUtc lands on 2027-07-20 at mission end", () => {
    const label = formatMissionDateUtc(1000, 1000);
    assert.match(label, /^2027-07-20 12:00 UTC$/);
  });

  it("formatMissionDateUtc is earlier earlier in the mission", () => {
    const durationS = 2 * 86400;
    const mid = formatMissionDateUtc(durationS / 2, durationS);
    // One day before landing → 2027-07-19
    assert.match(mid, /^2027-07-19 /);
  });
});

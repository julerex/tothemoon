import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysPastFullAtLanding,
  formatMissionDateUtc,
  FULL_MOON_UTC_MS,
  gmstRad,
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

  it("gmstRad is finite; one sidereal day is one full turn (mod 2π)", () => {
    const a = gmstRad(LANDING_UTC_MS);
    const b = gmstRad(LANDING_UTC_MS + 86_164.0905 * 1000);
    assert.ok(Number.isFinite(a) && a >= 0 && a < 2 * Math.PI);
    const wrap = (x: number) =>
      ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const d = wrap(b - a);
    const circ = Math.min(d, 2 * Math.PI - d);
    assert.ok(circ < 2e-3, `residual ${circ}`);
  });
});

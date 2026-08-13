import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EARTH_OBLIQUITY,
  EARTH_SIDEREAL_DAY_S,
  STARBASE_ALT,
  STARBASE_LAT,
  STARBASE_LON,
  WGS84_A_KM,
  WGS84_B_KM,
} from "./constants.ts";
import { greenwichMeanSiderealTimeRad, LANDING_UTC_MS, missionUtcMs } from "./epoch.ts";
import {
  earthNorthPole,
  earthSpinAngle,
  geodeticToMeshLocal,
  localEastInertial,
  localUpInertial,
  meshLocalToInertial,
  starbasePadState,
  starbaseSunElev,
  surfaceState,
} from "./earthFrame.ts";
import { makeLunarEpoch } from "./missionEpoch.ts";
import { dist, dot, len, v3 } from "./vec3.ts";

describe("earthFrame geometry", () => {
  it("earthNorthPole has unit length and J2000 obliquity tilt", () => {
    const n = earthNorthPole();
    assert.ok(Math.abs(len(n) - 1) < 1e-12);
    assert.ok(Math.abs(n.x) < 1e-12);
    assert.ok(Math.abs(n.y - Math.sin(EARTH_OBLIQUITY)) < 1e-12);
    assert.ok(Math.abs(n.z - Math.cos(EARTH_OBLIQUITY)) < 1e-12);
  });

  it("earthSpinAngle tracks Greenwich mean sidereal time; one sidereal day is one full turn (mod 2π)", () => {
    const epoch = makeLunarEpoch(0, 0, false);
    const a0 = earthSpinAngle(0, epoch);
    assert.ok(
      Math.abs(a0 - greenwichMeanSiderealTimeRad(LANDING_UTC_MS)) < 1e-9,
      "spin at τ=0 is Greenwich mean sidereal time at landing epoch",
    );
    const wrap = (x: number) =>
      ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const circ = (a: number, b: number) => {
      const d = wrap(a - b);
      return Math.min(d, 2 * Math.PI - d);
    };
    // Wrapped angles match after one sidereal day (full 2π advance)
    const a1 = earthSpinAngle(EARTH_SIDEREAL_DAY_S, epoch);
    assert.ok(
      circ(a1, a0) < 2e-3,
      `expected full turn, residual ${circ(a1, a0)}`,
    );
    // Half a sidereal day → ~π apart
    const aHalf = earthSpinAngle(EARTH_SIDEREAL_DAY_S / 2, epoch);
    assert.ok(
      Math.abs(circ(aHalf, a0) - Math.PI) < 2e-3,
      `half-day residual ${circ(aHalf, a0)}`,
    );
  });

  it("places Starbase in daytime sun for a mid-afternoon launch epoch", () => {
    // Launch 2027-07-17 18:00 UTC → ~12:12 CDT solar-ish; landT from July 20 12:00
    const launchUtc = Date.UTC(2027, 6, 17, 18, 0, 0);
    const landT = (LANDING_UTC_MS - launchUtc) / 1000;
    const epoch = makeLunarEpoch(0, landT, true);
    const elev = starbaseSunElev(0, epoch);
    assert.ok(elev > 0.35, `expected daytime sun elev, got ${elev}`);
    assert.equal(missionUtcMs(0, landT), launchUtc);
  });

  it("baked pack launches with sun above the Starbase horizon", async () => {
    const traj = (
      await import("../data/trajectory.json", { with: { type: "json" } })
    ).default as { moonPhase0?: number; horizonsLandingT?: number };
    const landT = traj.horizonsLandingT ?? 0;
    const epoch = makeLunarEpoch(traj.moonPhase0 ?? 0, landT, true);
    const elev = starbaseSunElev(0, epoch);
    assert.ok(
      elev > 0.2,
      `baked launch should be daytime (sun·up=${elev.toFixed(3)})`,
    );
  });

  it("geodeticToMeshLocal places poles on ±Y (b) and equator on XZ (a)", () => {
    const north = geodeticToMeshLocal(Math.PI / 2, 0, 0);
    assert.ok(Math.abs(north.x) < 1e-6);
    assert.ok(Math.abs(north.y - WGS84_B_KM) < 1e-6);
    assert.ok(Math.abs(north.z) < 1e-6);

    const south = geodeticToMeshLocal(-Math.PI / 2, 0, 0);
    assert.ok(Math.abs(south.y + WGS84_B_KM) < 1e-6);

    const eq = geodeticToMeshLocal(0, 0, 0);
    assert.ok(Math.abs(eq.y) < 1e-6);
    assert.ok(Math.abs(len(eq) - WGS84_A_KM) < 1e-6);
  });

  it("local up and east at Starbase are unit and nearly orthonormal", () => {
    const t = 0;
    const up = localUpInertial(t, STARBASE_LAT, STARBASE_LON);
    const east = localEastInertial(t, STARBASE_LAT, STARBASE_LON);
    assert.ok(Math.abs(len(up) - 1) < 1e-9);
    assert.ok(Math.abs(len(east) - 1) < 1e-9);
    // Finite-diff east is slightly off perfect orthogonality to geocentric up
    assert.ok(Math.abs(dot(up, east)) < 1e-4, `up·east=${dot(up, east)}`);
  });

  it("starbasePadState matches surfaceState at site lat/lon/alt", () => {
    const t = 3600;
    const pad = starbasePadState(t);
    // surfaceState(lat, lon, alt, t) — not (t, lat, lon)
    const surf = surfaceState(STARBASE_LAT, STARBASE_LON, STARBASE_ALT, t);
    assert.ok(dist(pad.pos, surf.pos) < 1e-3);
    assert.ok(dist(pad.up, surf.up) < 1e-9);
    assert.ok(dist(pad.east, surf.east) < 1e-9);
  });

  it("mesh-local radius is preserved under meshLocalToInertial", () => {
    const local = v3(WGS84_A_KM, 0, 0);
    const inertial = meshLocalToInertial(local, 1234);
    // Position is Earth-center-relative in mesh, becomes inertial offset
    // of same length after rotation about north.
    assert.ok(Math.abs(len(inertial) - WGS84_A_KM) < 1e-6);
  });
});

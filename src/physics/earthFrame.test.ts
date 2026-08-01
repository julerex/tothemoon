import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EARTH_OBLIQUITY,
  EARTH_SIDEREAL_DAY_S,
  R_EARTH,
  STARBASE_ALT,
  STARBASE_LAT,
  STARBASE_LON,
} from "./constants.ts";
import { bodyPositions } from "./bodies.ts";
import {
  EARTH_SPIN0,
  earthNorthPole,
  earthSpinAngle,
  geodeticToMeshLocal,
  localEastInertial,
  localUpInertial,
  meshLocalToInertial,
  starbasePadState,
  surfaceState,
} from "./earthFrame.ts";
import { dist, dot, len, v3 } from "./vec3.ts";

describe("earthFrame geometry", () => {
  it("earthNorthPole has unit length and J2000 obliquity tilt", () => {
    const n = earthNorthPole();
    assert.ok(Math.abs(len(n) - 1) < 1e-12);
    assert.ok(Math.abs(n.x) < 1e-12);
    assert.ok(Math.abs(n.y - Math.sin(EARTH_OBLIQUITY)) < 1e-12);
    assert.ok(Math.abs(n.z - Math.cos(EARTH_OBLIQUITY)) < 1e-12);
  });

  it("earthSpinAngle advances one turn per sidereal day", () => {
    assert.equal(earthSpinAngle(0), EARTH_SPIN0);
    const full = earthSpinAngle(EARTH_SIDEREAL_DAY_S);
    assert.ok(Math.abs(full - EARTH_SPIN0 - 2 * Math.PI) < 1e-9);
  });

  it("places Starbase in daytime sun at liftoff", () => {
    // sun·localUp > 0 ⇒ above horizon; theater aims mid-afternoon (~0.7)
    const b = bodyPositions(0);
    const pad = starbasePadState(0);
    const sx = b.sun.x - b.earth.x;
    const sy = b.sun.y - b.earth.y;
    const sz = b.sun.z - b.earth.z;
    const sl = Math.hypot(sx, sy, sz) || 1;
    const elev = (sx * pad.up.x + sy * pad.up.y + sz * pad.up.z) / sl;
    assert.ok(elev > 0.4, `expected daytime sun elev, got ${elev}`);
    assert.ok(elev < 0.95, `expected mid-afternoon not zenith, got ${elev}`);
  });

  it("geodeticToMeshLocal places poles on ±Y and equator on the XZ plane", () => {
    const north = geodeticToMeshLocal(Math.PI / 2, 0, R_EARTH);
    assert.ok(Math.abs(north.x) < 1e-6);
    assert.ok(Math.abs(north.y - R_EARTH) < 1e-6);
    assert.ok(Math.abs(north.z) < 1e-6);

    const south = geodeticToMeshLocal(-Math.PI / 2, 0, R_EARTH);
    assert.ok(Math.abs(south.y + R_EARTH) < 1e-6);

    const eq = geodeticToMeshLocal(0, 0, R_EARTH);
    assert.ok(Math.abs(eq.y) < 1e-6);
    assert.ok(Math.abs(len(eq) - R_EARTH) < 1e-6);
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
    const local = v3(R_EARTH, 0, 0);
    const inertial = meshLocalToInertial(local, 1234);
    // Position is Earth-center-relative in mesh, becomes inertial offset
    // of same length after rotation about north.
    assert.ok(Math.abs(len(inertial) - R_EARTH) < 1e-6);
  });
});

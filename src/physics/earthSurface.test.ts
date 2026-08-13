/**
 * Contract: physics pad sits on the shared WGS84 surface (ellipsoid + pad height).
 * Visual pad, stack clamp, splash, and camera clearance must use the same
 * ellipsoidal height (`EARTH_SURFACE_ALT_KM` / `STARBASE_ALT`) — no separate override.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bodyPositions } from "./bodies.ts";
import {
  EARTH_SURFACE_ALT_KM,
  EARTH_SURFACE_RADIUS_KM,
  R_EARTH,
  STARBASE_ALT,
} from "./constants.ts";
import { starbasePadState } from "./earthFrame.ts";
import { dist } from "./vec3.ts";
import { earthSurfaceRadiusAlong, ellipsoidalHeightKm } from "./wgs84.ts";

describe("shared Earth surface shell", () => {
  it("aliases pad altitude to the shared ellipsoidal height", () => {
    assert.equal(STARBASE_ALT, EARTH_SURFACE_ALT_KM);
    assert.equal(EARTH_SURFACE_RADIUS_KM, R_EARTH + EARTH_SURFACE_ALT_KM);
  });

  it("places starbasePadState on the WGS84 shell at Starbase, not mean R_EARTH", () => {
    const t = 0;
    const pad = starbasePadState(t);
    const earth = bodyPositions(t).earth;
    const rel = {
      x: pad.pos.x - earth.x,
      y: pad.pos.y - earth.y,
      z: pad.pos.z - earth.z,
    };
    const r = dist(pad.pos, earth);
    const shell = earthSurfaceRadiusAlong(rel);
    assert.ok(
      Math.abs(r - shell) < 1e-6,
      `pad geocentric radius ${r} vs WGS84 shell ${shell}`,
    );
    assert.ok(Math.abs(ellipsoidalHeightKm(rel) - EARTH_SURFACE_ALT_KM) < 1e-6);
    // Starbase (~26°N) is ~3 km outside the old mean sphere — not equatorial a.
    assert.ok(r > R_EARTH + 1, `expected bulge vs mean R_EARTH, got ${r}`);
    assert.ok(r < shell + 1);
  });
});

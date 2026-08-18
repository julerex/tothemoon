/**
 * Contract: physics pad sits on the WGS84 ellipsoid + shared surface height.
 * Visual pad, stack clamp, splash, and camera clearance must use the same
 * figure — no separate spherical override.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bodyPositions } from "./bodies.ts";
import {
  EARTH_SURFACE_ALT_KM,
  STARBASE_ALT,
  STARBASE_LAT,
} from "./constants.ts";
import { starbasePadState } from "./earthFrame.ts";
import { geocentricRadiusAt } from "./wgs84.ts";
import { dist } from "./vec3.ts";

describe("shared Earth surface shell", () => {
  it("aliases pad altitude to the shared ellipsoid height", () => {
    assert.equal(STARBASE_ALT, EARTH_SURFACE_ALT_KM);
  });

  it("places starbasePadState on the WGS84 ellipsoid + STARBASE_ALT", () => {
    const t = 0;
    const pad = starbasePadState(t);
    const earth = bodyPositions(t).earth;
    const r = dist(pad.pos, earth);
    const expected = geocentricRadiusAt(STARBASE_LAT, STARBASE_ALT);
    assert.ok(
      Math.abs(r - expected) < 1e-6,
      `pad geocentric radius ${r} vs ellipsoid ${expected}`,
    );
  });
});

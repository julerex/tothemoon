/**
 * Contract: physics pad sits on the shared Earth surface shell.
 * Visual pad, stack clamp, splash, and camera clearance must use the same
 * constants (`EARTH_SURFACE_ALT_KM` / `STARBASE_ALT`) — no separate override.
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

describe("shared Earth surface shell", () => {
  it("aliases pad altitude to the shared surface altitude", () => {
    assert.equal(STARBASE_ALT, EARTH_SURFACE_ALT_KM);
    assert.equal(EARTH_SURFACE_RADIUS_KM, R_EARTH + EARTH_SURFACE_ALT_KM);
  });

  it("places starbasePadState on EARTH_SURFACE_RADIUS_KM", () => {
    const t = 0;
    const pad = starbasePadState(t);
    const earth = bodyPositions(t).earth;
    const r = dist(pad.pos, earth);
    assert.ok(
      Math.abs(r - EARTH_SURFACE_RADIUS_KM) < 1e-6,
      `pad geocentric radius ${r} vs shell ${EARTH_SURFACE_RADIUS_KM}`,
    );
  });
});

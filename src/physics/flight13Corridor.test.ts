/**
 * Unit tests for Flight 13 eastward corridor geometry.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enuAtPosition,
  starbasePadState,
} from "./earthFrame.ts";
import {
  corridorAlongAt,
  flight13GreatCirclePlane,
} from "./flight13Corridor.ts";
import { makeFlight13Epoch } from "./flight13Epoch.ts";
import { getBodies } from "./integrator.ts";
import { dot, len, v3 } from "./vec3.ts";

describe("flight13GreatCirclePlane", () => {
  it("has an orthonormal mesh-local basis", () => {
    const p = flight13GreatCirclePlane();
    assert.ok(Math.abs(len(p.u) - 1) < 1e-9);
    assert.ok(Math.abs(len(p.v) - 1) < 1e-9);
    assert.ok(Math.abs(len(p.n) - 1) < 1e-9);
    assert.ok(p.splashAngleRad > Math.PI / 2);
  });
});

describe("corridorAlongAt", () => {
  it("points eastward from the Starbase pad (not the short Pacific arc)", () => {
    const epoch = makeFlight13Epoch(0, 0);
    const pad = starbasePadState(0, epoch);
    const b = getBodies(0, epoch);
    const up = v3(), east = v3(), north = v3(), along = v3();
    enuAtPosition(0, pad.pos, b.earth, up, east, north);
    corridorAlongAt(0, pad.pos, along, epoch);
    const e = dot(along, east);
    const n = dot(along, north);
    const azDeg = (Math.atan2(e, n) * 180) / Math.PI;
    assert.ok(e > 0.9, `east component ${e} — expected due-east corridor`);
    assert.ok(n < 0.05, `north component ${n}`);
    assert.ok(azDeg > 85 && azDeg < 110, `azimuth ${azDeg}° from north`);
    assert.ok(Math.abs(len(along) - 1) < 1e-9);
    assert.ok(Math.abs(dot(along, up)) < 1e-6, `radial ${dot(along, up)}`);
  });
});

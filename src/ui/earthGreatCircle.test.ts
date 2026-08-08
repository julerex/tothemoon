/**
 * Unit tests for whole-Earth great-circle cross-section helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { R_EARTH } from "../physics/constants.ts";
import {
  buildFlight13EarthGcModel,
  flight13GreatCirclePlane,
  labelAngleOrder,
  projectSiteToPlane,
  siteUnit,
  suborbitalArcPoints,
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
  GAUTENG_LAT,
  GAUTENG_LON,
} from "./earthGreatCircle.ts";
import { STARBASE_LAT, STARBASE_LON } from "../physics/constants.ts";
import { len } from "../physics/vec3.ts";

describe("flight13GreatCirclePlane", () => {
  it("has orthonormal mesh-local basis", () => {
    const p = flight13GreatCirclePlane();
    assert.ok(Math.abs(len(p.u) - 1) < 1e-9);
    assert.ok(Math.abs(len(p.v) - 1) < 1e-9);
    assert.ok(Math.abs(len(p.n) - 1) < 1e-9);
    const uv = p.u.x * p.v.x + p.u.y * p.v.y + p.u.z * p.v.z;
    const un = p.u.x * p.n.x + p.u.y * p.n.y + p.u.z * p.n.z;
    const vn = p.v.x * p.n.x + p.v.y * p.n.y + p.v.z * p.n.z;
    assert.ok(Math.abs(uv) < 1e-9, `u·v ${uv}`);
    assert.ok(Math.abs(un) < 1e-9, `u·n ${un}`);
    assert.ok(Math.abs(vn) < 1e-9, `v·n ${vn}`);
  });

  it("places splashdown at a large positive corridor angle", () => {
    const p = flight13GreatCirclePlane();
    // Texas → west of Australia is well over a quarter-turn (may unwrap past π)
    assert.ok(p.splashAngleRad > Math.PI / 2, `angle ${p.splashAngleRad}`);
    assert.ok(p.splashAngleRad < Math.PI * 1.2, `angle ${p.splashAngleRad}`);
  });
});

describe("projectSiteToPlane", () => {
  it("puts Starbase near angle 0 with small best-fit residual", () => {
    const plane = flight13GreatCirclePlane();
    const pr = projectSiteToPlane(STARBASE_LAT, STARBASE_LON, plane);
    assert.ok(Math.abs(pr.angleRad) < 1e-6, `angle ${pr.angleRad}`);
    // Three-site best-fit: residual is hundreds of km, not zero
    assert.ok(pr.offPlaneKm < 800, `off ${pr.offPlaneKm}`);
    assert.ok(Math.abs(Math.hypot(pr.surface.x, pr.surface.y) - R_EARTH) < 1e-6);
  });

  it("puts splashdown on the corridor at plane.splashAngleRad", () => {
    const plane = flight13GreatCirclePlane();
    const pr = projectSiteToPlane(FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON, plane);
    assert.ok(pr.offPlaneKm < 800, `off ${pr.offPlaneKm}`);
    assert.ok(Math.abs(pr.angleRad - plane.splashAngleRad) < 1e-6);
  });

  it("projects Gauteng between Starbase and splash on the corridor", () => {
    const plane = flight13GreatCirclePlane();
    const pr = projectSiteToPlane(GAUTENG_LAT, GAUTENG_LON, plane);
    assert.ok(pr.offPlaneKm < 800, `Gauteng off-plane ${pr.offPlaneKm} km`);
    assert.ok(pr.angleRad > 0.3 && pr.angleRad < plane.splashAngleRad, `ang ${pr.angleRad}`);
  });
});

describe("buildFlight13EarthGcModel", () => {
  it("includes Starbase, Gauteng, Landing, Australia labels", () => {
    const m = buildFlight13EarthGcModel();
    const ids = new Set(m.labels.map((l) => l.id));
    assert.ok(ids.has("starbase"));
    assert.ok(ids.has("gauteng"));
    assert.ok(ids.has("landing"));
    assert.ok(ids.has("australia"));
  });

  it("orders sites Starbase → Gauteng → Landing → Australia along the GC", () => {
    const m = buildFlight13EarthGcModel();
    const order = labelAngleOrder(m);
    assert.deepEqual(order, ["starbase", "gauteng", "landing", "australia"]);
  });

  it("frames the full Earth with atmosphere margin", () => {
    const m = buildFlight13EarthGcModel();
    assert.equal(m.rEarth, R_EARTH);
    assert.ok(m.bounds.xMax > m.rAtm);
    assert.ok(m.bounds.xMin < -m.rEarth);
  });
});

describe("suborbitalArcPoints", () => {
  it("starts at Starbase surface and ends near splash surface", () => {
    const m = buildFlight13EarthGcModel();
    const arc = suborbitalArcPoints(m, 48);
    assert.ok(arc.length >= 2);
    const a0 = arc[0]!;
    const a1 = arc[arc.length - 1]!;
    assert.ok(Math.abs(Math.hypot(a0.x, a0.y) - R_EARTH) < 1e-6);
    assert.ok(Math.abs(Math.hypot(a1.x, a1.y) - R_EARTH) < 1e-6);
    const mid = arc[Math.floor(arc.length / 2)]!;
    assert.ok(Math.hypot(mid.x, mid.y) > R_EARTH + 50);
  });
});

describe("siteUnit", () => {
  it("returns unit mesh-local vectors", () => {
    const u = siteUnit(0, 0);
    assert.ok(Math.abs(len(u) - 1) < 1e-9);
  });
});

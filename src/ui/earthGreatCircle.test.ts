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
  GAUTENG_LAT,
  GAUTENG_LON,
  AUSTRALIA_LAT,
  AUSTRALIA_LON,
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

  it("runs eastward from Starbase through Gauteng", () => {
    const p = flight13GreatCirclePlane();
    const g = projectSiteToPlane(GAUTENG_LAT, GAUTENG_LON, p);
    assert.ok(g.angleRad > 0.3 && g.angleRad < Math.PI, `ang ${g.angleRad}`);
    assert.ok(g.offPlaneKm < 1, `Gauteng off-plane ${g.offPlaneKm} km`);
  });
});

describe("projectSiteToPlane", () => {
  it("puts Starbase near angle 0 with small best-fit residual", () => {
    const plane = flight13GreatCirclePlane();
    const pr = projectSiteToPlane(STARBASE_LAT, STARBASE_LON, plane);
    assert.ok(Math.abs(pr.angleRad) < 1e-6, `angle ${pr.angleRad}`);
    assert.ok(pr.offPlaneKm < 1, `off ${pr.offPlaneKm}`);
    assert.ok(Math.abs(Math.hypot(pr.surface.x, pr.surface.y) - R_EARTH) < 1e-6);
  });

  it("places Australia past Gauteng on the eastward corridor", () => {
    const plane = flight13GreatCirclePlane();
    const g = projectSiteToPlane(GAUTENG_LAT, GAUTENG_LON, plane);
    const a = projectSiteToPlane(AUSTRALIA_LAT, AUSTRALIA_LON, plane);
    assert.ok(a.angleRad > g.angleRad, `Australia ${a.angleRad} vs Gauteng ${g.angleRad}`);
    assert.ok(a.angleRad < Math.PI * 1.6, `Australia angle ${a.angleRad}`);
  });
});

describe("buildFlight13EarthGcModel", () => {
  it("includes Starbase, Gauteng, Indian Ocean, and Australia labels", () => {
    const m = buildFlight13EarthGcModel();
    const ids = new Set(m.labels.map((l) => l.id));
    assert.ok(ids.has("starbase"));
    assert.ok(ids.has("gauteng"));
    assert.ok(ids.has("indian-ocean"));
    assert.ok(ids.has("australia"));
  });

  it("orders sites Starbase → Gauteng → Indian Ocean → Australia along the GC", () => {
    const m = buildFlight13EarthGcModel();
    const order = labelAngleOrder(m);
    assert.deepEqual(order, ["starbase", "gauteng", "indian-ocean", "australia"]);
  });

  it("frames the full Earth with atmosphere margin", () => {
    const m = buildFlight13EarthGcModel();
    assert.equal(m.rEarth, R_EARTH);
    assert.ok(m.bounds.xMax > m.rAtm);
    assert.ok(m.bounds.xMin < -m.rEarth);
  });
});

describe("suborbitalArcPoints", () => {
  it("starts at Starbase surface and ends at the Australia angle", () => {
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

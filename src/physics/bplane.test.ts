import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moonSouthUnit } from "./bodies.ts";
import {
  DESIGN_PERILUNE_ALT_KM,
  bPlaneFromMoonRel,
  designPeriluneRadiusKm,
  periluneTargetScore,
} from "./bplane.ts";
import { R_MOON } from "./constants.ts";
import { cross, normalize, scale, v3 } from "./vec3.ts";

describe("bPlaneFromMoonRel", () => {
  it("puts a south-pole periapsis on the south side with small bT", () => {
    const south = moonSouthUnit();
    const r = designPeriluneRadiusKm();
    const relP = scale(v3(), south, r);
    // Incoming vel ⟂ south (polar plane): east along south × X
    const vel = v3();
    cross(vel, south, v3(1, 0, 0));
    if (Math.hypot(vel.x, vel.y, vel.z) < 1e-8) cross(vel, south, v3(0, 1, 0));
    normalize(vel, vel);
    const bp = bPlaneFromMoonRel(relP, vel);
    assert.ok(bp.southAlign > 0.99, `southAlign ${bp.southAlign}`);
    assert.ok(Math.abs(bp.bT) < 20, `bT ${bp.bT} should be ~0 for polar south`);
    assert.ok(Math.abs(bp.bMag - r) < 1, `bMag ${bp.bMag} vs r ${r}`);
  });

  it("puts a north-pole periapsis on the north side", () => {
    const south = moonSouthUnit();
    const r = designPeriluneRadiusKm();
    const relP = scale(v3(), south, -r);
    const vel = v3();
    cross(vel, south, v3(1, 0, 0));
    if (Math.hypot(vel.x, vel.y, vel.z) < 1e-8) cross(vel, south, v3(0, 1, 0));
    normalize(vel, vel);
    const bp = bPlaneFromMoonRel(relP, vel);
    assert.ok(bp.southAlign < -0.99, `southAlign ${bp.southAlign}`);
  });

  it("returns finite zeros when relative velocity vanishes", () => {
    const bp = bPlaneFromMoonRel(v3(100, 0, 0), v3(0, 0, 0));
    assert.equal(bp.bT, 0);
    assert.equal(bp.bR, 0);
    assert.equal(bp.bMag, 100);
    assert.ok(Number.isFinite(bp.southAlign));
  });
});

describe("periluneTargetScore", () => {
  const south = moonSouthUnit();
  const goodPlane = bPlaneFromMoonRel(
    scale(v3(), south, designPeriluneRadiusKm()),
    (() => {
      const vel = v3();
      cross(vel, south, v3(1, 0, 0));
      if (Math.hypot(vel.x, vel.y, vel.z) < 1e-8) cross(vel, south, v3(0, 1, 0));
      return normalize(vel, vel);
    })(),
  );

  it("prefers the design altitude over an 8_000 km flyby", () => {
    const design = periluneTargetScore(DESIGN_PERILUNE_ALT_KM, goodPlane);
    const flyby = periluneTargetScore(8_000, goodPlane);
    assert.ok(design < flyby, `design ${design} should beat 8_000 km ${flyby}`);
  });

  it("prefers a south periapsis over a north one at the same alt", () => {
    const northP = scale(v3(), south, -designPeriluneRadiusKm());
    const vel = v3();
    cross(vel, south, v3(1, 0, 0));
    if (Math.hypot(vel.x, vel.y, vel.z) < 1e-8) cross(vel, south, v3(0, 1, 0));
    normalize(vel, vel);
    const north = periluneTargetScore(DESIGN_PERILUNE_ALT_KM, bPlaneFromMoonRel(northP, vel));
    const southScore = periluneTargetScore(DESIGN_PERILUNE_ALT_KM, goodPlane);
    assert.ok(southScore < north, `south ${southScore} should beat north ${north}`);
  });

  it("rejects a distant miss and a NaN altitude", () => {
    assert.ok(periluneTargetScore(500_000, goodPlane) > 1e11);
    assert.ok(periluneTargetScore(Number.NaN, goodPlane) > 1e11);
  });

  it("penalizes impact harder than a 400 km pass", () => {
    const impact = periluneTargetScore(-50, goodPlane);
    const pass = periluneTargetScore(DESIGN_PERILUNE_ALT_KM, goodPlane);
    assert.ok(impact > pass, `impact ${impact} vs pass ${pass}`);
  });
});

describe("designPeriluneRadiusKm", () => {
  it("is mean Moon radius plus the design altitude", () => {
    assert.equal(designPeriluneRadiusKm(), R_MOON + DESIGN_PERILUNE_ALT_KM);
  });
});

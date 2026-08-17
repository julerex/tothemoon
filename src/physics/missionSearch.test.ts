import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moonSouthUnit } from "./bodies.ts";
import { A_EM, R_MOON } from "./constants.ts";
import { DESIGN_PERILUNE_ALT_KM } from "./bplane.ts";
import { scoreBallisticPerilune } from "./missionSearch.ts";
import { cross, normalize, scale, v3, type V3 } from "./vec3.ts";

function polarVel(south: V3): V3 {
  const vel = v3();
  cross(vel, south, v3(1, 0, 0));
  if (Math.hypot(vel.x, vel.y, vel.z) < 1e-8) cross(vel, south, v3(0, 1, 0));
  return normalize(vel, vel);
}

function probeAt(altKm: number, alongSouth: number, periT = 72 * 3600) {
  const south = moonSouthUnit();
  const r = R_MOON + altKm;
  return {
    minAlt: altKm,
    periluneT: periT,
    rEarth: A_EM,
    periRel: scale(v3(), south, r * alongSouth),
    periVel: polarVel(south),
  };
}

describe("scoreBallisticPerilune", () => {
  it("prefers the design LOI-class periapsis over an 8_000 km flyby", () => {
    const design = scoreBallisticPerilune(probeAt(DESIGN_PERILUNE_ALT_KM, 1));
    const flyby = scoreBallisticPerilune(probeAt(8_000, 1));
    assert.ok(design < flyby, `design ${design} vs flyby ${flyby}`);
  });

  it("rejects a NaN / empty probe", () => {
    assert.ok(
      scoreBallisticPerilune({
        minAlt: Infinity,
        periluneT: 0,
        rEarth: Infinity,
        periRel: v3(0, 0, 1),
        periVel: v3(1, 0, 0),
      }) > 1e11,
    );
  });
});

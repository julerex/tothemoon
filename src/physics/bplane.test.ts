import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MU_MOON, R_MOON } from "./constants.ts";
import {
  bplaneMissNeedsTcm,
  DESIGN_PERILUNE_ALT_KM,
  moonRelativeEncounter,
} from "./bplane.ts";
import { v3 } from "./vec3.ts";

describe("moonRelativeEncounter", () => {
  it("recovers design perilune and south-aim on a known hyperbolic flyby", () => {
    const rp = R_MOON + DESIGN_PERILUNE_ALT_KM;
    const vInf = 1;
    const vp = Math.sqrt(vInf * vInf + (2 * MU_MOON) / rp);
    // Periapsis over the south pole (−Z); prograde +Y → h along +X.
    const r = v3(0, 0, -rp);
    const v = v3(0, vp, 0);
    const north = v3(0, 0, 1);
    const enc = moonRelativeEncounter(r, v, north);
    assert.ok(
      Math.abs(enc.periluneAltKm - DESIGN_PERILUNE_ALT_KM) < 2,
      `perilune alt ${enc.periluneAltKm}`,
    );
    assert.ok(enc.energyKm2S2 > 0, "expected hyperbola");
    assert.ok(Math.abs(enc.vInfKmS - vInf) < 0.02, `v∞ ${enc.vInfKmS}`);
    const e = 1 + (rp * vInf * vInf) / MU_MOON;
    const a = -MU_MOON / (vInf * vInf);
    const bDes = Math.abs(a) * Math.sqrt(e * e - 1);
    assert.ok(Math.abs(enc.bMagKm - bDes) / bDes < 0.02, `B ${enc.bMagKm} vs ${bDes}`);
    assert.ok(enc.southDot > 0.95, `southDot ${enc.southDot}`);
    assert.ok(
      enc.bPlaneMissKm < 8_000,
      `south-pole B miss ${enc.bPlaneMissKm} km`,
    );
  });

  it("reports circular low lunar orbit as a bound encounter", () => {
    const rLlo = R_MOON + 120;
    const vCirc = Math.sqrt(MU_MOON / rLlo);
    const enc = moonRelativeEncounter(v3(rLlo, 0, 0), v3(0, vCirc, 0), v3(0, 0, 1));
    assert.ok(enc.energyKm2S2 < 0);
    assert.equal(enc.vInfKmS, 0);
    assert.ok(Math.abs(enc.periluneAltKm - 120) < 1, `alt ${enc.periluneAltKm}`);
  });

  it("penalizes a northern flyby vs the south-pole design B", () => {
    const rp = R_MOON + DESIGN_PERILUNE_ALT_KM;
    const vInf = 1;
    const vp = Math.sqrt(vInf * vInf + (2 * MU_MOON) / rp);
    const northEnc = moonRelativeEncounter(
      v3(0, 0, rp),
      v3(0, vp, 0),
      v3(0, 0, 1),
    );
    const southEnc = moonRelativeEncounter(
      v3(0, 0, -rp),
      v3(0, vp, 0),
      v3(0, 0, 1),
    );
    assert.ok(northEnc.southDot < 0);
    assert.ok(southEnc.southDot > 0);
    assert.ok(
      northEnc.bPlaneMissKm > southEnc.bPlaneMissKm + 5_000,
      `north miss ${northEnc.bPlaneMissKm} vs south ${southEnc.bPlaneMissKm}`,
    );
  });
});

describe("bplaneMissNeedsTcm", () => {
  it("is false for a close south-pole pass", () => {
    assert.equal(bplaneMissNeedsTcm(4_000, DESIGN_PERILUNE_ALT_KM), false);
  });

  it("is true when perilune is far or miss is huge", () => {
    assert.equal(bplaneMissNeedsTcm(1_000, 80_000), true);
    assert.equal(bplaneMissNeedsTcm(80_000, 8_000), true);
    assert.equal(bplaneMissNeedsTcm(Number.POSITIVE_INFINITY, 8_000), true);
  });
});

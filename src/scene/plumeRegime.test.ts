import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  plumeGimbalOffset,
  plumeLook,
  plumeRegimeFor,
  plumeThrustLag,
} from "./plumeRegime.ts";

describe("plumeRegimeFor", () => {
  it("maps launch/ascent to atmosphere for both kinds", () => {
    assert.equal(plumeRegimeFor("launch", "booster"), "atmosphere");
    assert.equal(plumeRegimeFor("ascent", "ship"), "atmosphere");
  });

  it("maps approach to LOI for the ship", () => {
    assert.equal(plumeRegimeFor("approach", "ship", { staged: true }), "loi");
  });

  it("maps vacuum coast / TLI burns", () => {
    assert.equal(
      plumeRegimeFor("translunarInjection", "ship", { staged: true }),
      "vacuum",
    );
    assert.equal(
      plumeRegimeFor("lowEarthOrbit", "ship", { staged: true }),
      "vacuum",
    );
    assert.equal(plumeRegimeFor("coast", "ship", { staged: true }), "vacuum");
  });

  it("maps descent / braking to landing", () => {
    assert.equal(
      plumeRegimeFor("descent", "ship", { staged: true }),
      "landing",
    );
    assert.equal(
      plumeRegimeFor("braking", "ship", { staged: true }),
      "landing",
    );
  });

  it("returns hotStage for ship pre-sep ramp", () => {
    assert.equal(
      plumeRegimeFor("ascent", "ship", { staged: false, hotPre: 0.5 }),
      "hotStage",
    );
  });

  it("uses recovery phase for detached booster", () => {
    assert.equal(
      plumeRegimeFor(undefined, "booster", { recoveryPhase: "boostback" }),
      "boostback",
    );
    assert.equal(
      plumeRegimeFor(undefined, "booster", { recoveryPhase: "landing" }),
      "landing",
    );
  });
});

describe("plumeLook", () => {
  it("makes vacuum wider and more translucent than atmosphere (ship)", () => {
    const atmo = plumeLook("atmosphere", "ship");
    const vac = plumeLook("vacuum", "ship");
    assert.ok(vac.radial > atmo.radial);
    assert.ok(vac.length > atmo.length);
    assert.ok(vac.opacity < atmo.opacity);
  });

  it("gives LOI a stronger light beat than plain vacuum", () => {
    const vac = plumeLook("vacuum", "ship");
    const loi = plumeLook("loi", "ship");
    assert.ok(loi.lightI > vac.lightI);
    assert.ok(loi.length >= vac.length);
  });

  it("keeps booster atmosphere denser than vacuum", () => {
    const atmo = plumeLook("atmosphere", "booster");
    const vac = plumeLook("vacuum", "booster");
    assert.ok(atmo.opacity > vac.opacity);
    assert.ok(atmo.radial < vac.radial);
  });

  it("uses blue-ish ship light vs orange booster", () => {
    const ship = plumeLook("vacuum", "ship");
    const boost = plumeLook("atmosphere", "booster");
    // Ship light is cooler (more blue)
    assert.ok(ship.light[2]! > ship.light[0]!);
    assert.ok(boost.light[0]! > boost.light[2]!);
  });
});

describe("plumeThrustLag", () => {
  it("snaps on scrub rewind", () => {
    assert.equal(plumeThrustLag(0.2, 0.9, 10, 3), 0.9);
  });

  it("snaps on large forward scrub", () => {
    assert.equal(plumeThrustLag(0.2, 0.9, 10, 12), 0.9);
  });

  it("eases toward target on smooth advance", () => {
    const lag = plumeThrustLag(0, 1, 10, 10.05, 0.2);
    assert.ok(lag > 0 && lag < 1);
    assert.ok(lag < 0.5); // not fully caught up in 50 ms
  });

  it("reaches target after several steps", () => {
    let lag = 0;
    let t = 0;
    for (let i = 0; i < 40; i++) {
      const next = t + 1 / 60;
      lag = plumeThrustLag(lag, 1, t, next, 0.15);
      t = next;
    }
    assert.ok(lag > 0.95);
  });
});

describe("plumeGimbalOffset", () => {
  it("is deterministic for the same mission time", () => {
    const a = plumeGimbalOffset(42.5, 1);
    const b = plumeGimbalOffset(42.5, 1);
    assert.deepEqual(a, b);
  });

  it("grows amplitude with layer index (RMS over time)", () => {
    let e0 = 0;
    let e2 = 0;
    for (let i = 0; i < 64; i++) {
      const t = i * 0.37;
      const L0 = plumeGimbalOffset(t, 0);
      const L2 = plumeGimbalOffset(t, 2);
      e0 += L0.x * L0.x + L0.y * L0.y;
      e2 += L2.x * L2.x + L2.y * L2.y;
    }
    assert.ok(e2 > e0 * 1.5);
  });
});

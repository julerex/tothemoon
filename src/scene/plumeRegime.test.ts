import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  plumeGimbalOffset,
  plumeLook,
  plumeRegimeFor,
  plumeStreamScale,
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
    assert.equal(
      plumeRegimeFor(undefined, "booster", { recoveryPhase: "caught" }),
      "landing",
    );
  });

  it("maps entry to vacuum and splashdown to landing", () => {
    assert.equal(plumeRegimeFor("entry", "ship", { staged: true }), "vacuum");
    assert.equal(
      plumeRegimeFor("splashdown", "ship", { staged: true }),
      "landing",
    );
    assert.equal(plumeRegimeFor("landed", "ship", { staged: true }), "landing");
  });

  it("falls back by altitude for unknown phases", () => {
    assert.equal(
      plumeRegimeFor("unknown", "booster", { altEarthKm: 20 }),
      "atmosphere",
    );
    assert.equal(
      plumeRegimeFor("unknown", "booster", { altEarthKm: 200 }),
      "atmosphere",
    );
    assert.equal(
      plumeRegimeFor("unknown", "ship", { staged: true, altEarthKm: 20 }),
      "atmosphere",
    );
    assert.equal(
      plumeRegimeFor("unknown", "ship", { staged: true, altEarthKm: 200 }),
      "vacuum",
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

  it("uses pink-magenta atmosphere rims vs cooler vacuum ship", () => {
    const atmo = plumeLook("atmosphere", "booster");
    const land = plumeLook("landing", "booster");
    const shipAtmo = plumeLook("atmosphere", "ship");
    const shipVac = plumeLook("vacuum", "ship");
    const shipLand = plumeLook("landing", "ship");
    for (const look of [atmo, land, shipAtmo, shipLand]) {
      // Near-white core (all channels high)
      assert.ok(look.core[0]! > 0.9 && look.core[1]! > 0.7 && look.core[2]! > 0.8);
      // Magenta rim: red high, blue > green (not orange)
      assert.ok(look.rim[0]! > 0.85);
      assert.ok(look.rim[2]! > look.rim[1]!);
      assert.ok(look.rim[2]! > 0.55);
    }
    // Vacuum ship stays cooler (more blue than red)
    assert.ok(shipVac.light[2]! > shipVac.light[0]!);
  });

  it("covers booster boostback / landing / fallback regimes", () => {
    const bb = plumeLook("boostback", "booster");
    const land = plumeLook("landing", "booster");
    const loi = plumeLook("loi", "booster");
    const hot = plumeLook("hotStage", "booster");
    assert.ok(bb.opacity > 0 && land.radial < bb.radial);
    // Booster LOI falls back to vacuum palette; hotStage → atmosphere
    assert.ok(loi.radial > land.radial);
    assert.ok(hot.opacity > loi.opacity);
  });

  it("covers ship hotStage and boostback fallback", () => {
    const hot = plumeLook("hotStage", "ship");
    const bb = plumeLook("boostback", "ship");
    const vac = plumeLook("vacuum", "ship");
    assert.ok(hot.lightI > 0);
    assert.deepEqual(bb.light, vac.light);
  });
});

describe("plumeStreamScale", () => {
  it("hides the axial stream in vacuum and LOI", () => {
    assert.equal(plumeStreamScale("vacuum").opacity, 0);
    assert.equal(plumeStreamScale("loi", 100).opacity, 0);
  });

  it("keeps a short punch on the pad and stretches by T+16 altitude", () => {
    const pad = plumeStreamScale("atmosphere", 0.08);
    const climb = plumeStreamScale("atmosphere", 0.4);
    assert.ok(pad.opacity > 0.5);
    assert.ok(pad.length < 1.5);
    assert.ok(climb.length > pad.length * 3);
    assert.ok(climb.length > 4);
    assert.ok(climb.radial < pad.radial);
  });

  it("keeps landing streams shorter than ascent", () => {
    const land = plumeStreamScale("landing", 0.4);
    const asce = plumeStreamScale("atmosphere", 0.4);
    assert.ok(land.length < asce.length);
    assert.ok(land.opacity > 0);
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

  it("snaps when prev lag is non-finite", () => {
    assert.equal(plumeThrustLag(Number.NaN, 0.7, 1, 1.05), 0.7);
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

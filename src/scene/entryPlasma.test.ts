import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { entryPlasmaStrength } from "../physics/flight13Attitude.ts";
import { tileGroutGlow } from "./craftHullMaps.ts";
import {
  deriveEntryPlasma,
  entryHeatEmissiveRgb,
  PLASMA_SPRITE_BUILD,
  PLASMA_VISIBLE_MIN,
  plasmaFlicker,
} from "./entryPlasma.ts";

/** Mid-entry state with a strong plasma pulse. */
const HOT = { t: 2900, phase: "entry" as const, altKm: 55, speedKmS: 6.5 };

function rgbChannels(hex: number): { r: number; g: number; b: number } {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

describe("plasmaFlicker", () => {
  it("stays inside the additive shimmer band", () => {
    for (let t = 0; t < 40; t += 0.37) {
      const f = plasmaFlicker(t);
      assert.ok(f >= 0.7 && f <= 1.0, `flicker ${f} out of band at t=${t}`);
    }
  });

  it("is deterministic in mission time (scrub-safe)", () => {
    assert.equal(plasmaFlicker(1234.5), plasmaFlicker(1234.5));
  });
});

describe("PLASMA_SPRITE_BUILD palette", () => {
  it("uses near-white core and magenta/violet sheath + trail (not orange)", () => {
    const core = rgbChannels(PLASMA_SPRITE_BUILD.core.color);
    const sheath = rgbChannels(PLASMA_SPRITE_BUILD.sheath.color);
    const trail = rgbChannels(PLASMA_SPRITE_BUILD.trail.color);
    const flap = rgbChannels(PLASMA_SPRITE_BUILD.flapEdge.color);
    // Core: all channels high (near-white / pale magenta)
    assert.ok(core.r > 230 && core.g > 200 && core.b > 230);
    // Sheath / trail / flap: red high, blue > green (violet–magenta, not orange)
    for (const c of [sheath, trail, flap]) {
      assert.ok(c.r > 140, `r=${c.r}`);
      assert.ok(c.b > c.g, `b=${c.b} should exceed g=${c.g}`);
      assert.ok(c.b > 100, `b=${c.b}`);
    }
  });
});

describe("entryHeatEmissiveRgb", () => {
  it("fills tiles violet under hot plasma (B > G)", () => {
    const heat = entryHeatEmissiveRgb(0.85, tileGroutGlow(0.85, "entry"));
    assert.ok(heat.tile.b > heat.tile.g);
    assert.ok(heat.tileWear.b > heat.tileWear.g);
    assert.ok(heat.tile.r > 0.5);
  });

  it("keeps residual grout warm when plasma is gone", () => {
    const u = tileGroutGlow(0, "descent");
    assert.ok(u >= 0.12);
    const heat = entryHeatEmissiveRgb(0, u);
    assert.ok(heat.tile.r > heat.tile.g);
    assert.ok(heat.tile.g > heat.tile.b);
    assert.ok(heat.tile.b < 0.05);
  });
});

describe("deriveEntryPlasma", () => {
  it("hides every layer outside the entry heat pulse", () => {
    const fx = deriveEntryPlasma(0, "launch", 0, 0);
    assert.equal(fx.visible, false);
    assert.equal(fx.strength, 0);
    for (const layer of [fx.core, fx.sheath, fx.trail]) {
      assert.equal(layer.visible, false);
      assert.equal(layer.opacity, 0);
    }
    assert.equal(fx.flapEdge.visible, false);
    assert.equal(fx.flapEdge.opacity, 0);
  });

  it("hides the envelope at or below the visibility floor", () => {
    // Just above the 5 km altitude gate, plasma has faded to nothing.
    const fx = deriveEntryPlasma(HOT.t, "descent", 5.5, 1.6);
    assert.ok(entryPlasmaStrength(HOT.t, "descent", 5.5, 1.6) <= PLASMA_VISIBLE_MIN);
    assert.equal(fx.visible, false);
    assert.equal(fx.flapEdge.visible, false);
  });

  it("shows belly layers and flap-edge wrap during the heat pulse", () => {
    const fx = deriveEntryPlasma(HOT.t, HOT.phase, HOT.altKm, HOT.speedKmS);
    assert.equal(fx.visible, true);
    assert.ok(fx.strength > PLASMA_VISIBLE_MIN);
    for (const layer of [fx.core, fx.sheath, fx.trail]) {
      assert.equal(layer.visible, true);
      assert.ok(layer.opacity > 0, "layer should be lit");
      assert.ok(layer.scale > 0, "layer should have positive scale");
    }
    assert.equal(fx.flapEdge.visible, true);
    assert.ok(fx.flapEdge.opacity > 0);
    assert.ok(fx.flapEdge.scale > 0);
  });

  it("orders layers core brightest, trail widest", () => {
    const fx = deriveEntryPlasma(HOT.t, HOT.phase, HOT.altKm, HOT.speedKmS);
    assert.ok(fx.core.opacity > fx.sheath.opacity);
    assert.ok(fx.sheath.opacity > fx.trail.opacity);
    assert.ok(fx.trail.scale > fx.sheath.scale);
    assert.ok(fx.sheath.scale > fx.core.scale);
  });

  it("leaves layers centred at zero bank", () => {
    const fx = deriveEntryPlasma(HOT.t, HOT.phase, HOT.altKm, HOT.speedKmS, 0);
    assert.equal(fx.core.offsetX, 0);
    assert.equal(fx.sheath.offsetX, 0);
    assert.equal(fx.trail.offsetX, 0);
  });

  it("skews the corridor to starboard on a positive bank", () => {
    const fx = deriveEntryPlasma(HOT.t, HOT.phase, HOT.altKm, HOT.speedKmS, 1);
    assert.ok(fx.trail.offsetX > fx.sheath.offsetX, "trail lags furthest");
    assert.ok(fx.sheath.offsetX > fx.core.offsetX, "core barely shifts");
    assert.ok(fx.core.offsetX > 0);
  });

  it("mirrors the skew for the opposite bank", () => {
    const right = deriveEntryPlasma(HOT.t, HOT.phase, HOT.altKm, HOT.speedKmS, 1);
    const left = deriveEntryPlasma(HOT.t, HOT.phase, HOT.altKm, HOT.speedKmS, -1);
    assert.ok(Math.abs(right.trail.offsetX + left.trail.offsetX) < 1e-12);
    assert.ok(right.trail.opacity > left.trail.opacity);
  });

  it("scales the envelope with plasma strength", () => {
    const weak = deriveEntryPlasma(HOT.t, HOT.phase, 90, 3.0);
    const strong = deriveEntryPlasma(HOT.t, HOT.phase, HOT.altKm, HOT.speedKmS);
    assert.ok(strong.strength > weak.strength);
    assert.ok(strong.core.scale > weak.core.scale);
    assert.ok(strong.flapEdge.opacity > weak.flapEdge.opacity);
  });

  it("returns frozen poses so applicators cannot mutate the model", () => {
    const fx = deriveEntryPlasma(HOT.t, HOT.phase, HOT.altKm, HOT.speedKmS);
    assert.throws(() => {
      (fx as { visible: boolean }).visible = false;
    });
  });
});

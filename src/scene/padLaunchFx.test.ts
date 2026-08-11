/**
 * Unit tests for pure pad launch FX (`padLaunchFx.ts`).
 *
 * Covers scrub stability (same inputs → same outputs), day/night floods,
 * flame/steam/haze/vent gates, sprite pose finiteness, and layout expanders.
 * No THREE / DOM — these helpers must stay pure.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bloomVisual,
  clamp01,
  derivePadFx,
  expandSteamSprites,
  flameVisual,
  floodFixtureEmissive,
  floodSpotDistance,
  floodSpotIntensity,
  hazeBaseZs,
  hazeSpritePose,
  olmLampColorHex,
  padBeaconOpacity,
  padDayNight,
  padFillColorHex,
  padFillDistance,
  padFillIntensity,
  padFlameStrength,
  padHazePeak,
  padOpsLights,
  padSteamStrength,
  padVentStrength,
  plumeLightDistance,
  plumeLightIntensity,
  plumeLightRgb,
  sheetSpritePose,
  smoothstep,
  steamSpritePose,
  STEAM_TIERS,
  tongueVisual,
  ventSpritePose,
  type LaunchPadFxState,
} from "./padLaunchFx.ts";

const base: LaunchPadFxState = {
  missionT: 2,
  phase: "launch",
  burning: true,
  altEarth: 0.2,
  sunElev: 0.5,
};

describe("clamp01 / smoothstep", () => {
  it("clamps and treats non-finite as 0", () => {
    assert.equal(clamp01(-1), 0);
    assert.equal(clamp01(0.5), 0.5);
    assert.equal(clamp01(2), 1);
    assert.equal(clamp01(Number.NaN), 0);
  });

  it("smoothsteps edges", () => {
    assert.equal(smoothstep(0, 1, 0), 0);
    assert.equal(smoothstep(0, 1, 1), 1);
    assert.ok(smoothstep(0, 1, 0.5) > 0.4 && smoothstep(0, 1, 0.5) < 0.6);
  });
});

describe("padDayNight", () => {
  it("is day for high sun elev", () => {
    const { day, night } = padDayNight(0.5);
    assert.ok(day > 0.95);
    assert.ok(night < 0.05);
  });

  it("is night for negative elev", () => {
    const { day, night } = padDayNight(-0.3);
    assert.ok(day < 0.05);
    assert.ok(night > 0.95);
  });

  it("defaults elev when omitted", () => {
    const d = padDayNight(undefined);
    assert.ok(d.day > 0.5);
  });
});

describe("padFlameStrength", () => {
  it("is zero when not burning", () => {
    const f = padFlameStrength({ ...base, burning: false });
    assert.equal(f.strength, 0);
    assert.equal(f.active, false);
  });

  it("is zero pre-liftoff even if burning flag set", () => {
    const f = padFlameStrength({ ...base, missionT: -30, burning: true });
    assert.equal(f.strength, 0);
  });

  it("is positive on pad at liftoff burn", () => {
    const f = padFlameStrength(base);
    assert.ok(f.active);
    assert.ok(f.strength > 0.5);
  });

  it("fades with altitude", () => {
    const low = padFlameStrength({ ...base, altEarth: 1 });
    const high = padFlameStrength({ ...base, altEarth: 15 });
    assert.ok(low.strength > high.strength);
  });

  it("is scrub-stable for same t", () => {
    assert.deepEqual(padFlameStrength(base), padFlameStrength(base));
  });
});

describe("padSteamStrength", () => {
  it("tracks launch burn near pad", () => {
    assert.ok(padSteamStrength(base) > 0.9);
  });

  it("is zero after long climb or non-ascent phase", () => {
    assert.equal(padSteamStrength({ ...base, altEarth: 40 }), 0);
    assert.equal(padSteamStrength({ ...base, phase: "coast" }), 0);
    assert.equal(padSteamStrength({ ...base, missionT: 200 }), 0);
  });
});

describe("padHazePeak", () => {
  it("peaks early after light near pad", () => {
    const early = padHazePeak(1, 1, 0.1);
    const late = padHazePeak(1, 30, 0.1);
    assert.ok(early > late);
  });

  it("dies with altitude", () => {
    assert.equal(padHazePeak(1, 1, 5), 0);
  });
});

describe("padVentStrength", () => {
  it("is strong on countdown hold", () => {
    const v = padVentStrength(
      { ...base, missionT: -60, burning: false },
      0,
      -60,
    );
    assert.ok(v > 0.7);
  });

  it("eases after liftoff and dims under strong flame", () => {
    const post = padVentStrength({ ...base, missionT: 30 }, 0);
    const dimmed = padVentStrength({ ...base, missionT: 30 }, 0.5);
    assert.ok(post > 0);
    assert.ok(dimmed < post);
  });
});

describe("padOpsLights", () => {
  it("enables floods at night on pad", () => {
    const night = padDayNight(-0.2);
    const ops = padOpsLights(base, night);
    assert.equal(ops.padOps, true);
    assert.ok(ops.floodBase > 1);
  });

  it("restrains floods in daytime", () => {
    const day = padDayNight(0.5);
    const ops = padOpsLights(base, day);
    assert.ok(ops.floodBase < 0.1);
  });
});

describe("derivePadFx", () => {
  it("bundles consistent scalars", () => {
    const d = derivePadFx(base);
    assert.ok(d.flame.strength > 0);
    assert.ok(d.steamStr > 0);
    assert.ok(d.hazePeak > 0);
    assert.equal(d.animT, base.missionT);
  });

  it("is scrub-stable", () => {
    assert.deepEqual(derivePadFx(base), derivePadFx(base));
  });
});

describe("sprite poses", () => {
  const animT = 2;

  it("steam pose is finite and scrub-stable", () => {
    const baseSp = {
      baseAng: 0.5,
      baseR: 0.03,
      baseY: 0.02,
      baseScale: 0.1,
      phase: 1.2,
      tier: 1,
    };
    const a = steamSpritePose(baseSp, 0.8, 0.5, animT);
    const b = steamSpritePose(baseSp, 0.8, 0.5, animT);
    assert.deepEqual(a, b);
    assert.ok(Number.isFinite(a.opacity) && a.opacity > 0);
    assert.ok(Number.isFinite(a.position.x));
  });

  it("outer steam tier is thinner", () => {
    const inner = steamSpritePose(
      {
        baseAng: 0,
        baseR: 0.03,
        baseY: 0.02,
        baseScale: 0.1,
        phase: 0,
        tier: 0,
      },
      1,
      0,
      0,
    );
    const outer = steamSpritePose(
      {
        baseAng: 0,
        baseR: 0.03,
        baseY: 0.02,
        baseScale: 0.1,
        phase: 0,
        tier: 2,
      },
      1,
      0,
      0,
    );
    assert.ok(outer.opacity < inner.opacity);
  });

  it("sheet / haze / vent poses stay finite", () => {
    const sheet = sheetSpritePose(
      {
        baseX: 0.01,
        baseY: 0.02,
        baseZ: 0,
        baseSx: 0.05,
        baseSy: 0.04,
        phase: 1,
      },
      0.9,
      0.2,
      animT,
    );
    const haze = hazeSpritePose({ baseZ: -0.01, phase: 0.5 }, 0.7, animT);
    const vent = ventSpritePose(
      { baseX: 0.1, baseY: 0.01, baseZ: 0.05, phase: 0.3 },
      0.8,
      0.5,
      animT,
    );
    for (const p of [sheet, haze, vent]) {
      assert.ok(p.opacity >= 0);
      assert.ok(Number.isFinite(p.scale.x) && Number.isFinite(p.position.y));
    }
  });
});

describe("mesh / light scalars", () => {
  it("flame visual gates visibility", () => {
    assert.equal(flameVisual(0).visible, false);
    assert.equal(flameVisual(0.1).visible, true);
    assert.equal(tongueVisual(0.04).visible, false);
    assert.equal(tongueVisual(0.1).visible, true);
    assert.ok(bloomVisual(0.1, 1).visible);
    assert.equal(bloomVisual(0, 1).visible, false);
  });

  it("primary flood is brighter than secondary", () => {
    assert.ok(floodSpotIntensity(1, 0, 0) > floodSpotIntensity(1, 0, 1));
    assert.ok(floodSpotDistance(1) > floodSpotDistance(0));
  });

  it("fill / plume light track ops and flame", () => {
    assert.equal(padFillIntensity(false, 1, 0, 0), 0);
    assert.ok(padFillIntensity(true, 0, 1, 0) > padFillIntensity(true, 1, 0, 0));
    assert.equal(padFillColorHex(0.2), 0xffe0c8);
    assert.equal(padFillColorHex(0), 0xdde6f4);
    assert.ok(padFillDistance(1) > padFillDistance(0));
    assert.equal(plumeLightIntensity(0.5), 1.1);
    assert.equal(plumeLightDistance(0.5), 0.19);
    const rgb = plumeLightRgb(1);
    assert.equal(rgb[0], 1);
    assert.ok(rgb[1]! > 0.55);
    assert.ok(floodFixtureEmissive(1) > floodFixtureEmissive(0));
  });

  it("olm lamps brighten at night when pad ops", () => {
    assert.equal(olmLampColorHex(true, 0.8), 0xf4f8ff);
    assert.equal(olmLampColorHex(true, 0.2), 0xc8d0dc);
    assert.equal(olmLampColorHex(false, 1), 0x444444);
  });

  it("beacon opacity pulses with wall time", () => {
    const a = padBeaconOpacity(0);
    const b = padBeaconOpacity(Math.PI / 8);
    assert.notEqual(a, b);
  });
});

describe("layout expanders", () => {
  it("expandSteamSprites matches tier counts", () => {
    const sprites = expandSteamSprites();
    const expected = STEAM_TIERS.reduce((n, t) => n + t.n, 0);
    assert.equal(sprites.length, expected);
    assert.equal(sprites[0]!.tier, 0);
  });

  it("hazeBaseZs is evenly spaced", () => {
    const zs = hazeBaseZs(3, 0, 0.01);
    assert.deepEqual([...zs], [0, 0.01, 0.02]);
  });
});

/**
 * Unit tests for pure terminal FX (`terminalFx.ts`).
 *
 * Covers scrub stability, descent expand, touchdown spike-then-fade, alt=40
 * gates, and per-layer poses. No THREE / DOM.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clamp01,
  clampRange,
  contactCueExpand,
  contactCueOpacity,
  CONTACT_FADE_ALT_KM,
  deriveLunarDust,
  deriveSplashSpray,
  descentDust,
  descentSpray,
  dustActive,
  dustExpandOpacity,
  landedDust,
  landingWashStrength,
  nearMoonPhase,
  nearSplash,
  sheetLayerPose,
  shouldShowSplashSite,
  splashdownSpray,
  sprayExpandOpacity,
  TERMINAL_ALT_GATE_KM,
  type LunarDustState,
  type SplashSprayState,
} from "./terminalFx.ts";

const lunar: LunarDustState = {
  missionT: 100,
  landT: 100,
  phase: "landed",
  burning: false,
  altMoon: 0.02,
};

const splash: SplashSprayState = {
  missionT: 3921,
  landT: 3921,
  phase: "splashdown",
  altEarth: 0.01,
};

describe("clamp01 / clampRange", () => {
  it("clamps and treats non-finite as 0 / lo", () => {
    assert.equal(clamp01(-1), 0);
    assert.equal(clamp01(0.5), 0.5);
    assert.equal(clamp01(2), 1);
    assert.equal(clamp01(Number.NaN), 0);
    assert.equal(clampRange(5, 4, 35), 5);
    assert.equal(clampRange(-1, 4, 35), 4);
    assert.equal(clampRange(99, 4, 35), 35);
    assert.equal(clampRange(Number.NaN, 4, 35), 4);
  });
});

describe("descentDust", () => {
  it("expand is monotonic as altitude drops", () => {
    const high = descentDust(30);
    const mid = descentDust(15);
    const low = descentDust(2);
    assert.ok(high.expand < mid.expand);
    assert.ok(mid.expand < low.expand);
    assert.ok(high.opacity < mid.opacity);
    assert.ok(mid.opacity <= low.opacity);
  });

  it("stays within theater clamps", () => {
    const far = descentDust(80);
    const onPad = descentDust(-20);
    assert.equal(far.expand, 4);
    assert.equal(onPad.expand, 35);
  });
});

describe("landedDust", () => {
  it("peaks at landT then fades exponentially", () => {
    const t0 = landedDust(100, 100);
    const t1 = landedDust(101.6, 100);
    const t200 = landedDust(300, 100);
    assert.ok(t0.opacity > 0.8);
    assert.ok(t0.opacity > t1.opacity);
    assert.ok(t1.opacity > t200.opacity);
    assert.ok(t200.opacity < 0.25);
  });

  it("expand grows over ~120 s then holds", () => {
    const a = landedDust(100, 100);
    const b = landedDust(220, 100);
    const c = landedDust(400, 100);
    assert.ok(b.expand > a.expand);
    assert.equal(b.expand, c.expand);
  });

  it("is scrub-stable", () => {
    assert.deepEqual(landedDust(150, 100), landedDust(150, 100));
  });
});

describe("dustExpandOpacity / dustActive / nearMoonPhase", () => {
  it("routes descent+burn to altitude curve", () => {
    assert.deepEqual(
      dustExpandOpacity(90, 100, "descent", true, 10),
      descentDust(10),
    );
  });

  it("routes landed to settle curve", () => {
    assert.deepEqual(
      dustExpandOpacity(100, 100, "landed", false, 0),
      landedDust(100, 100),
    );
  });

  it("gates dust at alt 40 km", () => {
    assert.equal(dustActive("descent", 39.9), true);
    assert.equal(dustActive("descent", 40), false);
    assert.equal(dustActive("landed", 80), true);
    assert.equal(dustActive("approach", 5), false);
  });

  it("shows the site from 1 h before landing", () => {
    assert.equal(nearMoonPhase("coast", 100, 4000), false);
    assert.equal(nearMoonPhase("coast", 500, 4000), true);
    assert.equal(nearMoonPhase("descent", 0, 4000), true);
  });
});

describe("splashdownSpray / descentSpray", () => {
  it("spikes at splash then fades faster than lunar dust", () => {
    const t0 = splashdownSpray(10, 10);
    const t150 = splashdownSpray(160, 10);
    assert.ok(t0.opacity > 0.85);
    assert.ok(t150.opacity < t0.opacity);
    assert.ok(t150.opacity < 0.25);
  });

  it("descent expand grows as alt drops", () => {
    assert.ok(descentSpray(18).expand < descentSpray(5).expand);
  });

  it("routes splashdown or t >= landT to settle", () => {
    assert.deepEqual(
      sprayExpandOpacity(50, 40, "coast", 100),
      splashdownSpray(50, 40),
    );
    assert.deepEqual(
      sprayExpandOpacity(30, 40, "descent", 8),
      descentSpray(8),
    );
  });
});

describe("nearSplash / shouldShowSplashSite", () => {
  it("gates spray at late entry and 40 km", () => {
    assert.equal(nearSplash("entry", 24), true);
    assert.equal(nearSplash("entry", 25), false);
    assert.equal(nearSplash("descent", 100), true);
  });

  it("shows the site from 40 min before splash", () => {
    assert.equal(shouldShowSplashSite("coast", 99, 2500), false);
    assert.equal(shouldShowSplashSite("coast", 100, 2500), true);
    assert.equal(shouldShowSplashSite("entry", 0, 2500), true);
  });
});

describe("contactCue", () => {
  it("is off above fade altitude and ramps in near the surface", () => {
    assert.equal(contactCueOpacity(CONTACT_FADE_ALT_KM + 0.1), 0);
    assert.ok(contactCueOpacity(0) > contactCueOpacity(1.5));
    assert.ok(contactCueExpand(0) > contactCueExpand(CONTACT_FADE_ALT_KM));
  });
});

describe("landingWashStrength", () => {
  it("is on only during a low descent burn", () => {
    assert.equal(landingWashStrength("descent", false, 2), 0);
    assert.equal(landingWashStrength("landed", true, 0.1), 0);
    assert.equal(landingWashStrength("descent", true, 40), 0);
    const low = landingWashStrength("descent", true, 2);
    const high = landingWashStrength("descent", true, 20);
    assert.ok(low > high);
    assert.ok(low > 0.8);
  });
});

describe("sheetLayerPose", () => {
  it("is on in a brief window around contact", () => {
    const at = sheetLayerPose(0, 0.5, 0.05, true);
    const late = sheetLayerPose(40, 0.5, 0.05, true);
    const high = sheetLayerPose(-20, 0.4, 30, true);
    assert.equal(at.visible, true);
    assert.equal(late.visible, false);
    assert.equal(high.visible, false);
    assert.ok(at.height > 8);
  });
});

describe("deriveLunarDust", () => {
  it("is scrub-stable and wires layers from the base curve", () => {
    const a = deriveLunarDust(lunar);
    const b = deriveLunarDust(lunar);
    assert.deepEqual(a, b);
    assert.equal(a.siteVisible, true);
    assert.equal(a.active, true);
    assert.ok(a.inner.expand < a.base.expand);
    assert.ok(a.outer.expand > a.base.expand);
    assert.ok(a.inner.opacity > a.outer.opacity);
    assert.equal(a.sheet.visible, true);
    assert.equal(a.contact.visible, true);
  });

  it("hides dust on high-alt approach", () => {
    const d = deriveLunarDust({
      ...lunar,
      missionT: 10,
      landT: 4000,
      phase: "approach",
      burning: true,
      altMoon: 200,
    });
    assert.equal(d.active, false);
    assert.equal(d.inner.visible, false);
    assert.equal(d.siteVisible, true);
  });
});

describe("deriveSplashSpray", () => {
  it("is scrub-stable and gates at 40 km", () => {
    const a = deriveSplashSpray(splash);
    assert.deepEqual(a, deriveSplashSpray(splash));
    assert.equal(a.active, true);
    assert.equal(a.inner.visible, true);

    const high = deriveSplashSpray({
      ...splash,
      phase: "entry",
      altEarth: TERMINAL_ALT_GATE_KM,
    });
    assert.equal(high.active, false);
  });
});

/**
 * Unit tests for ascent/Return-to-launch-site cross-section pure helpers.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { loadPrecomputedTrajectory } from "../physics/trajectoryCache.ts";
import { ATM_H_MAX_KM, R_EARTH } from "../physics/constants.ts";
import {
  BOOSTER_VISIBLE_S,
  type StageState,
} from "../physics/boosterRecovery.ts";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch.ts";
import type { ReadonlySample } from "../physics/missionTypes.ts";
import {
  buildCrossSectionModel,
  drawCrossSection,
  fitView,
  liveCrossSection,
  planeAltitudeKm,
  projectToLaunchPlane,
  launchPlaneBasis,
  samplePosAt,
  stageStateFromSamples,
  surfaceArcKm,
  trailUpTo,
  worldToCanvas,
  type CrossSectionModel,
} from "./crossSection.ts";

let samples: readonly ReadonlySample[];
let stage: StageState | null;
let model: CrossSectionModel;

let epoch: EphemerisEpoch;

before(() => {
  const cache = loadPrecomputedTrajectory();
  epoch = cache.epoch;
  samples = cache.samples;
  stage = stageStateFromSamples(samples);
  model = buildCrossSectionModel(samples, stage, "chopsticks", epoch);
});

describe("launch plane projection", () => {
  it("places liftoff near the surface with small range", () => {
    const s0 = samples[0]!;
    const basis = launchPlaneBasis();
    const p = projectToLaunchPlane(s0.pos, s0.t, basis, undefined, epoch);
    const alt = planeAltitudeKm(p);
    const range = surfaceArcKm(p);
    assert.ok(Math.abs(alt) < 0.5, `alt ${alt}`);
    assert.ok(Math.abs(range) < 2, `range ${range}`);
  });

  it("puts hot-stage tens of km up and downrange", () => {
    assert.ok(stage);
    const basis = launchPlaneBasis();
    const p = projectToLaunchPlane(stage!.pos, stage!.t, basis, undefined, epoch);
    const alt = planeAltitudeKm(p);
    const range = surfaceArcKm(p);
    assert.ok(alt > 40 && alt < 120, `stage alt ${alt}`);
    assert.ok(range > 20 && range < 150, `stage range ${range}`);
  });
});

describe("buildCrossSectionModel", () => {
  it("builds booster trail covering return-to-launch-site path near pad", () => {
    assert.ok(model.boosterTrail.length > 50);
    assert.ok(model.stageT != null && model.stageT > 0);
    const last = model.boosterTrail[model.boosterTrail.length - 1]!;
    assert.ok(last.t >= (model.stageT ?? 0) + 200);
    const alt = planeAltitudeKm(last, model.rEarth);
    const range = surfaceArcKm(last, model.rEarth);
    // Chopsticks catch: low alt, near pad
    assert.ok(alt < 1, `catch alt ${alt}`);
    assert.ok(Math.abs(range) < 5, `catch range ${range}`);
  });

  it("frames atmosphere and booster envelope at true scale", () => {
    assert.equal(model.rAtm, R_EARTH + ATM_H_MAX_KM);
    assert.ok(model.bounds.yMax >= model.rAtm - 5);
    assert.ok(model.bounds.xMax > 50);
    // Envelope stays low-Earth-orbit-local (not cislunar)
    assert.ok(model.bounds.xMax < 500);
  });
});

describe("liveCrossSection", () => {
  it("keeps stack co-located before stage-out", () => {
    assert.ok(stage);
    const t = stage!.t * 0.5;
    const live = liveCrossSection(model, samples, stage, t);
    assert.equal(live.staged, false);
    assert.ok(live.ship && live.booster);
    assert.ok(
      Math.hypot(live.ship!.x - live.booster!.x, live.ship!.y - live.booster!.y) <
        0.05,
    );
  });

  it("separates ship and booster after stage-out", () => {
    assert.ok(stage);
    const t = stage!.t + 60;
    const live = liveCrossSection(model, samples, stage, t);
    assert.equal(live.staged, true);
    assert.ok(live.ship && live.booster);
    const sep = Math.hypot(
      live.ship!.x - live.booster!.x,
      live.ship!.y - live.booster!.y,
    );
    assert.ok(sep > 1, `sep ${sep}`);
    assert.ok(live.boosterFade > 0.5);
  });

  it("shows booster near pad at catch", () => {
    assert.ok(stage);
    const t = stage!.t + 290;
    const live = liveCrossSection(model, samples, stage, t);
    assert.ok(live.booster);
    assert.ok(live.boosterAltKm < 1);
    assert.ok(Math.abs(live.boosterRangeKm) < 5);
  });
});

describe("view helpers", () => {
  it("fitView is isotropic and worldToCanvas flips y", () => {
    const view = fitView(
      { xMin: 0, xMax: 100, yMin: R_EARTH, yMax: R_EARTH + 100 },
      800,
      400,
      1,
      20,
    );
    // scale limited by height (100 km in 360 px) or width
    assert.ok(view.scale > 0);
    const a = worldToCanvas({ x: 0, y: R_EARTH + 100 }, view);
    const b = worldToCanvas({ x: 0, y: R_EARTH }, view);
    // Higher altitude → smaller canvas y
    assert.ok(a.y < b.y);
  });

  it("trailUpTo clips to mission time", () => {
    const trail = [
      { x: 0, y: 0, t: 0 },
      { x: 1, y: 1, t: 10 },
      { x: 2, y: 2, t: 20 },
    ];
    assert.equal(trailUpTo(trail, 10).length, 2);
    assert.equal(trailUpTo(trail, -1).length, 1);
  });

  it("samplePosAt interpolates", () => {
    const a = samples[0]!;
    const b = samples[10]!;
    const mid = samplePosAt(samples, (a.t + b.t) / 2);
    assert.ok(mid);
    assert.ok(Number.isFinite(mid!.x));
  });
});

describe("BOOSTER_VISIBLE_S sanity", () => {
  it("is long enough for return to launch site theater", () => {
    assert.ok(BOOSTER_VISIBLE_S > 300);
  });
});

/** Minimal Canvas 2D mock for drawCrossSection smoke tests. */
function mockCsCtx() {
  const canvas = { width: 0, height: 0 };
  let strokes = 0;
  let texts = 0;
  const ctx = {
    canvas,
    lineWidth: 1,
    strokeStyle: "",
    fillStyle: "",
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    globalAlpha: 1,
    lineJoin: "miter" as CanvasLineJoin,
    lineCap: "butt" as CanvasLineCap,
    save() {},
    restore() {},
    translate() {},
    setTransform() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    closePath() {},
    stroke() {
      strokes++;
    },
    fill() {},
    fillText() {
      texts++;
    },
    get counts() {
      return { strokes, texts };
    },
  };
  return ctx;
}

describe("drawCrossSection", () => {
  it("paints stacked launch glyph before stage-out", () => {
    assert.ok(stage);
    const ctx = mockCsCtx();
    const live = liveCrossSection(model, samples, stage, stage!.t * 0.25);
    assert.equal(live.staged, false);
    drawCrossSection(
      ctx as unknown as CanvasRenderingContext2D,
      model,
      live,
      stage!.t * 0.25,
      960,
      540,
      1,
    );
    assert.ok(ctx.counts.strokes > 20);
    assert.ok(ctx.counts.texts >= 1);
  });
});

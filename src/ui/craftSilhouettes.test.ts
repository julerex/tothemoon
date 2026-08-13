/**
 * Unit tests for cross-section craft silhouettes (stacked launch glyph).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  drawBoosterIcon,
  drawShipIcon,
  drawStackLaunchIcon,
  STACK_LAUNCH,
  stackLaunchBounds,
} from "./craftSilhouettes.ts";

/** Minimal Canvas 2D mock that records draw ops. */
function mockCtx() {
  const canvas = { width: 0, height: 0 };
  let fills = 0;
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
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    stroke() {
      strokes++;
    },
    fill() {
      fills++;
    },
    fillText() {
      texts++;
    },
    get counts() {
      return { fills, strokes, texts };
    },
  };
  return ctx;
}

describe("stackLaunchBounds", () => {
  it("is symmetric and taller than wide (launch elevation)", () => {
    const b = stackLaunchBounds();
    assert.equal(b.xMin, -b.xMax);
    assert.equal(b.yMin, STACK_LAUNCH.noseY);
    assert.equal(b.yMax, STACK_LAUNCH.plumeEndY);
    assert.ok(b.yMax - b.yMin > (b.xMax - b.xMin) * 2);
  });

  it("places the nose above the interstage and engines below the booster", () => {
    const L = STACK_LAUNCH;
    assert.ok(L.noseY < L.shoulderY);
    assert.ok(L.shoulderY < L.shipBaseY);
    assert.ok(L.shipBaseY <= L.boostTopY);
    assert.ok(L.boostTopY < L.boostBotY);
    assert.ok(L.boostBotY < L.engineTipY);
    assert.ok(L.engineTipY < L.plumeEndY);
  });

  it("keeps canards near the nose and aft flaps on the ship", () => {
    const L = STACK_LAUNCH;
    assert.ok(L.canardY > L.noseY && L.canardY < L.shoulderY);
    assert.ok(L.aftFlapTopY > L.shoulderY && L.aftFlapBotY <= L.shipBaseY + 0.5);
    assert.ok(L.aftFlapTipX > L.canardTipX);
    assert.ok(L.gridFinTipX > L.bodyHalfW);
  });
});

describe("craft silhouette draw", () => {
  it("drawStackLaunchIcon strokes the stack and labels it", () => {
    const ctx = mockCtx();
    drawStackLaunchIcon(ctx as unknown as CanvasRenderingContext2D, { x: 40, y: 80 });
    assert.ok(ctx.counts.strokes > 8, `strokes ${ctx.counts.strokes}`);
    assert.equal(ctx.counts.texts, 1);
  });

  it("separated stage glyphs still stroke and label", () => {
    const ctx = mockCtx();
    drawShipIcon(ctx as unknown as CanvasRenderingContext2D, { x: 0, y: 0 }, 0.55);
    drawBoosterIcon(ctx as unknown as CanvasRenderingContext2D, { x: 10, y: 10 }, 0.8);
    assert.ok(ctx.counts.strokes > 6);
    assert.equal(ctx.counts.texts, 2);
  });
});

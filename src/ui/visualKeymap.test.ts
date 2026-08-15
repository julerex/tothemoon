import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boardSizeUnits,
  drawVisualKeymap,
  KEYMAP_ROWS,
  rowWidthUnits,
} from "./visualKeymap.ts";

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
    setTransform() {},
    clearRect() {},
    fillRect() {
      fills++;
    },
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

describe("visualKeymap layout", () => {
  it("has five rows of keys", () => {
    assert.equal(KEYMAP_ROWS.length, 5);
  });

  it("includes core bound actions", () => {
    const actions = new Map<string, string>();
    for (const row of KEYMAP_ROWS) {
      for (const k of row) {
        if (k.action) actions.set(k.label, k.action);
      }
    }
    assert.equal(actions.get("`"), "Cycle cameras");
    assert.equal(actions.get("1"), "Sun");
    assert.equal(actions.get("2"), "Moon");
    assert.equal(actions.get("3"), "Earth");
    assert.equal(actions.get("4"), "Pad");
    assert.equal(actions.get("5"), "Launchpad");
    assert.equal(actions.get("6"), "Booster");
    assert.equal(actions.get("7"), "Starship");
    assert.equal(actions.get("8"), "Fin cam");
    assert.equal(actions.get("9"), "Hull cam");
    assert.equal(actions.get("Q"), "Yaw ←");
    assert.equal(actions.get("E"), "Yaw →");
    assert.equal(actions.get("A"), "Pan →");
    assert.equal(actions.get("D"), "Pan ←");
    assert.equal(actions.get("C"), "Roll ←");
    assert.equal(actions.get("V"), "Roll →");
    assert.equal(actions.get("G"), "Auto-cam");
    assert.equal(actions.get("Tab"), "Dashboards");
    assert.equal(actions.get("Space"), "Play / pause");
    assert.equal(actions.get("K"), "KeyMap");
  });

  it("rowWidthUnits sums key widths and gaps", () => {
    const row = [
      { label: "A", w: 1 },
      { label: "B", w: 2 },
    ] as const;
    // 1 + gap(0.08) + 2
    assert.ok(Math.abs(rowWidthUnits(row) - 3.08) < 1e-9);
  });

  it("boardSizeUnits is finite and positive", () => {
    const { w, h } = boardSizeUnits();
    assert.ok(w > 10);
    assert.ok(h > 4);
    assert.ok(Number.isFinite(w) && Number.isFinite(h));
  });

  it("boardSizeUnits handles a single empty-ish row", () => {
    const { w, h } = boardSizeUnits([[{ label: "X" }]]);
    assert.ok(w >= 1);
    assert.equal(h, 1);
  });

  it("drawVisualKeymap paints board and mouse legend without throwing", () => {
    const ctx = mockCtx();
    drawVisualKeymap(ctx as unknown as CanvasRenderingContext2D, 800, 400, 1);
    assert.ok(ctx.canvas.width === 800);
    assert.ok(ctx.canvas.height === 400);
    assert.ok(ctx.counts.strokes > 10);
    assert.ok(ctx.counts.texts > 10);
    // Second call with same size should not resize
    drawVisualKeymap(ctx as unknown as CanvasRenderingContext2D, 800, 400, 1);
    assert.equal(ctx.canvas.width, 800);
  });
});

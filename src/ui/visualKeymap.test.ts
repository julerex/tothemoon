import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boardSizeUnits,
  drawVisualKeymap,
  KEYMAP_ROWS,
  rowsWithDigitActions,
  keyLegendAlign,
  rowKeySlots,
  rowLiftUnits,
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
    assert.equal(actions.get("-"), "Slower");
    assert.equal(actions.get("+"), "Faster");
    assert.equal(actions.has(","), false);
    assert.equal(actions.has("."), false);
    assert.equal(actions.get("["), "Prev camera");
    assert.equal(actions.get("]"), "Next camera");
    assert.equal(actions.has("`"), false);
    assert.equal(actions.get("0"), "T−5");
    assert.equal(actions.get("1"), "Bookmark");
    assert.equal(actions.get("2"), "Bookmark");
    assert.equal(actions.get("6"), "Bookmark");
    assert.equal(actions.has("7"), false);
    assert.equal(actions.has("9"), false);
    assert.equal(actions.get("Q"), "Yaw ←");
    assert.equal(actions.get("E"), "Yaw →");
    assert.equal(actions.get("A"), "Pan ←");
    assert.equal(actions.get("D"), "Pan →");
    assert.equal(actions.get("T"), "Pan ↑");
    assert.equal(actions.get("B"), "Pan ↓");
    assert.equal(actions.get("C"), "Roll ←");
    assert.equal(actions.get("V"), "Roll →");
    assert.equal(actions.has("G"), false);
    assert.equal(actions.get("\\"), "Toggle Auto-camera");
    assert.equal(actions.get("L"), "Toggle Labels");
    assert.equal(actions.get("O"), "Toggle Orbits");
    assert.equal(actions.get("Tab"), "Dashboards");
    assert.equal(actions.get("P"), "Play / pause");
    assert.equal(actions.get("Space"), "Play / pause");
    assert.equal(actions.get("H"), "Help");
    assert.equal(actions.get("K"), "KeyMap");
    assert.equal(actions.get("M"), "Menu");
    assert.equal(actions.get("Esc"), "Close");
  });

  it("replaces Bookmark captions with the mission stage names", () => {
    const rows = rowsWithDigitActions((digit) => {
      const stages = ["T−5", "Pad", "Staging", "Halfway", "Splashdown"];
      return stages[digit];
    });
    const actions = new Map<string, string>();
    for (const row of rows) {
      for (const key of row) {
        if (key.action) actions.set(key.label, key.action);
      }
    }
    assert.equal(actions.get("1"), "Pad");
    assert.equal(actions.get("2"), "Staging");
    assert.equal(actions.get("4"), "Splashdown");
    assert.equal(actions.has("5"), false);
    assert.equal(actions.has("6"), false);
    assert.equal(actions.get("0"), "T−5");
    assert.equal(actions.get("P"), "Play / pause");
  });

  it("places Esc above the backtick at half the key height", () => {
    const top = KEYMAP_ROWS[0]!;
    const grave = top.findIndex((k) => k.label === "`");
    const esc = grave - 1;
    assert.ok(grave > 0);
    assert.equal(top[esc]!.label, "Esc");
    assert.equal(top[esc]!.h, 0.5);
    assert.equal(rowLiftUnits(top), 0.5 + 0.1);
    const { w } = boardSizeUnits();
    const slots = rowKeySlots(top, w);
    assert.equal(slots[esc]!.x, slots[grave]!.x);
    assert.equal(slots[esc]!.w, slots[grave]!.w);
    const withoutEsc = top.filter((key) => key.label !== "Esc");
    assert.ok(Math.abs(rowWidthUnits(top) - rowWidthUnits(withoutEsc)) < 1e-9);
    for (const row of KEYMAP_ROWS.slice(1)) {
      assert.equal(row.some((k) => k.label === "Esc"), false);
      assert.equal(rowLiftUnits(row), 0);
    }
  });

  it("rowWidthUnits sums key widths and gaps", () => {
    const row = [
      { label: "A", w: 1 },
      { label: "B", w: 2 },
    ] as const;
    // 1 + gap(0.08) + 2
    assert.ok(Math.abs(rowWidthUnits(row) - 3.08) < 1e-9);
  });

  it("left-aligns Tab, Caps, and Shift and fills each row to the board width", () => {
    const { w } = boardSizeUnits();
    const firstOf = (label: string) => {
      const row = KEYMAP_ROWS.find((candidate) => candidate[0]?.label === label);
      assert.ok(row);
      return rowKeySlots(row, w)[0]!;
    };
    const tab = firstOf("Tab");
    const caps = firstOf("Caps");
    const shift = firstOf("Shift");
    assert.equal(tab.x, 0);
    assert.equal(caps.x, 0);
    assert.equal(shift.x, 0);
    assert.equal(tab.w, 1.5);
    assert.equal(caps.w, 1.75);
    assert.equal(shift.w, 2.25);
    assert.equal(keyLegendAlign("Tab"), "left");
    assert.equal(keyLegendAlign("Caps"), "left");
    assert.equal(keyLegendAlign("Shift", false), "left");
    assert.equal(keyLegendAlign("Shift", true), "right");
    assert.equal(keyLegendAlign("\\"), "right");
    assert.equal(keyLegendAlign("Enter"), "right");
    assert.equal(keyLegendAlign("⌫"), "right");
    assert.equal(keyLegendAlign("A"), "center");
    for (const row of KEYMAP_ROWS) {
      const slots = rowKeySlots(row, w);
      const last = slots[slots.length - 1]!;
      assert.ok(Math.abs(last.x + last.w - w) < 1e-6);
    }
    const bottom = KEYMAP_ROWS[4]!;
    const space = bottom.findIndex((key) => key.label === "Space");
    assert.ok(rowKeySlots(bottom, w)[space]!.w > (bottom[space]!.w ?? 1));
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

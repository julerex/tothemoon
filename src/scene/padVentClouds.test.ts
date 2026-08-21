/**
 * Soft cryo vent puff paint (V23.5) — dense multi-lobe white, not facets.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paintCryoVentPuff } from "./earthTheater/padVentClouds.ts";

type Call = { op: string; args?: unknown[] };

function mockCtx(): CanvasRenderingContext2D & { calls: Call[] } {
  const calls: Call[] = [];
  const ctx = {
    calls,
    clearRect(...args: unknown[]) { calls.push({ op: "clearRect", args }); },
    createRadialGradient() {
      return {
        addColorStop() { calls.push({ op: "addColorStop" }); },
      };
    },
    beginPath() { calls.push({ op: "beginPath" }); },
    ellipse(...args: unknown[]) { calls.push({ op: "ellipse", args }); },
    fill() { calls.push({ op: "fill" }); },
    fillStyle: "",
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: Call[] };
}

describe("paintCryoVentPuff V23.5", () => {
  it("paints a soft multi-lobe puff without throwing", () => {
    const ctx = mockCtx();
    paintCryoVentPuff(ctx, 128, 0xc10d201);
    assert.ok(ctx.calls.some((c) => c.op === "clearRect"));
    const ellipses = ctx.calls.filter((c) => c.op === "ellipse");
    // Core + several lobes.
    assert.ok(ellipses.length >= 7, `got ${ellipses.length} ellipses`);
    assert.ok(ctx.calls.some((c) => c.op === "fill"));
  });

  it("is deterministic for a fixed seed", () => {
    const a = mockCtx();
    const b = mockCtx();
    paintCryoVentPuff(a, 128, 0xc10d202);
    paintCryoVentPuff(b, 128, 0xc10d202);
    assert.equal(a.calls.length, b.calls.length);
    assert.equal(
      a.calls.filter((c) => c.op === "ellipse").length,
      b.calls.filter((c) => c.op === "ellipse").length,
    );
  });
});

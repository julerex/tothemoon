/**
 * Coast corridor overlay helpers (Kepler whiskers + V10 live beats).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCoastBeatsOverlay,
  earthMoonWhisker,
  sunCraftTick,
  sunCraftTickVisible,
  SUN_CRAFT_TICK_LENGTH_KM,
  updateCoastBeatsOverlay,
} from "./coastCorridor.ts";

const origin = { x: 0, y: 0, z: 0 };
const moon = { x: 1e5, y: 0, z: 0 };
const sun = { x: 1.5e8, y: 0, z: 0 };

describe("earthMoonWhisker", () => {
  it("is a two-point Earth–Moon segment", () => {
    const w = earthMoonWhisker(origin, moon);
    assert.equal(w.length, 6);
    assert.deepEqual(w, [0, 0, 0, 1e5, 0, 0]);
  });
});

describe("sunCraftTick", () => {
  it("is a short tick from craft toward the Sun", () => {
    const craft = { x: 2e5, y: 0, z: 0 };
    const tick = sunCraftTick(craft, sun);
    assert.equal(tick[0], craft.x);
    assert.equal(tick[1], craft.y);
    assert.equal(tick[2], craft.z);
    const dx = tick[3]! - tick[0]!;
    const dy = tick[4]! - tick[1]!;
    const dz = tick[5]! - tick[2]!;
    const len = Math.hypot(dx, dy, dz);
    assert.ok(Math.abs(len - SUN_CRAFT_TICK_LENGTH_KM) < 1e-6);
    assert.ok(dx > 0);
  });

  it("hides near Earth and shows in cislunar space", () => {
    assert.equal(sunCraftTickVisible({ x: 7_000, y: 0, z: 0 }, origin), false);
    assert.equal(sunCraftTickVisible({ x: 2e5, y: 0, z: 0 }, origin), true);
  });
});

describe("coast beats overlay", () => {
  it("writes endpoints without allocating new children", () => {
    const group = createCoastBeatsOverlay();
    const before = group.children.length;
    updateCoastBeatsOverlay(group, origin, moon, sun, { x: 2e5, y: 0, z: 0 });
    updateCoastBeatsOverlay(group, origin, moon, sun, { x: 2.1e5, y: 0, z: 0 });
    assert.equal(group.children.length, before);
    assert.equal(group.name, "coast-beats");
  });

  it("hides the sun-craft tick while the craft is near Earth", () => {
    const group = createCoastBeatsOverlay();
    const tick = group.getObjectByName("sun-craft-tick");
    assert.ok(tick);
    updateCoastBeatsOverlay(group, origin, moon, sun, { x: 7_000, y: 0, z: 0 });
    assert.equal(tick.visible, false);
    updateCoastBeatsOverlay(group, origin, moon, sun, { x: 2e5, y: 0, z: 0 });
    assert.equal(tick.visible, true);
  });
});

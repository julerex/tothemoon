/**
 * Auto-cam drops on any camera-move key so webcast cuts cannot fight the user.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CameraDirector, CameraMode } from "../camera/modes.ts";
import type { MissionClock } from "../mission/clock.ts";
import type { Trajectory } from "../physics/trajectoryCache.ts";
import { makeTheaterHudHandlers, type TheaterHudWire } from "./theaterHandlers.ts";

function stubWire(): { w: TheaterHudWire; enabled: () => boolean } {
  let on = true;
  const w: TheaterHudWire = {
    clock: {} as MissionClock,
    director: {
      setMode() {},
      frameMode() {},
      setOrbitKey: () => "chase" as CameraMode,
      setPanKey: () => "chase" as CameraMode,
      setZoomKey: () => "chase" as CameraMode,
    } as unknown as CameraDirector,
    autoCam: { enabled: true, phase: null, staged: false },
    cache: {} as Trajectory,
    disableAutoCam: () => {
      on = false;
      w.autoCam.enabled = false;
    },
    toggleOrbits: () => false,
    setOrbitsVisible() {},
  };
  return { w, enabled: () => on };
}

describe("makeTheaterHudHandlers Auto-cam", () => {
  it("turns Auto-cam off on pan, orbit, and zoom key down", () => {
    const { w, enabled } = stubWire();
    const h = makeTheaterHudHandlers(w);
    h.onPanKey("w", true);
    assert.equal(enabled(), false);

    const b = stubWire();
    makeTheaterHudHandlers(b.w).onOrbitKey("q", true);
    assert.equal(b.enabled(), false);

    const c = stubWire();
    makeTheaterHudHandlers(c.w).onZoomKey("z", true);
    assert.equal(c.enabled(), false);
  });

  it("does not turn Auto-cam off on key up", () => {
    const { w, enabled } = stubWire();
    const h = makeTheaterHudHandlers(w);
    h.onOrbitKey("q", false);
    h.onPanKey("d", false);
    h.onZoomKey("x", false);
    assert.equal(enabled(), true);
  });

  it("turns Auto-cam off when the user picks a rail camera", () => {
    const { w, enabled } = stubWire();
    makeTheaterHudHandlers(w).onCamera("tower");
    assert.equal(enabled(), false);
  });
});

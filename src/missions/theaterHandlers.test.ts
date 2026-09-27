/**
 * Auto-cam drops on free-camera move keys so webcast cuts cannot fight the user.
 * Fixed livestream cameras reject movement and leave Auto-cam on.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CameraDirector, CameraMode } from "../camera/modes.ts";
import type { MissionClock } from "../mission/clock.ts";
import type { Trajectory } from "../physics/trajectoryCache.ts";
import { openingBookmark } from "../mission/bookmarks.ts";
import { makeTheaterHudHandlers, type TheaterHudWire } from "./theaterHandlers.ts";

function stubWire(
  mode: CameraMode = "chase",
): { w: TheaterHudWire; enabled: () => boolean; framed: () => boolean } {
  let on = true;
  let framed = false;
  const w: TheaterHudWire = {
    clock: {} as MissionClock,
    director: {
      getMode: () => mode,
      setMode() {},
      frameMode() {
        framed = true;
      },
      setOrbitKey: () => mode,
      setPanKey: () => mode,
      setZoomKey: () => mode,
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
  return { w, enabled: () => on, framed: () => framed };
}

describe("makeTheaterHudHandlers Auto-cam", () => {
  it("turns Auto-cam off on pan, orbit, and zoom key down on a free camera", () => {
    const { w, enabled } = stubWire("chase");
    const h = makeTheaterHudHandlers(w);
    h.onPanKey("w", true);
    assert.equal(enabled(), false);

    const b = stubWire("tower");
    makeTheaterHudHandlers(b.w).onOrbitKey("q", true);
    assert.equal(b.enabled(), false);

    const c = stubWire("sun");
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

  it("leaves Auto-cam on when the user tries to move a fixed camera", () => {
    const { w, enabled } = stubWire("fin");
    const h = makeTheaterHudHandlers(w);
    h.onPanKey("w", true);
    h.onOrbitKey("q", true);
    h.onZoomKey("z", true);
    assert.equal(enabled(), true);
  });

  it("seeks 0 to the T−5 opening and re-arms Auto-cam", () => {
    const { w } = stubWire();
    let sought = -1;
    let snapped: number | null = null;
    w.clock = { seek(t: number) { sought = t; } } as MissionClock;
    w.director.snapPadOpening = (t: number) => {
      snapped = t;
    };
    w.autoCam.phase = "coast";
    w.autoCam.staged = true;
    w.autoCam.shotKey = "hull";
    makeTheaterHudHandlers(w).onBookmark?.(openingBookmark());
    assert.equal(sought, 0);
    assert.equal(w.autoCam.phase, null);
    assert.equal(w.autoCam.staged, false);
    assert.equal(w.autoCam.shotKey, null);
    assert.equal(snapped, null);
  });

  it("seats the pad tableau at T−5 when Auto-cam is off", () => {
    const { w } = stubWire();
    let snapped: number | null = null;
    w.clock = { seek() {} } as MissionClock;
    w.director.snapPadOpening = (t: number) => {
      snapped = t;
    };
    w.autoCam.enabled = false;
    makeTheaterHudHandlers(w).onBookmark?.(openingBookmark());
    assert.equal(snapped, openingBookmark().t);
  });

  it("turns Auto-cam off when the user picks a free rail camera", () => {
    const { w, enabled } = stubWire();
    makeTheaterHudHandlers(w).onCamera("tower");
    assert.equal(enabled(), false);
  });

  it("turns Auto-cam off when the user picks a fixed rail camera", () => {
    const { w, enabled } = stubWire();
    makeTheaterHudHandlers(w).onCamera("aerial");
    assert.equal(enabled(), false);
  });

  it("does not turn Auto-cam off on a fixed-camera frame tap", () => {
    const { w, enabled, framed } = stubWire("fin");
    const h = makeTheaterHudHandlers(w);
    assert.ok(h.onCameraFrame);
    h.onCameraFrame("fin");
    assert.equal(enabled(), true);
    assert.equal(framed(), true);
  });
});

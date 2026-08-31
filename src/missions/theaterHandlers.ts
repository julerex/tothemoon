/**
 * Shared HUD + pointer wiring for mission theaters.
 *
 * Both theaters bound the same transport, camera, and toggle handlers to their
 * HUD — the two copies were identical apart from local function names. The
 * handlers only need a small slice of each mission's context, so they take one
 * {@link TheaterHudWire} record instead of a mission-specific one.
 */

import type * as THREE from "three";
import type { CameraDirector } from "../camera/modes";
import type { CameraMode } from "../camera/modes";
import type { MissionClock } from "../mission/clock";
import type { CinematicBookmark } from "../mission/bookmarks";
import type { LandingBeatEffects } from "../mission/landingBeatHold";
import type { PhaseId } from "../physics/missionTypes";
import { sampleAtProgress, type Trajectory } from "../physics/trajectoryCache";
import { nudgePlaybackSpeed } from "../ui/hudFormat";
import type { HudHandlers } from "../ui/hud";
import { getZoomLabelsVisible, setZoomLabelsVisible } from "../scene/zoomLabels";
import type { createVectorArrows } from "../scene/vectorArrows";

/** Guided-camera state the shared handlers read and write. */
export type TheaterAutoCam = {
  enabled: boolean;
  phase: PhaseId | null;
  staged: boolean;
  /** Flight 13 webcast shot key; ignored on the lunar profile. */
  shotKey?: string | null;
};

/** The slice of a mission context the HUD handlers need. */
export type TheaterHudWire = {
  clock: MissionClock;
  director: CameraDirector;
  autoCam: TheaterAutoCam;
  cache: Trajectory;
  /** Drop out of guided cameras (also updates the HUD toggle). */
  disableAutoCam: () => void;
  toggleOrbits: () => boolean;
  setOrbitsVisible: (visible: boolean) => void;
};

function onSpeedNudge(w: TheaterHudWire, dir: Parameters<HudHandlers["onSpeedNudge"]>[0]): number {
  const next = nudgePlaybackSpeed(w.clock.speed, dir);
  w.clock.setSpeed(next);
  return next;
}

function transportHandlers(w: TheaterHudWire): Pick<
  HudHandlers,
  "onPlayToggle" | "onSpeedMode" | "onSpeedNudge" | "onScrub"
> {
  return {
    onPlayToggle: () => w.clock.toggle(),
    onSpeedMode: (rate) => w.clock.setSpeed(rate),
    onSpeedNudge: (dir) => onSpeedNudge(w, dir),
    onScrub: (t) => w.clock.seek(t),
  };
}

function onCamera(w: TheaterHudWire, mode: CameraMode): void {
  w.disableAutoCam();
  w.director.setMode(mode);
}

function onCameraFrame(w: TheaterHudWire, mode: CameraMode): void {
  w.disableAutoCam();
  w.director.frameMode(mode);
}

function onCameraHold(
  w: TheaterHudWire,
  down: boolean,
  run: () => CameraMode,
): CameraMode {
  const mode = run();
  if (down) w.disableAutoCam();
  return mode;
}

function cameraHandlers(w: TheaterHudWire): Pick<
  HudHandlers,
  "onCamera" | "onCameraFrame" | "onOrbitKey" | "onPanKey" | "onZoomKey"
> {
  return {
    onCamera: (mode) => onCamera(w, mode),
    onCameraFrame: (mode) => onCameraFrame(w, mode),
    onOrbitKey: (key, down) =>
      onCameraHold(w, down, () => w.director.setOrbitKey(key, down)),
    onPanKey: (key, down) =>
      onCameraHold(w, down, () => w.director.setPanKey(key, down)),
    onZoomKey: (key, down) =>
      onCameraHold(w, down, () => w.director.setZoomKey(key, down)),
  };
}

/** Seek to the bookmark and ease the camera, keeping auto-cam state in step. */
function onBookmark(w: TheaterHudWire, bm: CinematicBookmark): void {
  w.clock.seek(bm.u);
  const frame = sampleAtProgress(w.cache, bm.u);
  w.autoCam.phase = frame.phase;
  w.autoCam.staged = frame.staged;
  w.director.easeToMode(bm.mode, { frame: bm.frame, frameScale: bm.frameScale });
}

function onAutoCamToggle(w: TheaterHudWire): boolean {
  w.autoCam.enabled = !w.autoCam.enabled;
  if (w.autoCam.enabled) {
    w.autoCam.phase = null;
    w.autoCam.shotKey = null;
  }
  return w.autoCam.enabled;
}

/** L / O: name plates and trajectory overlays share one chrome flag. */
function toggleSceneChrome(w: TheaterHudWire): boolean {
  const on = !getZoomLabelsVisible();
  setZoomLabelsVisible(on);
  w.setOrbitsVisible(on);
  return on;
}

function toggleHandlers(w: TheaterHudWire): Pick<
  HudHandlers,
  "onToggleLabels" | "onToggleOrbits" | "onAutoCamToggle" | "onBookmark"
> {
  return {
    onToggleLabels: () => toggleSceneChrome(w),
    onToggleOrbits: () => toggleSceneChrome(w),
    onAutoCamToggle: () => onAutoCamToggle(w),
    onBookmark: (bm) => onBookmark(w, bm),
  };
}

export function makeTheaterHudHandlers(w: TheaterHudWire): HudHandlers {
  return { ...transportHandlers(w), ...cameraHandlers(w), ...toggleHandlers(w) };
}

/** The slice of a mission context the landing beat writes to. */
export type LandingBeatTarget = {
  clock: MissionClock;
  director: CameraDirector;
  autoCam: TheaterAutoCam;
  notifyAutoCamera: (mode: CameraMode) => void;
};

/**
 * Apply the effects a landing-beat transition asked for.
 * Order matters: pin playback before framing so the settle eases at 1×.
 */
export function applyLandingBeatEffects(
  effects: LandingBeatEffects,
  target: LandingBeatTarget,
): void {
  if (effects.pinSpeed1x) target.clock.setSpeed(1);
  if (effects.autoCamPhase) {
    target.autoCam.phase = effects.autoCamPhase.phase;
    target.autoCam.staged = effects.autoCamPhase.staged;
  }
  if (effects.settleCamera == null) return;
  target.director.easeToMode(effects.settleCamera, { frame: true });
  target.notifyAutoCamera(effects.settleCamera);
}

/** Feed canvas pointer moves to the hover-driven vector arrows. */
export function wireCanvasPointer(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  vectorArrows: ReturnType<typeof createVectorArrows>,
): void {
  canvas.addEventListener("pointermove", (e) => {
    vectorArrows.setPointer(e, camera, canvas);
  });
  canvas.addEventListener("pointerleave", () => {
    vectorArrows.setPointer(null, camera, canvas);
  });
}

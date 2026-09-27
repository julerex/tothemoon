/**
 * Keyboard: transport, bookmarks, camera holds, panels, scene toggles.
 */

import { bookmarkForDigit, cycleBookmark } from "../mission/bookmarks";
import { cycleCamera, noteCameraMode, toggleAutoCam, toggleLabels, toggleOrbits } from "./hudCameraCtl";
import {
  anyPanelOpen,
  cycleTheaterViews,
  handleEscapePanels,
  playbackOverlayOpen,
  setHudVisible,
  setKeymapOpen,
  setMetricsOpen,
} from "./hudPanels";
import { jumpToBookmark } from "./hudTransport";
import type { HudRuntime } from "./hudTypes";

function preventAnd(e: KeyboardEvent, action: () => void): true {
  e.preventDefault();
  action();
  return true;
}

function isFormTypingTarget(t: EventTarget | null): boolean {
  if (t instanceof HTMLInputElement && t.type !== "range") return true;
  if (t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLTextAreaElement) return true;
  return false;
}

function handlePanelToggleKey(rt: HudRuntime, e: KeyboardEvent): boolean {
  if (e.key === "k" || e.key === "K") {
    return preventAnd(e, () => setKeymapOpen(rt, !rt.flags.keymapOpen));
  }
  if (e.key === "m" || e.key === "M") {
    return preventAnd(e, () => setMetricsOpen(rt, !rt.flags.metricsOpen));
  }
  return false;
}

function handleUiKey(rt: HudRuntime, e: KeyboardEvent): boolean {
  if (e.key === "Tab") return preventAnd(e, () => cycleTheaterViews(rt));
  if (e.key === "h" || e.key === "H") {
    return preventAnd(e, () => setHudVisible(rt, !rt.flags.hudVisible));
  }
  if (handlePanelToggleKey(rt, e)) return true;
  if (e.key === "Escape" && anyPanelOpen(rt)) {
    return preventAnd(e, () => handleEscapePanels(rt));
  }
  return false;
}

function handleDigitBookmark(rt: HudRuntime, e: KeyboardEvent): boolean {
  if (!e.code.startsWith("Digit")) return false;
  const digit = Number(e.code.slice("Digit".length));
  const bm = bookmarkForDigit(rt.data.bookmarks, digit);
  if (bm) {
    e.preventDefault();
    jumpToBookmark(rt, bm);
  }
  return true;
}

function stepBookmark(rt: HudRuntime, dir: -1 | 1): void {
  const next = cycleBookmark(rt.data.bookmarks, rt.flags.lastBookmarkIndex, dir);
  if (!next) return;
  jumpToBookmark(rt, next.bookmark);
}

/** Space and P both toggle playback. */
export function isPlayPauseCode(code: string): boolean {
  return code === "Space" || code === "KeyP";
}

/** `-` steps slower; the equals key steps faster and is drawn as `+`. */
export function speedNudgeDir(code: string): -1 | 1 | null {
  if (code === "Minus") return -1;
  if (code === "Equal") return 1;
  return null;
}

/** `,` previous bookmark; `.` next bookmark. */
export function bookmarkStepDir(code: string): -1 | 1 | null {
  if (code === "Comma") return -1;
  if (code === "Period") return 1;
  return null;
}

function handleTransportKey(rt: HudRuntime, e: KeyboardEvent): boolean {
  if (isPlayPauseCode(e.code)) {
    if (playbackOverlayOpen(rt)) {
      return preventAnd(e, () => rt.data.handlers.setPlaying?.(false));
    }
    return preventAnd(e, () => rt.data.handlers.onPlayToggle());
  }
  if (e.code === "BracketLeft") {
    return preventAnd(e, () => cycleCamera(rt, -1));
  }
  if (e.code === "BracketRight") {
    return preventAnd(e, () => cycleCamera(rt, 1));
  }
  const speedDir = speedNudgeDir(e.code);
  if (speedDir) return preventAnd(e, () => nudgeSpeed(rt, speedDir));
  const bookmarkDir = bookmarkStepDir(e.code);
  if (bookmarkDir) return preventAnd(e, () => stepBookmark(rt, bookmarkDir));
  return handleDigitBookmark(rt, e);
}

function isOrbitKey(k: string): k is "q" | "e" | "r" | "f" | "c" | "v" {
  return k === "q" || k === "e" || k === "r" || k === "f" || k === "c" || k === "v";
}

function handleOrbitHold(rt: HudRuntime, e: KeyboardEvent, k: string): boolean {
  if (!isOrbitKey(k)) return false;
  if (k === "c" || k === "v") e.preventDefault();
  rt.data.handlers.onOrbitKey(k, true);
  return true;
}

function isPanKey(k: string): k is "w" | "a" | "s" | "d" | "t" | "b" {
  return k === "w" || k === "a" || k === "s" || k === "d" || k === "t" ||
    k === "b";
}

function handlePanZoomHold(rt: HudRuntime, k: string): boolean {
  if (isPanKey(k)) {
    noteCameraMode(rt, rt.data.handlers.onPanKey(k, true));
    return true;
  }
  if (k === "z" || k === "x") {
    rt.data.handlers.onZoomKey(k, true);
    return true;
  }
  return false;
}

function handleHoldKeyDown(rt: HudRuntime, e: KeyboardEvent): boolean {
  const k = e.key.toLowerCase();
  return handleOrbitHold(rt, e, k) || handlePanZoomHold(rt, k);
}

function nudgeSpeed(rt: HudRuntime, dir: -1 | 1): void {
  rt.dom.speed.value = String(rt.data.handlers.onSpeedNudge(dir));
}

function handleLabelOrbitKey(rt: HudRuntime, e: KeyboardEvent): boolean {
  if (e.key === "l" || e.key === "L") {
    return preventAnd(e, () => toggleLabels(rt));
  }
  if (e.key === "o" || e.key === "O") {
    return preventAnd(e, () => toggleOrbits(rt));
  }
  return false;
}

function handleToggleSceneKey(rt: HudRuntime, e: KeyboardEvent): boolean {
  if (handleLabelOrbitKey(rt, e)) return true;
  if (e.code === "Backslash") return preventAnd(e, () => toggleAutoCam(rt));
  return false;
}

function onKeyDown(rt: HudRuntime, e: KeyboardEvent): void {
  if (e.repeat || isFormTypingTarget(e.target)) return;
  if (handleUiKey(rt, e)) return;
  if (handleTransportKey(rt, e)) return;
  if (handleHoldKeyDown(rt, e)) return;
  handleToggleSceneKey(rt, e);
}

function onKeyUp(rt: HudRuntime, e: KeyboardEvent): void {
  const k = e.key.toLowerCase();
  const h = rt.data.handlers;
  if (k === "q" || k === "e" || k === "r" || k === "f" || k === "c" || k === "v") {
    h.onOrbitKey(k, false);
  } else if (isPanKey(k)) {
    h.onPanKey(k, false);
  } else if (k === "z" || k === "x") {
    h.onZoomKey(k, false);
  }
}

function releaseAllHolds(rt: HudRuntime): void {
  const h = rt.data.handlers;
  for (const k of ["q", "e", "r", "f", "c", "v"] as const) h.onOrbitKey(k, false);
  for (const k of ["w", "a", "s", "d", "t", "b"] as const) h.onPanKey(k, false);
  for (const k of ["z", "x"] as const) h.onZoomKey(k, false);
}

export function wireKeyboard(rt: HudRuntime): void {
  window.addEventListener("keydown", (e) => onKeyDown(rt, e));
  window.addEventListener("keyup", (e) => onKeyUp(rt, e));
  window.addEventListener("blur", () => releaseAllHolds(rt));
}

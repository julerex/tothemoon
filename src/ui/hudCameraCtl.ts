/**
 * Camera menus and scene chrome (auto-cam / labels / orbits).
 */

import { FIXED_CAMERAS, FREE_LOOK_CAMERAS } from "../camera/cameraMode";
import type { CameraMode } from "../camera/modes";
import { applyAutoCamChrome, applyPressed } from "./hudApply";
import { flashCameraViewName } from "./hudCameraFlash";
import {
  CAM_LOCK_NOTE_MS,
  CAMERA_LABELS,
  cameraModeFromSelect,
  cameraOptions,
  cameraSelectState,
  cycleCameraMode,
  FIXED_CAM_LOCK_NOTE,
} from "./hudCameraLabels";
import type { CameraFamily } from "./hudCameraLabels";
import type { HudRuntime } from "./hudTypes";

let camLockHideTimer = 0;

/** Flash the lock note when the user tries to move a mounted camera. */
export function showCamLockNote(rt: HudRuntime): void {
  const el = rt.dom.camLockNoteEl;
  if (!el) return;
  el.hidden = false;
  el.textContent = FIXED_CAM_LOCK_NOTE;
  window.clearTimeout(camLockHideTimer);
  camLockHideTimer = window.setTimeout(() => {
    el.hidden = true;
  }, CAM_LOCK_NOTE_MS);
}

/** Write the active mode into the two selects. Assigning `.value` does not fire `change`. */
export function syncCameraSelects(
  free: HTMLSelectElement | null,
  mounted: HTMLSelectElement | null,
  mode: CameraMode,
): void {
  const state = cameraSelectState(mode);
  if (free) free.value = state.free;
  if (mounted) mounted.value = state.mounted;
}

export function rememberCameraMode(rt: HudRuntime, mode: CameraMode): void {
  const switched = mode !== rt.flags.lastCamMode;
  rt.flags.lastCamMode = mode;
  syncCameraSelects(rt.dom.camSelectFree, rt.dom.camSelectMounted, mode);
  if (!switched) return;
  flashCameraViewName(
    rt.dom.camModeEl,
    rt.dom.camIdentEl,
    CAMERA_LABELS[mode].title,
  );
}

export function noteCameraMode(rt: HudRuntime, mode: CameraMode): void {
  if (mode === rt.flags.lastCamMode) return;
  rememberCameraMode(rt, mode);
}

export function switchCamera(rt: HudRuntime, mode: CameraMode): void {
  rt.data.handlers.onCamera(mode);
  rememberCameraMode(rt, mode);
}

/** Auto-cam cut: update the menus and flash the camera name. */
export function notifyAutoCamera(rt: HudRuntime, mode: CameraMode): void {
  rememberCameraMode(rt, mode);
}

export function cycleCamera(rt: HudRuntime, dir: -1 | 1 = 1): void {
  switchCamera(rt, cycleCameraMode(rt.flags.lastCamMode, dir));
}

function syncBroadcastMode(rt: HudRuntime): void {
  rt.dom.hudRoot?.classList.toggle("broadcast-mode", rt.flags.autoCamEnabled);
}

export function setAutoCamEnabled(rt: HudRuntime, enabled: boolean): void {
  if (rt.flags.autoCamEnabled === enabled) {
    syncBroadcastMode(rt);
    return;
  }
  rt.flags.autoCamEnabled = enabled;
  applyAutoCamChrome(rt.dom.btnAutoCam, rt.dom.autoCamEl, enabled);
  syncBroadcastMode(rt);
}

export function setLabelsEnabled(rt: HudRuntime, enabled: boolean): void {
  rt.flags.labelsEnabled = enabled;
  applyPressed(rt.dom.btnLabels, enabled, "Labels");
}

export function setOrbitsEnabled(rt: HudRuntime, enabled: boolean): void {
  rt.flags.orbitsEnabled = enabled;
  applyPressed(rt.dom.btnOrbits, enabled, "Orbits");
}

export function toggleAutoCam(rt: HudRuntime): void {
  if (!rt.data.handlers.onAutoCamToggle) return;
  const on = rt.data.handlers.onAutoCamToggle();
  setAutoCamEnabled(rt, on);
}

export function toggleLabels(rt: HudRuntime): void {
  const on = rt.data.handlers.onToggleLabels?.();
  if (typeof on === "boolean") setLabelsEnabled(rt, on);
}

export function toggleOrbits(rt: HudRuntime): void {
  const on = rt.data.handlers.onToggleOrbits?.();
  if (typeof on === "boolean") setOrbitsEnabled(rt, on);
}

export function wireAutoCamButton(rt: HudRuntime): void {
  syncBroadcastMode(rt);
  if (!rt.dom.btnAutoCam) return;
  rt.dom.btnAutoCam.addEventListener("click", () => toggleAutoCam(rt));
  applyAutoCamChrome(rt.dom.btnAutoCam, rt.dom.autoCamEl, true);
}

export function wireSceneToggleButtons(rt: HudRuntime): void {
  rt.dom.btnLabels?.addEventListener("click", () => toggleLabels(rt));
  rt.dom.btnOrbits?.addEventListener("click", () => toggleOrbits(rt));
  applyPressed(rt.dom.btnLabels, rt.flags.labelsEnabled, "Labels");
  applyPressed(rt.dom.btnOrbits, rt.flags.orbitsEnabled, "Orbits");
}

function fillCameraSelect(
  select: HTMLSelectElement,
  family: CameraFamily,
  modes: readonly CameraMode[],
): void {
  select.replaceChildren();
  for (const option of cameraOptions(modes, "—")) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    node.disabled = option.disabled;
    const mode = cameraModeFromSelect(option.value, family);
    if (mode) node.title = CAMERA_LABELS[mode].detail;
    select.append(node);
  }
}

function bindCameraSelect(
  rt: HudRuntime,
  select: HTMLSelectElement,
  family: CameraFamily,
): void {
  select.addEventListener("change", () => {
    const mode = cameraModeFromSelect(select.value, family);
    if (mode) switchCamera(rt, mode);
  });
}

/** Fill both selects once and sync them to the current mode. */
export function wireCameraMenus(rt: HudRuntime): void {
  const free = rt.dom.camSelectFree;
  const mounted = rt.dom.camSelectMounted;
  if (free) {
    fillCameraSelect(free, "free", FREE_LOOK_CAMERAS);
    bindCameraSelect(rt, free, "free");
  }
  if (mounted) {
    fillCameraSelect(mounted, "mounted", FIXED_CAMERAS);
    bindCameraSelect(rt, mounted, "mounted");
  }
  syncCameraSelects(free, mounted, rt.flags.lastCamMode);
}

/** Auto-cam, labels/orbits, and camera menus. */
export function wireCameraChrome(rt: HudRuntime): void {
  wireAutoCamButton(rt);
  wireSceneToggleButtons(rt);
  wireCameraMenus(rt);
}

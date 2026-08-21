/**
 * Camera rail, double-tap frame, and scene chrome (auto-cam / labels / orbits).
 */

import type { CameraMode } from "../camera/modes";
import {
  applyAutoCamChrome,
  applyCameraGridPressed,
  applyPressed,
} from "./hudApply";
import { CAM_DOUBLE_TAP_MS, cycleCameraMode } from "./hudCameraLabels";
import type { HudRuntime } from "./hudTypes";

export function rememberCameraMode(rt: HudRuntime, mode: CameraMode): void {
  rt.flags.lastCamMode = mode;
  applyCameraGridPressed(rt.dom.camGridEl, mode);
}

export function noteCameraMode(rt: HudRuntime, mode: CameraMode): void {
  if (mode === rt.flags.lastCamMode) return;
  rememberCameraMode(rt, mode);
}

export function switchCamera(rt: HudRuntime, mode: CameraMode): void {
  rt.data.handlers.onCamera(mode);
  rememberCameraMode(rt, mode);
}

export function frameCamera(rt: HudRuntime, mode: CameraMode): void {
  if (rt.data.handlers.onCameraFrame) rt.data.handlers.onCameraFrame(mode);
  else rt.data.handlers.onCamera(mode);
  rememberCameraMode(rt, mode);
}

/** Auto-cam cut: update the rail highlight; no popup. */
export function notifyAutoCamera(rt: HudRuntime, mode: CameraMode): void {
  rememberCameraMode(rt, mode);
}

export function cycleCamera(rt: HudRuntime, dir: -1 | 1 = 1): void {
  switchCamera(rt, cycleCameraMode(rt.flags.lastCamMode, dir));
}

/** Single tap: switch focus. Double-tap same key: frame object. */
export function handleCameraKey(rt: HudRuntime, mode: CameraMode, key: string): void {
  const now = performance.now();
  const isDouble =
    rt.flags.lastCamKey === key && now - rt.flags.lastCamKeyT <= CAM_DOUBLE_TAP_MS;
  rt.flags.lastCamKey = key;
  rt.flags.lastCamKeyT = now;
  if (isDouble) frameCamera(rt, mode);
  else switchCamera(rt, mode);
}

export function setAutoCamEnabled(rt: HudRuntime, enabled: boolean): void {
  if (rt.flags.autoCamEnabled === enabled) return;
  rt.flags.autoCamEnabled = enabled;
  applyAutoCamChrome(rt.dom.btnAutoCam, rt.dom.autoCamEl, enabled);
}

export function setLabelsEnabled(rt: HudRuntime, enabled: boolean): void {
  rt.flags.labelsEnabled = enabled;
  applyPressed(rt.dom.btnLabels, enabled);
}

export function setOrbitsEnabled(rt: HudRuntime, enabled: boolean): void {
  rt.flags.orbitsEnabled = enabled;
  applyPressed(rt.dom.btnOrbits, enabled);
}

export function toggleAutoCam(rt: HudRuntime): void {
  if (!rt.data.handlers.onAutoCamToggle) return;
  const on = rt.data.handlers.onAutoCamToggle();
  setAutoCamEnabled(rt, on);
}

function setChromeEnabled(rt: HudRuntime, enabled: boolean): void {
  setLabelsEnabled(rt, enabled);
  setOrbitsEnabled(rt, enabled);
}

export function toggleLabels(rt: HudRuntime): void {
  const on = rt.data.handlers.onToggleLabels?.();
  if (typeof on === "boolean") setChromeEnabled(rt, on);
}

export function toggleOrbits(rt: HudRuntime): void {
  const on = rt.data.handlers.onToggleOrbits?.();
  if (typeof on === "boolean") setChromeEnabled(rt, on);
}

export function wireAutoCamButton(rt: HudRuntime): void {
  if (!rt.dom.btnAutoCam) return;
  rt.dom.btnAutoCam.addEventListener("click", () => toggleAutoCam(rt));
  applyAutoCamChrome(rt.dom.btnAutoCam, rt.dom.autoCamEl, true);
}

export function wireSceneToggleButtons(rt: HudRuntime): void {
  rt.dom.btnLabels?.addEventListener("click", () => toggleLabels(rt));
  rt.dom.btnOrbits?.addEventListener("click", () => toggleOrbits(rt));
  applyPressed(rt.dom.btnLabels, rt.flags.labelsEnabled);
  applyPressed(rt.dom.btnOrbits, rt.flags.orbitsEnabled);
}

function onCamGridClick(rt: HudRuntime, btn: HTMLButtonElement): void {
  const mode = btn.dataset.cam as CameraMode | undefined;
  if (!mode) return;
  handleCameraKey(rt, mode, `cam:${mode}`);
}

export function wireCameraRail(rt: HudRuntime): void {
  rt.dom.camGridEl?.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-cam]");
    if (btn) onCamGridClick(rt, btn);
  });
  applyCameraGridPressed(rt.dom.camGridEl, rt.flags.lastCamMode);
}

/** Auto-cam, labels/orbits, and camera rail. */
export function wireCameraChrome(rt: HudRuntime): void {
  wireAutoCamButton(rt);
  wireSceneToggleButtons(rt);
  wireCameraRail(rt);
}

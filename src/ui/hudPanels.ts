/**
 * Exclusive HUD panels: keymap, metrics, cross-section, Earth GC, polar map.
 */

import {
  drawCrossSection,
  liveCrossSection,
} from "./crossSection";
import {
  isEarthGcOverlayOpen,
  setEarthGcOverlayOpen,
} from "./earthGcOverlay";
import { applyPressed } from "./hudApply";
import type { HudRuntime } from "./hudTypes";
import {
  isPolarOverlayOpen,
  setPolarOverlayOpen,
} from "./polarOverlay";
import { drawVisualKeymap } from "./visualKeymap";

export function setHudVisible(rt: HudRuntime, visible: boolean): void {
  rt.flags.hudVisible = visible;
  if (!rt.dom.hudRoot) return;
  rt.dom.hudRoot.classList.toggle("hud-hidden", !visible);
  rt.dom.hudRoot.setAttribute("aria-hidden", visible ? "false" : "true");
}

function closeOtherPanels(rt: HudRuntime, keep: string): void {
  if (keep !== "keymap") setKeymapOpen(rt, false);
  if (keep !== "metrics") setMetricsOpen(rt, false);
  if (keep !== "cross") setCrossSectionOpen(rt, false);
  if (keep !== "earthGc") setEarthGcOpen(rt, false);
  if (keep !== "polar") setPolarMapOpen(rt, false);
}

export function setKeymapOpen(rt: HudRuntime, open: boolean): void {
  rt.flags.keymapOpen = open;
  if (rt.dom.keymapEl) rt.dom.keymapEl.hidden = !open;
  rt.dom.btnKeymap?.setAttribute("aria-pressed", open ? "true" : "false");
  rt.dom.hudRoot?.classList.toggle("keymap-open", open);
  if (open) {
    closeOtherPanels(rt, "keymap");
    requestAnimationFrame(() => redrawKeymap(rt));
  }
}

export function setMetricsOpen(rt: HudRuntime, open: boolean): void {
  rt.flags.metricsOpen = open;
  if (rt.dom.metricsEl) rt.dom.metricsEl.hidden = !open;
  applyPressed(rt.dom.btnMetrics, open);
  if (open) closeOtherPanels(rt, "metrics");
}

export function setCrossSectionOpen(rt: HudRuntime, open: boolean): void {
  rt.flags.crossSectionOpen = open;
  if (rt.dom.crossSectionEl) rt.dom.crossSectionEl.hidden = !open;
  rt.dom.btnCrossSection?.setAttribute("aria-pressed", open ? "true" : "false");
  rt.dom.hudRoot?.classList.toggle("cross-section-open", open);
  if (open) closeOtherPanels(rt, "cross");
}

export function setEarthGcOpen(rt: HudRuntime, open: boolean): void {
  setEarthGcOverlayOpen(open);
  rt.dom.btnEarthGc?.setAttribute("aria-pressed", open ? "true" : "false");
  rt.dom.hudRoot?.classList.toggle("earth-gc-open", open);
  if (open) closeOtherPanels(rt, "earthGc");
}

export function setPolarMapOpen(rt: HudRuntime, open: boolean): void {
  setPolarOverlayOpen(open);
  rt.dom.btnPolarMap?.setAttribute("aria-pressed", open ? "true" : "false");
  rt.dom.hudRoot?.classList.toggle("polar-map-open", open);
  if (open) closeOtherPanels(rt, "polar");
}

/**
 * Tab theater cycle: main → ascent CS → Earth GC → Polar → KeyMap → main.
 * Metrics stays on M only (not in the cycle).
 */
export function cycleTheaterViews(rt: HudRuntime): void {
  const earthGc = isEarthGcOverlayOpen();
  const polar = isPolarOverlayOpen();
  if (!rt.flags.crossSectionOpen && !earthGc && !polar && !rt.flags.keymapOpen) {
    setCrossSectionOpen(rt, true);
    return;
  }
  advanceTheaterCycle(rt, earthGc, polar);
}

function cycleFromCrossSection(rt: HudRuntime): void {
  setCrossSectionOpen(rt, false);
  setEarthGcOpen(rt, true);
}

function cycleFromEarthGc(rt: HudRuntime): void {
  setEarthGcOpen(rt, false);
  setPolarMapOpen(rt, true);
}

function cycleFromPolar(rt: HudRuntime): void {
  setPolarMapOpen(rt, false);
  setKeymapOpen(rt, true);
}

function advanceTheaterCycle(
  rt: HudRuntime,
  earthGc: boolean,
  polar: boolean,
): void {
  if (rt.flags.crossSectionOpen) cycleFromCrossSection(rt);
  else if (earthGc) cycleFromEarthGc(rt);
  else if (polar) cycleFromPolar(rt);
  else setKeymapOpen(rt, false);
}

export function redrawKeymap(rt: HudRuntime): void {
  const { keymapCtx, keymapCanvas } = rt.dom;
  if (!rt.flags.keymapOpen || !keymapCtx || !keymapCanvas) return;
  const rect = keymapCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  drawVisualKeymap(keymapCtx, Math.max(rect.width, 320), Math.max(rect.height, 200), dpr);
}

function canDrawCrossSection(rt: HudRuntime): boolean {
  const { crossSectionCtx, crossSectionCanvas } = rt.dom;
  return (
    rt.flags.crossSectionOpen &&
    !!crossSectionCtx &&
    !!crossSectionCanvas &&
    !!rt.data.crossModel
  );
}

function liveFromRuntime(rt: HudRuntime, missionT: number) {
  const d = rt.data;
  return liveCrossSection(
    d.crossModel!,
    d.samples,
    d.stageState,
    missionT,
    d.boosterKeyframes,
    d.recoveryProfile,
    d.epoch,
  );
}

function paintCrossSection(rt: HudRuntime, missionT: number): void {
  const ctx = rt.dom.crossSectionCtx!;
  const canvas = rt.dom.crossSectionCanvas!;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(rect.width, 320);
  const cssH = Math.max(rect.height, 200);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const live = liveFromRuntime(rt, missionT);
  drawCrossSection(ctx, rt.data.crossModel!, live, missionT, cssW, cssH, dpr);
}

export function redrawCrossSection(rt: HudRuntime, missionT: number): void {
  if (!canDrawCrossSection(rt)) return;
  paintCrossSection(rt, missionT);
}

export function anyPanelOpen(rt: HudRuntime): boolean {
  return (
    rt.flags.keymapOpen ||
    rt.flags.metricsOpen ||
    rt.flags.crossSectionOpen ||
    isEarthGcOverlayOpen() ||
    isPolarOverlayOpen()
  );
}

export function handleEscapePanels(rt: HudRuntime): void {
  if (rt.flags.crossSectionOpen) setCrossSectionOpen(rt, false);
  else if (isEarthGcOverlayOpen()) setEarthGcOpen(rt, false);
  else if (isPolarOverlayOpen()) setPolarMapOpen(rt, false);
  else if (rt.flags.metricsOpen) setMetricsOpen(rt, false);
  else setKeymapOpen(rt, false);
}

export function wirePanelOpenButtons(rt: HudRuntime): void {
  rt.dom.btnMetrics?.addEventListener("click", () =>
    setMetricsOpen(rt, !rt.flags.metricsOpen),
  );
  rt.dom.btnCrossSection?.addEventListener("click", () =>
    setCrossSectionOpen(rt, !rt.flags.crossSectionOpen),
  );
  rt.dom.btnKeymap?.addEventListener("click", () =>
    setKeymapOpen(rt, !rt.flags.keymapOpen),
  );
}

function wireBackdropClose(el: HTMLElement | null, close: () => void): void {
  el?.addEventListener("click", (ev) => {
    if (ev.target === el) close();
  });
}

function wirePanelCloses(rt: HudRuntime): void {
  const { dom } = rt;
  dom.keymapClose?.addEventListener("click", () => setKeymapOpen(rt, false));
  wireBackdropClose(dom.keymapEl, () => setKeymapOpen(rt, false));
  dom.metricsClose?.addEventListener("click", () => setMetricsOpen(rt, false));
  wireBackdropClose(dom.metricsEl, () => setMetricsOpen(rt, false));
  dom.crossSectionClose?.addEventListener("click", () =>
    setCrossSectionOpen(rt, false),
  );
  wireBackdropClose(dom.crossSectionEl, () => setCrossSectionOpen(rt, false));
}

function wireMapToggles(rt: HudRuntime): void {
  rt.dom.btnEarthGc?.addEventListener("click", () =>
    setEarthGcOpen(rt, !isEarthGcOverlayOpen()),
  );
  rt.dom.btnPolarMap?.addEventListener("click", () =>
    setPolarMapOpen(rt, !isPolarOverlayOpen()),
  );
}

export function wireOverlayCloses(rt: HudRuntime): void {
  wirePanelCloses(rt);
  wireMapToggles(rt);
}

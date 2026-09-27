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
import { keymapDigitAction } from "../mission/bookmarks";
import { drawVisualKeymap } from "./visualKeymap";
import { rowsWithDigitActions } from "./visualKeymapLayout";

export function setHudVisible(rt: HudRuntime, visible: boolean): void {
  rt.flags.hudVisible = visible;
  if (!rt.dom.hudRoot) return;
  rt.dom.hudRoot.classList.toggle("hud-hidden", !visible);
  rt.dom.hudRoot.setAttribute("aria-hidden", visible ? "false" : "true");
}

function closeOtherPanels(rt: HudRuntime, keep: string): void {
  if (keep !== "keymap") setKeymapOpen(rt, false);
  if (keep !== "help") setHelpOpen(rt, false);
  if (keep !== "metrics") setMetricsOpen(rt, false);
  if (keep !== "cross") setCrossSectionOpen(rt, false);
  if (keep !== "earthGc") setEarthGcOpen(rt, false);
  if (keep !== "polar") setPolarMapOpen(rt, false);
}

/** Menu, KeyMap, or Help is up, so the mission clock stays paused. */
export function playbackOverlayOpen(rt: HudRuntime): boolean {
  return rt.flags.metricsOpen || rt.flags.keymapOpen || rt.flags.helpOpen;
}

export function setHelpOpen(rt: HudRuntime, open: boolean): void {
  const wasHolding = playbackOverlayOpen(rt);
  rt.flags.helpOpen = open;
  if (rt.dom.helpEl) rt.dom.helpEl.hidden = !open;
  rt.dom.hudRoot?.classList.toggle("help-open", open);
  if (open) closeOtherPanels(rt, "help");
  syncOverlayPlayback(rt, wasHolding);
}

export function setKeymapOpen(rt: HudRuntime, open: boolean): void {
  const wasHolding = playbackOverlayOpen(rt);
  rt.flags.keymapOpen = open;
  if (rt.dom.keymapEl) rt.dom.keymapEl.hidden = !open;
  rt.dom.btnKeymap?.setAttribute("aria-pressed", open ? "true" : "false");
  rt.dom.hudRoot?.classList.toggle("keymap-open", open);
  if (open) {
    closeOtherPanels(rt, "keymap");
    requestAnimationFrame(() => redrawKeymap(rt));
  }
  syncOverlayPlayback(rt, wasHolding);
}

/**
 * Opening the Menu, KeyMap, or Help pauses. Closing the last of them resumes only
 * when the theater was playing. `playing: null` leaves the clock alone.
 */
export function nextOverlayPlayback(
  holding: boolean,
  wasPlaying: boolean,
  resumeOnClose: boolean,
): { resumeOnClose: boolean; playing: boolean | null } {
  if (holding) return { resumeOnClose: wasPlaying, playing: false };
  return { resumeOnClose: false, playing: resumeOnClose ? true : null };
}

function syncOverlayPlayback(rt: HudRuntime, wasHolding: boolean): void {
  const holding = playbackOverlayOpen(rt);
  if (holding === wasHolding) return;
  const next = nextOverlayPlayback(holding, rt.flags.lastPlaying, rt.flags.overlayResumePlay);
  rt.flags.overlayResumePlay = next.resumeOnClose;
  if (next.playing != null) rt.data.handlers.setPlaying?.(next.playing);
}

export function setMetricsOpen(rt: HudRuntime, open: boolean): void {
  const wasHolding = playbackOverlayOpen(rt);
  rt.flags.metricsOpen = open;
  if (rt.dom.metricsEl) rt.dom.metricsEl.hidden = !open;
  applyPressed(rt.dom.btnMetrics, open);
  rt.dom.hudRoot?.classList.toggle("menu-open", open);
  if (open) closeOtherPanels(rt, "metrics");
  syncOverlayPlayback(rt, wasHolding);
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

/** Tab dashboards. The KeyMap is not one of them. */
export type TheaterDashboard = "main" | "cross" | "earthGc" | "polar";

/**
 * Tab cycle: main → ascent cross-section → Earth GC → Polar → main.
 * Menu (M) and KeyMap (K) stay off this cycle.
 */
export function nextTheaterDashboard(current: TheaterDashboard): TheaterDashboard {
  if (current === "main") return "cross";
  if (current === "cross") return "earthGc";
  if (current === "earthGc") return "polar";
  return "main";
}

function currentDashboard(rt: HudRuntime): TheaterDashboard {
  if (rt.flags.crossSectionOpen) return "cross";
  if (isEarthGcOverlayOpen()) return "earthGc";
  if (isPolarOverlayOpen()) return "polar";
  return "main";
}

function showDashboard(rt: HudRuntime, id: TheaterDashboard): void {
  if (id === "cross") setCrossSectionOpen(rt, true);
  else if (id === "earthGc") setEarthGcOpen(rt, true);
  else if (id === "polar") setPolarMapOpen(rt, true);
  else {
    setCrossSectionOpen(rt, false);
    setEarthGcOpen(rt, false);
    setPolarMapOpen(rt, false);
  }
}

export function cycleTheaterViews(rt: HudRuntime): void {
  showDashboard(rt, nextTheaterDashboard(currentDashboard(rt)));
}

export function redrawKeymap(rt: HudRuntime): void {
  const { keymapCtx, keymapCanvas } = rt.dom;
  if (!rt.flags.keymapOpen || !keymapCtx || !keymapCanvas) return;
  const rect = keymapCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rows = rowsWithDigitActions((digit) => keymapDigitAction(rt.data.bookmarks, digit));
  drawVisualKeymap(keymapCtx, Math.max(rect.width, 320), Math.max(rect.height, 200), dpr, rows);
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
    rt.flags.helpOpen ||
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
  else if (rt.flags.helpOpen) setHelpOpen(rt, false);
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
  dom.helpClose?.addEventListener("click", () => setHelpOpen(rt, false));
  wireBackdropClose(dom.helpEl, () => setHelpOpen(rt, false));
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

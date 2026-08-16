/**
 * Mission theater HUD: transport, telemetry strip, overlays, keyboard.
 * Orchestrates short helpers; DOM queries live in {@link ./hudDom}.
 */

import type { MissionClock } from "../mission/clock";
import type { CameraMode } from "../camera/modes";
import {
  bookmarkForDigit,
  buildBookmarks,
  type CinematicBookmark,
} from "../mission/bookmarks";
import { buildScrubEventTicks } from "../mission/scrubEvents";
import {
  buildNewsBeats,
  formatTickerCrawl,
  newsAtMissionTime,
  newsTickerPeriodS,
} from "../mission/newsTicker";
import type { MissionEvent, MissionTimeline } from "../mission/timeline";
import type { PhaseId } from "../physics/mission";
import type { ReadonlySample } from "../physics/missionTypes";
import {
  buildBoosterKeyframes,
  type RecoveryProfile,
  type StageState,
} from "../physics/boosterRecovery";
import {
  buildCrossSectionModel,
  drawCrossSection,
  liveCrossSection,
  stageStateFromSamples,
  type CrossSectionModel,
} from "./crossSection";
import {
  ensureEarthGcOverlayBound,
  isEarthGcOverlayOpen,
  redrawEarthGcOverlay,
  setEarthGcOverlayOpen,
} from "./earthGcOverlay";
import { formatMissionTime, parseSpeedMode } from "./hudFormat";
import {
  ensurePolarOverlayBound,
  isPolarOverlayOpen,
  redrawPolarOverlay,
  setPolarOverlayMissionT,
  setPolarOverlayOpen,
  setPolarOverlaySamples,
} from "./polarOverlay";
import {
  buildTelemetryView,
  type Telemetry,
  type TelemetryView,
} from "./telemetryView";
import { drawVisualKeymap } from "./visualKeymap";
import {
  applyAutoCamChrome,
  applyCameraGridPressed,
  applyCompleteCardLabels,
  applyMainTelemetryLabels,
  applyMetricsLabels,
  applyPressed,
} from "./hudApply";
import {
  CAM_DOUBLE_TAP_MS,
  CAMERA_LABELS,
  cycleCameraMode,
} from "./hudCameraLabels";
import {
  collectHudDom,
  collectMetricsDom,
  type HudDom,
  type MetricsDom,
} from "./hudDom";
import {
  renderBookmarks,
  renderEventTicks,
  renderPhaseMarkers,
} from "./hudScrubRender";
import { playCamToast, type ToastTimer } from "./hudToast";

export type { Telemetry } from "./telemetryView";

export type HudHandlers = {
  onPlayToggle: () => void;
  /** Playback speed multiplier (1, 10, …) */
  onSpeedMode: (rate: number) => void;
  /** `,` / `.` — step playback speed down / up through fixed presets */
  onSpeedNudge: (dir: -1 | 1) => number;
  onScrub: (t: number) => void;
  onCamera: (mode: CameraMode) => void;
  /**
   * Focus + size-relative zoom (double-tap number keys).
   * Falls back to onCamera when omitted.
   */
  onCameraFrame?: (mode: CameraMode) => void;
  /** Q/E yaw about the mode axis, R/F pitch, C/V view-axis roll (hold) */
  onOrbitKey: (
    key: "q" | "e" | "r" | "f" | "c" | "v",
    down: boolean,
  ) => CameraMode;
  /** WASD — pan (hold) */
  onPanKey: (key: "w" | "a" | "s" | "d", down: boolean) => CameraMode;
  /** Z/X — zoom in/out (hold) */
  onZoomKey: (key: "z" | "x", down: boolean) => CameraMode;
  /** L — toggle scene labels (Earth, Moon, Starship, poles, …) */
  onToggleLabels?: () => boolean;
  /** O — toggle orbit overlays (grids, Moon path, craft trail, ground track) */
  onToggleOrbits?: () => boolean;
  /**
   * Toggle guided phase cameras. Returns the new enabled state.
   * Default on; manual camera picks and mouse orbit turn it off.
   */
  onAutoCamToggle?: () => boolean;
  /**
   * Cinematic bookmark: seek + guided camera. Does not count as a manual
   * focus pick (Auto-cam stays on).
   */
  onBookmark?: (bookmark: CinematicBookmark) => void;
};

const CALLOUT_MS = 4200;
const CAM_TOAST_MS = 1600;

type HudFlags = {
  scrubbing: boolean;
  lastPhase: PhaseId | null;
  lastMissionT: number;
  lastPlaying: boolean;
  completeShown: boolean;
  keymapOpen: boolean;
  metricsOpen: boolean;
  crossSectionOpen: boolean;
  hudVisible: boolean;
  lastCamMode: CameraMode;
  autoCamEnabled: boolean;
  labelsEnabled: boolean;
  orbitsEnabled: boolean;
  lastCamKey: string | null;
  lastCamKeyT: number;
  lastNewsId: string | null;
  lastNewsRate: number;
  activeCalloutEvent: MissionEvent | null;
};

type HudData = {
  timeline: MissionTimeline;
  handlers: HudHandlers;
  samples: readonly ReadonlySample[];
  recoveryProfile: RecoveryProfile;
  bookmarks: CinematicBookmark[];
  scrubEventTicks: ReturnType<typeof buildScrubEventTicks>;
  newsBeats: ReturnType<typeof buildNewsBeats>;
  stageState: StageState | null;
  crossModel: CrossSectionModel | null;
  boosterKeyframes: ReturnType<typeof buildBoosterKeyframes> | null;
  firedEvents: Set<string>;
};

type HudRuntime = {
  dom: HudDom;
  mx: MetricsDom;
  flags: HudFlags;
  data: HudData;
  calloutTimer: { timer: ToastTimer };
  camToastTimer: { timer: ToastTimer };
};

function createHudFlagsA(): Pick<
  HudFlags,
  | "scrubbing"
  | "lastPhase"
  | "lastMissionT"
  | "lastPlaying"
  | "completeShown"
  | "keymapOpen"
  | "metricsOpen"
  | "crossSectionOpen"
> {
  return {
    scrubbing: false, lastPhase: null, lastMissionT: -1, lastPlaying: false,
    completeShown: false, keymapOpen: false, metricsOpen: false, crossSectionOpen: false,
  };
}

function createHudFlagsB(): Pick<
  HudFlags,
  | "hudVisible"
  | "lastCamMode"
  | "autoCamEnabled"
  | "labelsEnabled"
  | "orbitsEnabled"
  | "lastCamKey"
  | "lastCamKeyT"
> {
  return {
    hudVisible: true,
    lastCamMode: "earth",
    autoCamEnabled: true,
    labelsEnabled: true,
    orbitsEnabled: true,
    lastCamKey: null,
    lastCamKeyT: 0,
  };
}

function createHudFlagsC(): Pick<
  HudFlags,
  "lastNewsId" | "lastNewsRate" | "activeCalloutEvent"
> {
  return {
    lastNewsId: null,
    lastNewsRate: Number.NaN,
    activeCalloutEvent: null,
  };
}

function createHudFlags(): HudFlags {
  return { ...createHudFlagsA(), ...createHudFlagsB(), ...createHudFlagsC() };
}

function stageDerived(samples: readonly ReadonlySample[], recoveryProfile: RecoveryProfile) {
  const stageState = stageStateFromSamples(samples);
  const crossModel =
    samples.length > 0 ? buildCrossSectionModel(samples, stageState, recoveryProfile) : null;
  const boosterKeyframes =
    stageState != null ? buildBoosterKeyframes(stageState, recoveryProfile) : null;
  return { stageState, crossModel, boosterKeyframes };
}

function buildHudData(
  timeline: MissionTimeline,
  handlers: HudHandlers,
  samples: readonly ReadonlySample[],
  recoveryProfile: RecoveryProfile,
): HudData {
  const derived = stageDerived(samples, recoveryProfile);
  return {
    timeline, handlers, samples, recoveryProfile,
    bookmarks: buildBookmarks(timeline), scrubEventTicks: buildScrubEventTicks(timeline.events),
    newsBeats: buildNewsBeats(timeline), ...derived, firedEvents: new Set<string>(),
  };
}

function createHudRuntime(
  timeline: MissionTimeline,
  handlers: HudHandlers,
  samples: readonly ReadonlySample[],
  recoveryProfile: RecoveryProfile,
): HudRuntime {
  ensureEarthGcOverlayBound();
  ensurePolarOverlayBound();
  setPolarOverlaySamples(samples);
  return {
    dom: collectHudDom(), mx: collectMetricsDom(), flags: createHudFlags(),
    data: buildHudData(timeline, handlers, samples, recoveryProfile),
    calloutTimer: { timer: null }, camToastTimer: { timer: null },
  };
}

// —— Auto-cam UI ————————————————————————————————————————————————————————————

function setAutoCamEnabled(rt: HudRuntime, enabled: boolean): void {
  if (rt.flags.autoCamEnabled === enabled) return;
  rt.flags.autoCamEnabled = enabled;
  applyAutoCamChrome(rt.dom.btnAutoCam, rt.dom.autoCamEl, enabled);
}

function setLabelsEnabled(rt: HudRuntime, enabled: boolean): void {
  rt.flags.labelsEnabled = enabled;
  applyPressed(rt.dom.btnLabels, enabled);
}

function setOrbitsEnabled(rt: HudRuntime, enabled: boolean): void {
  rt.flags.orbitsEnabled = enabled;
  applyPressed(rt.dom.btnOrbits, enabled);
}

function toggleAutoCam(rt: HudRuntime): void {
  if (!rt.data.handlers.onAutoCamToggle) return;
  const on = rt.data.handlers.onAutoCamToggle();
  setAutoCamEnabled(rt, on);
  showAutoCamToast(rt, on);
}

function showAutoCamToast(rt: HudRuntime, on: boolean): void {
  playCamToast(
    rt.dom.camToast,
    rt.dom.camToastTitle,
    rt.dom.camToastDetail,
    on ? "Auto-cam on" : "Auto-cam off",
    on ? "Matches the official webcast camera" : "Manual focus · G to re-enable",
    rt.camToastTimer,
    CAM_TOAST_MS,
  );
}

// —— HUD visibility / panel exclusivity ——————————————————————————————————————

function setHudVisible(rt: HudRuntime, visible: boolean): void {
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

function setKeymapOpen(rt: HudRuntime, open: boolean): void {
  rt.flags.keymapOpen = open;
  if (rt.dom.keymapEl) rt.dom.keymapEl.hidden = !open;
  rt.dom.btnKeymap?.setAttribute("aria-pressed", open ? "true" : "false");
  rt.dom.hudRoot?.classList.toggle("keymap-open", open);
  if (open) {
    closeOtherPanels(rt, "keymap");
    requestAnimationFrame(() => redrawKeymap(rt));
  }
}

function setMetricsOpen(rt: HudRuntime, open: boolean): void {
  rt.flags.metricsOpen = open;
  if (rt.dom.metricsEl) rt.dom.metricsEl.hidden = !open;
  applyPressed(rt.dom.btnMetrics, open);
  if (open) closeOtherPanels(rt, "metrics");
}

function setCrossSectionOpen(rt: HudRuntime, open: boolean): void {
  rt.flags.crossSectionOpen = open;
  if (rt.dom.crossSectionEl) rt.dom.crossSectionEl.hidden = !open;
  rt.dom.btnCrossSection?.setAttribute("aria-pressed", open ? "true" : "false");
  rt.dom.hudRoot?.classList.toggle("cross-section-open", open);
  if (open) closeOtherPanels(rt, "cross");
}

function setEarthGcOpen(rt: HudRuntime, open: boolean): void {
  setEarthGcOverlayOpen(open);
  rt.dom.btnEarthGc?.setAttribute("aria-pressed", open ? "true" : "false");
  rt.dom.hudRoot?.classList.toggle("earth-gc-open", open);
  if (open) closeOtherPanels(rt, "earthGc");
}

function setPolarMapOpen(rt: HudRuntime, open: boolean): void {
  setPolarOverlayOpen(open);
  rt.dom.btnPolarMap?.setAttribute("aria-pressed", open ? "true" : "false");
  rt.dom.hudRoot?.classList.toggle("polar-map-open", open);
  if (open) closeOtherPanels(rt, "polar");
}

/**
 * Tab theater cycle: main → ascent CS → Earth GC → Polar → KeyMap → main.
 * Metrics stays on M only (not in the cycle).
 */
function cycleTheaterViews(rt: HudRuntime): void {
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

function redrawKeymap(rt: HudRuntime): void {
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

function redrawCrossSection(rt: HudRuntime, missionT: number): void {
  if (!canDrawCrossSection(rt)) return;
  paintCrossSection(rt, missionT);
}

// —— Scrub events / bookmarks / callouts ——————————————————————————————————————

function setTelemetryDimmed(rt: HudRuntime, dimmed: boolean): void {
  rt.dom.telemetryEl?.classList.toggle("tel-dimmed", dimmed);
  rt.dom.cameraRailEl?.classList.toggle("tel-dimmed", dimmed);
}

function setActiveEventTick(rt: HudRuntime, id: string | null): void {
  if (!rt.dom.eventsEl) return;
  for (const node of rt.dom.eventsEl.querySelectorAll<HTMLElement>("[data-event]")) {
    node.classList.toggle("active", node.dataset.event === id);
  }
}

function setActiveBookmark(rt: HudRuntime, id: string | null): void {
  if (!rt.dom.bookmarksEl) return;
  for (const node of rt.dom.bookmarksEl.querySelectorAll<HTMLElement>(
    "[data-bookmark]",
  )) {
    node.classList.toggle("active", node.dataset.bookmark === id);
  }
}

/**
 * Seek scrubber to a narrative event, show its callout, and highlight the tick.
 */
function seekToEvent(rt: HudRuntime, ev: MissionEvent): void {
  setActiveBookmark(rt, null);
  rt.dom.scrub.value = String(Math.round(ev.u * 1000));
  rt.data.handlers.onScrub(ev.u);
  rt.data.firedEvents.add(ev.id);
  setActiveEventTick(rt, ev.id);
  showCallout(rt, ev);
}

function showBookmarkToast(rt: HudRuntime, bm: CinematicBookmark): void {
  playCamToast(
    rt.dom.camToast,
    rt.dom.camToastTitle,
    rt.dom.camToastDetail,
    `Bookmark · ${bm.label}`,
    `${formatMissionTime(bm.t)} · seek + camera`,
    rt.camToastTimer,
    CAM_TOAST_MS,
  );
}

function jumpToBookmark(rt: HudRuntime, bm: CinematicBookmark): void {
  setActiveBookmark(rt, bm.id);
  setActiveEventTick(rt, null);
  rt.dom.scrub.value = String(Math.round(bm.u * 1000));
  if (rt.data.handlers.onBookmark) rt.data.handlers.onBookmark(bm);
  else rt.data.handlers.onScrub(bm.u);
  showBookmarkToast(rt, bm);
}

function hideCallout(rt: HudRuntime): void {
  if (!rt.dom.callout) return;
  rt.dom.callout.hidden = true;
  rt.dom.callout.classList.remove("callout-out", "callout-in");
  rt.flags.activeCalloutEvent = null;
  setTelemetryDimmed(rt, false);
  setActiveEventTick(rt, null);
}

function fillCalloutDetail(rt: HudRuntime, ev: MissionEvent): void {
  if (!rt.dom.calloutDetail) return;
  rt.dom.calloutDetail.textContent = ev.detail ?? "";
  rt.dom.calloutDetail.hidden = !ev.detail;
}

function fillCalloutA11y(rt: HudRuntime, ev: MissionEvent): void {
  const t = formatMissionTime(ev.t);
  rt.dom.callout!.title = `Jump to ${ev.title} · ${t}`;
  rt.dom.callout!.setAttribute(
    "aria-label",
    `Mission event: ${ev.title}. Activate to jump to ${t}`,
  );
}

function fillCallout(rt: HudRuntime, ev: MissionEvent): void {
  if (!rt.dom.callout || !rt.dom.calloutTitle) return;
  rt.dom.calloutTitle.textContent = ev.title;
  fillCalloutDetail(rt, ev);
  fillCalloutA11y(rt, ev);
}

function scheduleCalloutHide(rt: HudRuntime): void {
  if (rt.calloutTimer.timer) clearTimeout(rt.calloutTimer.timer);
  rt.calloutTimer.timer = setTimeout(() => {
    rt.dom.callout?.classList.remove("callout-in");
    rt.dom.callout?.classList.add("callout-out");
    rt.calloutTimer.timer = setTimeout(() => hideCallout(rt), 320);
  }, CALLOUT_MS);
}

function revealCallout(rt: HudRuntime): void {
  const el = rt.dom.callout!;
  el.hidden = false;
  el.classList.remove("callout-out");
  void el.offsetWidth;
  el.classList.add("callout-in");
}

function showCallout(rt: HudRuntime, ev: MissionEvent): void {
  if (!rt.dom.callout || !rt.dom.calloutTitle) return;
  rt.flags.activeCalloutEvent = ev;
  fillCallout(rt, ev);
  revealCallout(rt);
  setTelemetryDimmed(rt, true);
  setActiveEventTick(rt, ev.id);
  scheduleCalloutHide(rt);
}

// —— Camera toasts / keys ————————————————————————————————————————————————————

function showCameraToast(
  rt: HudRuntime,
  mode: CameraMode,
  framed = false,
): void {
  const info = CAMERA_LABELS[mode];
  const title = framed ? `${info.title} · framed` : info.title;
  const detail = framed ? "Zoom matched to object size" : info.detail;
  playCamToast(rt.dom.camToast, rt.dom.camToastTitle, rt.dom.camToastDetail, title, detail, rt.camToastTimer, CAM_TOAST_MS);
}

function rememberCameraMode(rt: HudRuntime, mode: CameraMode): void {
  rt.flags.lastCamMode = mode;
  applyCameraGridPressed(rt.dom.camGridEl, mode);
}

function noteCameraMode(rt: HudRuntime, mode: CameraMode): void {
  if (mode === rt.flags.lastCamMode) return;
  rememberCameraMode(rt, mode);
  showCameraToast(rt, mode);
}

function switchCamera(rt: HudRuntime, mode: CameraMode): void {
  rt.data.handlers.onCamera(mode);
  rememberCameraMode(rt, mode);
  showCameraToast(rt, mode, false);
}

function frameCamera(rt: HudRuntime, mode: CameraMode): void {
  if (rt.data.handlers.onCameraFrame) rt.data.handlers.onCameraFrame(mode);
  else rt.data.handlers.onCamera(mode);
  rememberCameraMode(rt, mode);
  showCameraToast(rt, mode, true);
}

function toastAutoCam(rt: HudRuntime, mode: CameraMode): void {
  playCamToast(
    rt.dom.camToast,
    rt.dom.camToastTitle,
    rt.dom.camToastDetail,
    `Auto · ${CAMERA_LABELS[mode].title}`,
    "Guided camera",
    rt.camToastTimer,
    CAM_TOAST_MS,
  );
}

/** Auto-cam cut: toast only (does not disable Auto-cam). */
function notifyAutoCamera(rt: HudRuntime, mode: CameraMode): void {
  rememberCameraMode(rt, mode);
  toastAutoCam(rt, mode);
}

function cycleCamera(rt: HudRuntime, dir: -1 | 1 = 1): void {
  switchCamera(rt, cycleCameraMode(rt.flags.lastCamMode, dir));
}

/** Single tap: switch focus. Double-tap same key: frame object. */
function handleCameraKey(rt: HudRuntime, mode: CameraMode, key: string): void {
  const now = performance.now();
  const isDouble =
    rt.flags.lastCamKey === key && now - rt.flags.lastCamKeyT <= CAM_DOUBLE_TAP_MS;
  rt.flags.lastCamKey = key;
  rt.flags.lastCamKeyT = now;
  if (isDouble) frameCamera(rt, mode);
  else switchCamera(rt, mode);
}

// —— News ticker / events / update ——————————————————————————————————————————

function setNewsTickerCss(track: HTMLElement, rate: number, playing: boolean): void {
  track.style.setProperty("--news-ticker-dur", `${newsTickerPeriodS(rate)}s`);
  track.style.setProperty("--news-ticker-dir", rate < 0 ? "reverse" : "normal");
  track.classList.toggle("news-ticker-pause", !playing || Math.abs(rate) < 1e-6);
}

function applyNewsTickerRate(
  rt: HudRuntime,
  playbackRate: number,
  playing: boolean,
): void {
  if (!rt.dom.newsTrackEl) return;
  const rate = Number.isFinite(playbackRate) ? playbackRate : 1;
  setNewsTickerCss(rt.dom.newsTrackEl, rate, playing);
  rt.flags.lastNewsRate = rate;
}

function rebindNewsAnimation(rt: HudRuntime): void {
  if (!rt.dom.newsTrackEl) return;
  rt.dom.newsTrackEl.style.animation = "none";
  void rt.dom.newsTrackEl.offsetWidth;
  rt.dom.newsTrackEl.style.animation = "";
}

function setNewsLine(rt: HudRuntime, beatId: string, line: string): void {
  rt.flags.lastNewsId = beatId;
  rt.dom.newsTextEl!.textContent = line;
  if (rt.dom.newsTextDupEl) rt.dom.newsTextDupEl.textContent = line;
}

function newsLineFor(rt: HudRuntime, missionT: number, beatLine: string): string {
  return formatTickerCrawl(rt.data.newsBeats, missionT, 2) || beatLine;
}

function applyNewsBeat(rt: HudRuntime, missionT: number, beatId: string, beatLine: string): boolean {
  const line = newsLineFor(rt, missionT, beatLine);
  const changed =
    beatId !== rt.flags.lastNewsId || rt.dom.newsTextEl!.textContent !== line;
  if (changed) setNewsLine(rt, beatId, line);
  return changed;
}

function updateNewsTickerText(rt: HudRuntime, missionT: number): boolean {
  if (!rt.dom.newsTickerEl || !rt.dom.newsTextEl) return false;
  const beat = newsAtMissionTime(rt.data.newsBeats, missionT);
  if (!beat) {
    rt.dom.newsTickerEl.hidden = true;
    return false;
  }
  rt.dom.newsTickerEl.hidden = false;
  return applyNewsBeat(rt, missionT, beat.id, beat.line);
}

function updateNewsTicker(
  rt: HudRuntime,
  missionT: number,
  playing: boolean,
  playbackRate: number,
): void {
  if (!rt.dom.newsTickerEl || !rt.dom.newsTextEl) return;
  const textChanged = updateNewsTickerText(rt, missionT);
  if (rt.dom.newsTickerEl.hidden) return;
  const rateChanged =
    !Number.isFinite(rt.flags.lastNewsRate) ||
    Math.abs(rt.flags.lastNewsRate - playbackRate) > 1e-9;
  if (textChanged || rateChanged) rebindNewsAnimation(rt);
  applyNewsTickerRate(rt, playbackRate, playing);
}

function clearFutureFiredEvents(rt: HudRuntime, missionT: number): void {
  for (const ev of rt.data.timeline.events) {
    if (ev.t > missionT) rt.data.firedEvents.delete(ev.id);
  }
}

function tryFireEvent(
  rt: HudRuntime,
  ev: MissionEvent,
  missionT: number,
  playing: boolean,
): void {
  if (rt.data.firedEvents.has(ev.id) || missionT + 0.05 < ev.t) return;
  if (missionT - ev.t > 12) {
    rt.data.firedEvents.add(ev.id);
    return;
  }
  if (!playing && !rt.flags.scrubbing) return;
  rt.data.firedEvents.add(ev.id);
  showCallout(rt, ev);
}

function maybeFireEvents(
  rt: HudRuntime,
  missionT: number,
  playing: boolean,
): void {
  if (rt.flags.lastMissionT >= 0 && missionT + 1e-3 < rt.flags.lastMissionT) {
    clearFutureFiredEvents(rt, missionT);
  }
  rt.flags.lastMissionT = missionT;
  for (const ev of rt.data.timeline.events) {
    tryFireEvent(rt, ev, missionT, playing);
  }
}

function syncSpeedSelect(rt: HudRuntime, view: TelemetryView): void {
  const rateStr = String(view.main.playbackSpeed);
  if (
    rt.dom.speed.value !== rateStr &&
    rt.dom.speed.querySelector(`option[value="${rateStr}"]`)
  ) {
    rt.dom.speed.value = rateStr;
  }
}

function highlightPhaseMarker(rt: HudRuntime, phaseId: PhaseId): void {
  if (!rt.dom.markersEl || phaseId === rt.flags.lastPhase) return;
  rt.flags.lastPhase = phaseId;
  for (const node of rt.dom.markersEl.querySelectorAll<HTMLElement>(
    "[data-phase]",
  )) {
    node.classList.toggle("active", node.dataset.phase === phaseId);
  }
}

function updateOverlays(rt: HudRuntime, tel: Telemetry, view: TelemetryView): void {
  if (rt.flags.metricsOpen) applyMetricsLabels(rt.mx, view);
  if (rt.flags.crossSectionOpen) redrawCrossSection(rt, tel.t);
  if (isEarthGcOverlayOpen()) redrawEarthGcOverlay();
  setPolarOverlayMissionT(tel.t);
  if (isPolarOverlayOpen()) redrawPolarOverlay();
  if (rt.flags.keymapOpen) redrawKeymap(rt);
}

function completeShownBag(rt: HudRuntime): { value: boolean } {
  return {
    get value() {
      return rt.flags.completeShown;
    },
    set value(v: boolean) {
      rt.flags.completeShown = v;
    },
  };
}

function applyUpdateChrome(rt: HudRuntime, tel: Telemetry, view: TelemetryView): void {
  rt.flags.lastPlaying = tel.playing;
  updateNewsTicker(rt, tel.t, tel.playing, tel.playbackSpeed);
  syncSpeedSelect(rt, view);
  if (!rt.flags.scrubbing) rt.dom.scrub.value = view.main.scrubValue;
  highlightPhaseMarker(rt, tel.phaseId);
  maybeFireEvents(rt, tel.t, tel.playing);
  updateOverlays(rt, tel, view);
}

function update(rt: HudRuntime, tel: Telemetry): void {
  const view = buildTelemetryView(tel, { segments: rt.data.timeline.segments });
  applyMainTelemetryLabels(rt.dom, view);
  applyCompleteCardLabels(rt.dom, view, completeShownBag(rt));
  if (tel.cameraMode !== rt.flags.lastCamMode) rememberCameraMode(rt, tel.cameraMode);
  applyUpdateChrome(rt, tel, view);
}

// —— Wiring ————————————————————————————————————————————————————————————————

function wireAutoCamButton(rt: HudRuntime): void {
  if (!rt.dom.btnAutoCam) return;
  rt.dom.btnAutoCam.addEventListener("click", () => toggleAutoCam(rt));
  applyAutoCamChrome(rt.dom.btnAutoCam, rt.dom.autoCamEl, true);
}

function toggleLabels(rt: HudRuntime): void {
  const on = rt.data.handlers.onToggleLabels?.();
  if (typeof on === "boolean") setLabelsEnabled(rt, on);
}

function toggleOrbits(rt: HudRuntime): void {
  const on = rt.data.handlers.onToggleOrbits?.();
  if (typeof on === "boolean") setOrbitsEnabled(rt, on);
}

function wireSceneToggleButtons(rt: HudRuntime): void {
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

function wireCameraRail(rt: HudRuntime): void {
  rt.dom.camGridEl?.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-cam]");
    if (btn) onCamGridClick(rt, btn);
  });
  rt.dom.btnCamCycle?.addEventListener("click", () => cycleCamera(rt));
  applyCameraGridPressed(rt.dom.camGridEl, rt.flags.lastCamMode);
}

function wirePanelOpenButtons(rt: HudRuntime): void {
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

function wireTransportControls(rt: HudRuntime): void {
  rt.dom.btnPlay?.addEventListener("click", () => rt.data.handlers.onPlayToggle());
  wireAutoCamButton(rt);
  wireSceneToggleButtons(rt);
  wireCameraRail(rt);
  wirePanelOpenButtons(rt);
  rt.dom.speed.addEventListener("change", () => {
    rt.data.handlers.onSpeedMode(parseSpeedMode(rt.dom.speed.value));
  });
}

function onScrubInput(rt: HudRuntime): void {
  setActiveBookmark(rt, null);
  setActiveEventTick(rt, null);
  rt.data.handlers.onScrub(Number(rt.dom.scrub.value) / 1000);
}

function wireScrubber(rt: HudRuntime): void {
  rt.dom.scrub.addEventListener("pointerdown", () => {
    rt.flags.scrubbing = true;
  });
  rt.dom.scrub.addEventListener("pointerup", () => {
    rt.flags.scrubbing = false;
  });
  rt.dom.scrub.addEventListener("input", () => onScrubInput(rt));
}

function wireBackdropClose(
  el: HTMLElement | null,
  close: () => void,
): void {
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

function wireOverlayCloses(rt: HudRuntime): void {
  wirePanelCloses(rt);
  wireMapToggles(rt);
}

function isFormTypingTarget(t: EventTarget | null): boolean {
  if (t instanceof HTMLInputElement && t.type !== "range") return true;
  if (t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLTextAreaElement) return true;
  return false;
}

function handleEscapePanels(rt: HudRuntime): void {
  if (rt.flags.crossSectionOpen) setCrossSectionOpen(rt, false);
  else if (isEarthGcOverlayOpen()) setEarthGcOpen(rt, false);
  else if (isPolarOverlayOpen()) setPolarMapOpen(rt, false);
  else if (rt.flags.metricsOpen) setMetricsOpen(rt, false);
  else setKeymapOpen(rt, false);
}

function anyPanelOpen(rt: HudRuntime): boolean {
  return (
    rt.flags.keymapOpen ||
    rt.flags.metricsOpen ||
    rt.flags.crossSectionOpen ||
    isEarthGcOverlayOpen() ||
    isPolarOverlayOpen()
  );
}

function preventAnd(e: KeyboardEvent, action: () => void): true {
  e.preventDefault();
  action();
  return true;
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

function handleTransportKey(rt: HudRuntime, e: KeyboardEvent): boolean {
  if (e.code === "Space") {
    return preventAnd(e, () => rt.data.handlers.onPlayToggle());
  }
  if (e.code === "Minus") {
    return preventAnd(e, () => cycleCamera(rt, -1));
  }
  if (e.code === "Equal") {
    return preventAnd(e, () => cycleCamera(rt, 1));
  }
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

function handlePanZoomHold(rt: HudRuntime, k: string): boolean {
  if (k === "w" || k === "a" || k === "s" || k === "d") {
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

function handleSpeedNudgeKey(rt: HudRuntime, e: KeyboardEvent): boolean {
  if (e.key === "," || e.key === "<") return preventAnd(e, () => nudgeSpeed(rt, -1));
  if (e.key === "." || e.key === ">") return preventAnd(e, () => nudgeSpeed(rt, 1));
  return false;
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
  if (e.key === "g" || e.key === "G") return preventAnd(e, () => toggleAutoCam(rt));
  return false;
}

function handleMiscKey(rt: HudRuntime, e: KeyboardEvent): boolean {
  return handleSpeedNudgeKey(rt, e) || handleToggleSceneKey(rt, e);
}

function onKeyDown(rt: HudRuntime, e: KeyboardEvent): void {
  if (e.repeat || isFormTypingTarget(e.target)) return;
  if (handleUiKey(rt, e)) return;
  if (handleTransportKey(rt, e)) return;
  if (handleHoldKeyDown(rt, e)) return;
  handleMiscKey(rt, e);
}

function onKeyUp(rt: HudRuntime, e: KeyboardEvent): void {
  const k = e.key.toLowerCase();
  const h = rt.data.handlers;
  if (k === "q" || k === "e" || k === "r" || k === "f" || k === "c" || k === "v") {
    h.onOrbitKey(k, false);
  } else if (k === "w" || k === "a" || k === "s" || k === "d") {
    h.onPanKey(k, false);
  } else if (k === "z" || k === "x") {
    h.onZoomKey(k, false);
  }
}

function releaseAllHolds(rt: HudRuntime): void {
  const h = rt.data.handlers;
  for (const k of ["q", "e", "r", "f", "c", "v"] as const) h.onOrbitKey(k, false);
  for (const k of ["w", "a", "s", "d"] as const) h.onPanKey(k, false);
  for (const k of ["z", "x"] as const) h.onZoomKey(k, false);
}

function wireKeyboard(rt: HudRuntime): void {
  window.addEventListener("keydown", (e) => onKeyDown(rt, e));
  window.addEventListener("keyup", (e) => onKeyUp(rt, e));
  window.addEventListener("blur", () => releaseAllHolds(rt));
}

function activateCallout(rt: HudRuntime): void {
  if (rt.flags.activeCalloutEvent) seekToEvent(rt, rt.flags.activeCalloutEvent);
}

function onCalloutKey(rt: HudRuntime, e: KeyboardEvent): void {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  activateCallout(rt);
}

function wireCallout(rt: HudRuntime): void {
  if (!rt.dom.callout) return;
  rt.dom.callout.addEventListener("click", (e) => {
    e.preventDefault();
    activateCallout(rt);
  });
  rt.dom.callout.addEventListener("keydown", (e) => onCalloutKey(rt, e));
}

function onReplayClick(rt: HudRuntime): void {
  rt.data.handlers.onScrub(0);
  if (!rt.flags.lastPlaying) rt.data.handlers.onPlayToggle();
  if (rt.dom.completeEl) rt.dom.completeEl.hidden = true;
  rt.flags.completeShown = false;
}

function wireCalloutAndReplay(rt: HudRuntime): void {
  wireCallout(rt);
  rt.dom.mcReplay?.addEventListener("click", () => onReplayClick(rt));
}

function wireScrubChrome(rt: HudRuntime): void {
  const { dom, data } = rt;
  if (dom.markersEl) renderPhaseMarkers(dom.markersEl, data.timeline.segments);
  if (dom.eventsEl) {
    renderEventTicks(dom.eventsEl, data.scrubEventTicks, (ev) => seekToEvent(rt, ev));
  }
  if (dom.bookmarksEl) {
    renderBookmarks(dom.bookmarksEl, data.bookmarks, (bm) => jumpToBookmark(rt, bm));
  }
}

function wireHud(rt: HudRuntime): void {
  wireTransportControls(rt);
  wireScrubber(rt);
  wireOverlayCloses(rt);
  wireKeyboard(rt);
  wireCalloutAndReplay(rt);
  wireScrubChrome(rt);
  rt.data.handlers.onSpeedMode(parseSpeedMode(rt.dom.speed.value));
}

/**
 * Bind the mission theater HUD. Returns per-frame update + Auto-cam sync.
 */
export function bindHud(
  _clock: MissionClock,
  timeline: MissionTimeline,
  handlers: HudHandlers,
  samples: readonly ReadonlySample[] = [],
  recoveryProfile: RecoveryProfile = "chopsticks",
): {
  update: (tel: Telemetry) => void;
  setAutoCamEnabled: (enabled: boolean) => void;
  notifyAutoCamera: (mode: CameraMode) => void;
} {
  const rt = createHudRuntime(timeline, handlers, samples, recoveryProfile);
  wireHud(rt);
  return {
    update: (tel) => update(rt, tel),
    setAutoCamEnabled: (enabled) => setAutoCamEnabled(rt, enabled),
    notifyAutoCamera: (mode) => notifyAutoCamera(rt, mode),
  };
}

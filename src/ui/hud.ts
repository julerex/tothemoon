/**
 * Mission theater HUD: transport, telemetry strip, overlays, keyboard.
 * Orchestrates short helpers; DOM queries live in {@link ./hudDom}.
 */

import type { MissionClock } from "../mission/clock";
import type { CameraMode } from "../camera/modes";
import { buildBookmarks } from "../mission/bookmarks";
import { buildScrubEventTicks } from "../mission/scrubEvents";
import { buildNewsBeats } from "../mission/newsTicker";
import type { MissionTimeline } from "../mission/timeline";
import type { PhaseId } from "../physics/mission";
import type { ReadonlySample } from "../physics/missionTypes";
import {
  buildBoosterKeyframes,
  type RecoveryProfile,
} from "../physics/boosterRecovery";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import {
  buildCrossSectionModel,
  stageStateFromSamples,
} from "./crossSection";
import { ensureEarthGcOverlayBound, isEarthGcOverlayOpen, redrawEarthGcOverlay } from "./earthGcOverlay";
import { parseSpeedMode } from "./hudFormat";
import {
  ensurePolarOverlayBound,
  isPolarOverlayOpen,
  redrawPolarOverlay,
  setPolarOverlayMissionT,
  setPolarOverlaySamples,
} from "./polarOverlay";
import {
  applyCompleteCardLabels,
  applyMainTelemetryLabels,
  applyMetricsLabels,
} from "./hudApply";
import { collectHudDom, collectMetricsDom } from "./hudDom";
import { rememberCameraMode, setAutoCamEnabled, notifyAutoCamera, wireCameraChrome } from "./hudCameraCtl";
import { wireKeyboard } from "./hudKeys";
import { redrawCrossSection, redrawKeymap, wireOverlayCloses, wirePanelOpenButtons } from "./hudPanels";
import {
  syncSpeedSelect,
  updateNewsTicker,
  wireReplay,
  wireScrubber,
  wireScrubChrome,
  wireTransportControls,
} from "./hudTransport";
import type { HudData, HudFlags, HudHandlers, HudRuntime } from "./hudTypes";
import { buildTelemetryView, type Telemetry } from "./telemetryView";

export type { Telemetry } from "./telemetryView";
export type { HudHandlers } from "./hudTypes";

function createHudFlagsA(): Pick<
  HudFlags,
  | "scrubbing"
  | "lastPhase"
  | "lastPlaying"
  | "completeShown"
  | "keymapOpen"
  | "metricsOpen"
  | "crossSectionOpen"
> {
  return {
    scrubbing: false, lastPhase: null, lastPlaying: false,
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
    labelsEnabled: false,
    orbitsEnabled: false,
    lastCamKey: null,
    lastCamKeyT: 0,
  };
}

function createHudFlagsC(): Pick<HudFlags, "lastNewsId" | "lastNewsRate"> {
  return {
    lastNewsId: null,
    lastNewsRate: Number.NaN,
  };
}

function createHudFlags(): HudFlags {
  return { ...createHudFlagsA(), ...createHudFlagsB(), ...createHudFlagsC() };
}

function stageDerived(
  samples: readonly ReadonlySample[],
  recoveryProfile: RecoveryProfile,
  epoch: EphemerisEpoch,
) {
  const stageState = stageStateFromSamples(samples);
  const crossModel =
    samples.length > 0 ? buildCrossSectionModel(samples, stageState, recoveryProfile, epoch) : null;
  const boosterKeyframes =
    stageState != null ? buildBoosterKeyframes(stageState, recoveryProfile, epoch) : null;
  return { stageState, crossModel, boosterKeyframes };
}

function buildHudData(
  timeline: MissionTimeline,
  handlers: HudHandlers,
  samples: readonly ReadonlySample[],
  recoveryProfile: RecoveryProfile,
  epoch: EphemerisEpoch,
): HudData {
  const derived = stageDerived(samples, recoveryProfile, epoch);
  return {
    timeline, handlers, samples, recoveryProfile,
    bookmarks: buildBookmarks(timeline), scrubEventTicks: buildScrubEventTicks(timeline.events),
    newsBeats: buildNewsBeats(timeline), ...derived, epoch,
  };
}

function createHudRuntime(
  timeline: MissionTimeline,
  handlers: HudHandlers,
  samples: readonly ReadonlySample[],
  recoveryProfile: RecoveryProfile,
  epoch: EphemerisEpoch,
): HudRuntime {
  ensureEarthGcOverlayBound();
  ensurePolarOverlayBound();
  setPolarOverlaySamples(samples);
  return {
    dom: collectHudDom(), mx: collectMetricsDom(), flags: createHudFlags(),
    data: buildHudData(timeline, handlers, samples, recoveryProfile, epoch),
  };
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

function updateOverlays(rt: HudRuntime, tel: Telemetry, view: ReturnType<typeof buildTelemetryView>): void {
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

function applyUpdateChrome(rt: HudRuntime, tel: Telemetry, view: ReturnType<typeof buildTelemetryView>): void {
  rt.flags.lastPlaying = tel.playing;
  updateNewsTicker(rt, tel.t, tel.playing, tel.playbackSpeed);
  syncSpeedSelect(rt, view);
  if (!rt.flags.scrubbing) rt.dom.scrub.value = view.main.scrubValue;
  highlightPhaseMarker(rt, tel.phaseId);
  updateOverlays(rt, tel, view);
}

function update(rt: HudRuntime, tel: Telemetry): void {
  const view = buildTelemetryView(tel, { segments: rt.data.timeline.segments });
  applyMainTelemetryLabels(rt.dom, view);
  applyCompleteCardLabels(rt.dom, view, completeShownBag(rt));
  if (tel.cameraMode !== rt.flags.lastCamMode) rememberCameraMode(rt, tel.cameraMode);
  applyUpdateChrome(rt, tel, view);
}

function wireHud(rt: HudRuntime): void {
  wireTransportControls(rt);
  wireCameraChrome(rt);
  wirePanelOpenButtons(rt);
  wireScrubber(rt);
  wireOverlayCloses(rt);
  wireKeyboard(rt);
  wireReplay(rt);
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
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): {
  update: (tel: Telemetry) => void;
  setAutoCamEnabled: (enabled: boolean) => void;
  notifyAutoCamera: (mode: CameraMode) => void;
} {
  const rt = createHudRuntime(timeline, handlers, samples, recoveryProfile, epoch);
  wireHud(rt);
  return {
    update: (tel) => update(rt, tel),
    setAutoCamEnabled: (enabled) => setAutoCamEnabled(rt, enabled),
    notifyAutoCamera: (mode) => notifyAutoCamera(rt, mode),
  };
}

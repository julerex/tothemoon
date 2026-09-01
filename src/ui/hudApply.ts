/**
 * Apply pure {@link TelemetryView} labels to HUD DOM nodes.
 */

import type { MetricsDom, HudCompleteCard, HudDom } from "./hudDom";
import { formatRate } from "./hudFormat";
import type {
  CompleteCardLabels,
  MainTelemetryLabels,
  MetricsLabels,
  TelemetryView,
} from "./telemetryView";

/** Set textContent when the node exists. */
export function setText(node: HTMLElement | null, text: string): void {
  if (node) node.textContent = text;
}

/** Metrics string fields that map 1:1 onto MetricsDom nodes. */
const METRIC_KEYS = [
  "phase",
  "time",
  "date",
  "dateTexas",
  "dateAustralia",
  "sky",
  "progress",
  "playback",
  "altEarth",
  "rEarth",
  "altMoon",
  "distMoon",
  "rMoon",
  "cam",
  "speed",
  "speedEarth",
  "speedMoon",
  "booster",
  "ship",
  "mass",
  "thrust",
  "accel",
  "engines",
  "staged",
  "duration",
  "translunarInjectionDeltaV",
  "minalt",
  "peakSpeed",
  "stageT",
  "keplerDev",
] as const satisfies readonly (keyof MetricsLabels & keyof MetricsDom)[];

function applyForceCheckRow(mx: MetricsDom, m: MetricsLabels): void {
  if (!mx.forceRow || !mx.forceCheck) return;
  if (m.forceCheckVisible) {
    mx.forceRow.hidden = false;
    mx.forceCheck.textContent = m.forceCheck;
    return;
  }
  mx.forceRow.hidden = true;
  mx.forceCheck.textContent = "—";
}

/** Apply Metrics (M) overlay labels. */
export function applyMetricsLabels(mx: MetricsDom, view: TelemetryView): void {
  const m = view.metrics;
  for (const key of METRIC_KEYS) {
    setText(mx[key], m[key]);
  }
  applyForceCheckRow(mx, m);
}

function applyMainFuelBars(dom: HudDom, m: MainTelemetryLabels): void {
  if (dom.barBooster) dom.barBooster.style.width = m.fuelBoosterBar;
  if (dom.barShip) dom.barShip.style.width = m.fuelShipBar;
}

function applyMainPlayButton(dom: HudDom, m: MainTelemetryLabels): void {
  if (!dom.btnPlay) return;
  dom.btnPlay.textContent = m.playLabel;
  dom.btnPlay.setAttribute("aria-pressed", m.playPressed ? "true" : "false");
}

function applyMainStripCore(dom: HudDom, m: MainTelemetryLabels): void {
  dom.phaseEl.textContent = m.phase;
  if (dom.nextPhaseEl) dom.nextPhaseEl.textContent = m.nextPhase;
  if (dom.phaseLeftEl) dom.phaseLeftEl.textContent = m.phaseLeft;
  if (dom.camModeEl) dom.camModeEl.textContent = m.cameraMode;
  if (dom.camKindEl) dom.camKindEl.textContent = m.cameraKind;
  if (dom.missionClockEl) dom.missionClockEl.textContent = m.missionClock;
  if (dom.missionClockRateEl) {
    dom.missionClockRateEl.textContent = formatRate(m.playbackSpeed);
  }
  if (dom.dateEl) dom.dateEl.textContent = m.dateUtc;
  if (dom.dateTexasEl) dom.dateTexasEl.textContent = m.dateTexas;
  if (dom.dateAustraliaEl) dom.dateAustraliaEl.textContent = m.dateAustralia;
  dom.distEl.textContent = m.distance;
  dom.progEl.textContent = m.progress;
  dom.altEl.textContent = m.altitude;
}

/** Highlight the active camera-focus button on the right rail. */
export function applyCameraGridPressed(
  grid: HTMLElement | null,
  mode: string,
): void {
  if (!grid) return;
  for (const btn of grid.querySelectorAll<HTMLButtonElement>("[data-cam]")) {
    btn.setAttribute("aria-pressed", btn.dataset.cam === mode ? "true" : "false");
  }
}

/** Visible on/off copy for a rail toggle (`Autocam is on`). */
export function toggleIsOnLabel(name: string, enabled: boolean): string {
  return `${name} is ${enabled ? "on" : "off"}`;
}

/** Sync Auto-cam readout + button chrome. */
export function applyAutoCamChrome(
  btn: HTMLButtonElement | null,
  statusEl: HTMLElement | null,
  enabled: boolean,
): void {
  if (btn) {
    btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    btn.title = enabled
      ? "Autocam is on — Flight 13 follows the webcast left pane (G)"
      : "Autocam is off — press G or click to re-enable";
    btn.textContent = toggleIsOnLabel("Autocam", enabled);
  }
  if (statusEl) statusEl.textContent = enabled ? "On" : "Off";
}

export function applyPressed(
  btn: HTMLButtonElement | null,
  pressed: boolean,
  onOffName?: string,
): void {
  if (!btn) return;
  btn.setAttribute("aria-pressed", pressed ? "true" : "false");
  if (onOffName) btn.textContent = toggleIsOnLabel(onOffName, pressed);
}

function applyCompass(
  dom: HudDom,
  headingDeg: number | null,
  label: string,
): void {
  if (dom.compassDegEl) dom.compassDegEl.textContent = label;
  if (!dom.compassNeedleEl) return;
  const deg = headingDeg != null && Number.isFinite(headingDeg) ? headingDeg : 0;
  dom.compassNeedleEl.setAttribute("transform", `rotate(${deg} 50 50)`);
}

function applyMainStripRates(dom: HudDom, m: MainTelemetryLabels): void {
  if (dom.camEl) dom.camEl.textContent = m.focusDistance;
  if (dom.camTargetEl) dom.camTargetEl.textContent = m.cameraTarget;
  if (dom.camAltEl) dom.camAltEl.textContent = m.cameraAltitude;
  if (dom.camAltRowEl) dom.camAltRowEl.hidden = !m.cameraAltitudeVisible;
  if (dom.camPosEl) dom.camPosEl.textContent = m.cameraPosition;
  if (dom.camDirEl) dom.camDirEl.textContent = m.cameraDirection;
  applyCompass(dom, m.cameraHeadingDeg, m.cameraHeadingLabel);
  dom.spdEl.textContent = m.speed;
  dom.boosterEl.textContent = m.fuelBooster;
  dom.shipEl.textContent = m.fuelShip;
  dom.thrustEl.textContent = m.thrust;
  if (dom.skyEl) dom.skyEl.textContent = m.sky;
}

/** Apply pure main-strip labels to the DOM. */
export function applyMainTelemetryLabels(
  dom: HudDom,
  view: TelemetryView,
): void {
  const m = view.main;
  applyMainStripCore(dom, m);
  applyMainStripRates(dom, m);
  applyMainFuelBars(dom, m);
  applyMainPlayButton(dom, m);
}

function fillCompleteCardA(
  card: HudCompleteCard,
  c: CompleteCardLabels,
): void {
  if (card.mcSub) card.mcSub.textContent = c.subtitle;
  if (card.mcDuration) card.mcDuration.textContent = c.duration;
  if (card.mcTranslunarInjectionDeltaV) {
    card.mcTranslunarInjectionDeltaV.textContent = c.translunarInjectionDeltaV;
  }
  if (card.mcMinAlt) card.mcMinAlt.textContent = c.minMoonAlt;
}

function fillCompleteCardB(
  card: HudCompleteCard,
  c: CompleteCardLabels,
): void {
  if (card.mcFuel) card.mcFuel.textContent = c.fuelShip;
  if (card.mcPeakSpeed) card.mcPeakSpeed.textContent = c.peakSpeed;
  if (card.mcStageT) card.mcStageT.textContent = c.stageT;
  if (card.mcSky) card.mcSky.textContent = c.sky;
}

function fillCompleteCard(
  card: HudCompleteCard,
  c: CompleteCardLabels,
): void {
  fillCompleteCardA(card, c);
  fillCompleteCardB(card, c);
}

/**
 * Mission-complete card: fill once when ready; hide when scrubbing back.
 * Mutates `shown` bag.
 */
function showCompleteCardOnce(
  card: HudCompleteCard,
  view: NonNullable<TelemetryView["complete"]>,
  shown: { value: boolean },
): void {
  if (!shown.value) {
    shown.value = true;
    fillCompleteCard(card, view);
  }
  card.completeEl!.hidden = false;
}

export function applyCompleteCardLabels(
  card: HudCompleteCard,
  view: TelemetryView,
  shown: { value: boolean },
): void {
  if (!card.completeEl) return;
  if (!view.complete) {
    card.completeEl.hidden = true;
    shown.value = false;
    return;
  }
  showCompleteCardOnce(card, view.complete, shown);
}

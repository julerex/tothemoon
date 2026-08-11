import type { MissionClock } from "../mission/clock";
import type { CameraMode } from "../camera/modes";
import {
  bookmarkForShiftDigit,
  buildBookmarks,
  type CinematicBookmark,
} from "../mission/bookmarks";
import {
  landingBeatCompleteSubtitle,
  type LandingBeatKind,
} from "../mission/landingBeat";
import { buildScrubEventTicks } from "../mission/scrubEvents";
import {
  buildNewsBeats,
  formatTickerCrawl,
  newsAtMissionTime,
  newsTickerPeriodS,
} from "../mission/newsTicker";
import type {
  MissionEvent,
  MissionTimeline,
  PhaseSegment,
} from "../mission/timeline";
import type { PhaseId } from "../physics/mission";
import type { Sample } from "../physics/missionTypes";
import { formatSkyPhaseLine } from "../physics/skyPhase";
import {
  BOOSTER_DRY_KG,
  BOOSTER_PROP_KG,
  R_EARTH,
  R_MOON,
  SHIP_DRY_KG,
  SHIP_PROP_KG,
} from "../physics/constants";
import {
  buildBoosterKeyframes,
  type RecoveryProfile,
} from "../physics/boosterRecovery";
import {
  buildCrossSectionModel,
  drawCrossSection,
  liveCrossSection,
  stageStateFromSamples,
} from "./crossSection";
import {
  ensureEarthGcOverlayBound,
  isEarthGcOverlayOpen,
  redrawEarthGcOverlay,
  setEarthGcOverlayOpen,
} from "./earthGcOverlay";
import {
  clamp01,
  formatAccelG,
  formatDistance,
  formatDistancePrecise,
  formatFocusDistance,
  formatFuel,
  formatFuelDetailed,
  formatMassKg,
  formatMinMoonAlt,
  formatMissionTime,
  formatMissionTimeDetailed,
  formatOptional,
  formatPlaybackLine,
  formatProgressPercent,
  formatProgressRemainingLine,
  formatSpeed,
  formatSpeedPrecise,
  formatThrust,
  formatThrustDetailed,
  formatTranslunarInjectionDv,
  formatTranslunarInjectionDvDetailed,
  formatWebcastMissionTime,
  fuelBarWidthPercent,
  parseSpeedMode,
  thrustAccelG,
  wetMassFromFuel,
} from "./hudFormat";
import {
  ensurePolarOverlayBound,
  isPolarOverlayOpen,
  redrawPolarOverlay,
  setPolarOverlayMissionT,
  setPolarOverlayOpen,
  setPolarOverlaySamples,
} from "./polarOverlay";
import { drawVisualKeymap } from "./visualKeymap";

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
  /** Q/E ecliptic-azimuth orbit, R/F pitch, C/V view-axis roll (hold) */
  onOrbitKey: (
    key: "q" | "e" | "r" | "f" | "c" | "v",
    down: boolean,
  ) => CameraMode;
  /** WASD — pan (hold) */
  onPanKey: (key: "w" | "a" | "s" | "d", down: boolean) => CameraMode;
  /** Z/X — zoom in/out (hold) */
  onZoomKey: (key: "z" | "x", down: boolean) => CameraMode;
  /** L — toggle scene labels (Earth, Moon, Starship, poles, …) */
  onToggleLabels?: () => void;
  /** O — toggle orbit overlays (grids, Moon path, craft trail, ground track) */
  onToggleOrbits?: () => void;
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

export type Telemetry = {
  phase: string;
  phaseId: PhaseId;
  t: number;
  durationS: number;
  distanceToMoon: number;
  altitude: number;
  speed: number;
  /** Booster propellant remaining 0–1 */
  fuelBooster: number;
  /** Ship propellant remaining 0–1 */
  fuelShip: number;
  /** Thrust force (N) */
  thrustN: number;
  playing: boolean;
  dateUtc: string;
  /** Effective playback speed currently applied to the clock */
  playbackSpeed: number;
  /** True once the craft has landed (and landing-beat hold has elapsed) */
  missionComplete: boolean;
  /** Terminal beat kind for complete-card copy (landed / impact / flyby) */
  completeKind?: LandingBeatKind | null;
  /** Translunar injection Δv (km/s) for mission-complete stats */
  translunarInjectionDeltaV: number;
  /** Minimum lunar altitude during approach/capture (km) */
  minMoonAlt: number;
  /** Peak inertial |v| (km/s) from pack meta */
  peakSpeedKmS?: number;
  /** Mission time of booster stage-out (s), or null */
  stageT?: number | null;
  /** Peak |r_nbody − r_kepler| on Translunar injection coast (km) */
  keplerRefMaxDevKm?: number;
  /** Camera distance to focus target (km) */
  focusDistance: number;
  /** Detailed metrics (M overlay) */
  altEarth: number;
  altMoon: number;
  distMoon: number;
  speedEarth: number;
  speedMoon: number;
  staged: boolean;
  burning: boolean;
  /**
   * Optional Flight 13 force-model check (n-body vs Earth-only).
   * When set, Metrics shows a "Force check" row.
   */
  forceCompareLine?: string | null;
};

const CALLOUT_MS = 4200;
const CAM_TOAST_MS = 1600;

export function bindHud(
  _clock: MissionClock,
  timeline: MissionTimeline,
  handlers: HudHandlers,
  /** Baked samples for live cross-section (optional; empty disables diagram data). */
  samples: Sample[] = [],
  /** Super Heavy recovery path for cross-section (default chopsticks RTLS). */
  recoveryProfile: RecoveryProfile = "chopsticks",
): {
  update: (tel: Telemetry) => void;
  /** Sync Auto-cam button when main disables (manual camera / mouse). */
  setAutoCamEnabled: (enabled: boolean) => void;
  /**
   * Show camera toast after an Auto-cam cut (does not count as manual pick).
   */
  notifyAutoCamera: (mode: CameraMode) => void;
} {
  // Transport action buttons removed from the chrome (keyboard still works).
  // Optional querySelector so older HTML with buttons still binds if present.
  const btnPlay = document.querySelector<HTMLButtonElement>("#btn-play");
  const btnAutoCam = document.querySelector<HTMLButtonElement>("#btn-auto-cam");
  const btnCrossSection = document.querySelector<HTMLButtonElement>(
    "#btn-cross-section",
  );
  const btnEarthGc = document.querySelector<HTMLButtonElement>("#btn-earth-gc");
  const btnPolarMap = document.querySelector<HTMLButtonElement>("#btn-polar-map");
  const btnKeymap = document.querySelector<HTMLButtonElement>("#btn-keymap");
  const speed = el<HTMLSelectElement>("#speed");
  /** Last playing state from telemetry (for complete-card Replay). */
  let lastPlaying = false;
  const scrub = el<HTMLInputElement>("#scrub");
  const markersEl = document.querySelector<HTMLElement>("#scrub-markers");
  const eventsEl = document.querySelector<HTMLElement>("#scrub-events");
  const bookmarksEl = document.querySelector<HTMLElement>("#bookmarks");
  const phaseEl = el<HTMLElement>("#phase");
  const missionClockEl = document.querySelector<HTMLElement>(
    "#mission-clock-value",
  );
  const newsTickerEl = document.querySelector<HTMLElement>("#news-ticker");
  const newsTextEl = document.querySelector<HTMLElement>("#news-ticker-text");
  const newsTextDupEl = document.querySelector<HTMLElement>(
    "#news-ticker-text-dup",
  );
  const newsTrackEl = document.querySelector<HTMLElement>("#news-ticker-track");
  const newsBeats = buildNewsBeats(timeline);
  let lastNewsId: string | null = null;
  let lastNewsRate = Number.NaN;
  const dateEl = document.querySelector<HTMLElement>("#date");
  const distEl = el<HTMLElement>("#distance");
  const progEl = el<HTMLElement>("#progress");
  const altEl = el<HTMLElement>("#tel-altitude");
  const camEl = document.querySelector<HTMLElement>("#tel-cam");
  const spdEl = el<HTMLElement>("#tel-speed");
  const boosterEl = el<HTMLElement>("#tel-booster");
  const shipEl = el<HTMLElement>("#tel-ship");
  const thrustEl = el<HTMLElement>("#tel-thrust");
  const skyEl = document.querySelector<HTMLElement>("#tel-sky");
  const barBooster = document.querySelector<HTMLElement>("#bar-booster");
  const barShip = document.querySelector<HTMLElement>("#bar-ship");
  const callout = document.querySelector<HTMLElement>("#callout");
  const calloutTitle = document.querySelector<HTMLElement>("#callout-title");
  const calloutDetail = document.querySelector<HTMLElement>("#callout-detail");
  const telemetryEl = document.querySelector<HTMLElement>(".telemetry");
  const camToast = document.querySelector<HTMLElement>("#cam-toast");
  const camToastTitle = document.querySelector<HTMLElement>("#cam-toast-title");
  const camToastDetail = document.querySelector<HTMLElement>("#cam-toast-detail");
  const completeEl = document.querySelector<HTMLElement>("#mission-complete");
  const mcSub = document.querySelector<HTMLElement>(".mc-sub");
  const mcDuration = document.querySelector<HTMLElement>("#mc-duration");
  const mcTranslunarInjectionDeltaV = document.querySelector<HTMLElement>(
    "#mc-translunar-injection-delta-v",
  );
  const mcMinAlt = document.querySelector<HTMLElement>("#mc-minalt");
  const mcFuel = document.querySelector<HTMLElement>("#mc-fuel");
  const mcPeakSpeed = document.querySelector<HTMLElement>("#mc-peak-speed");
  const mcStageT = document.querySelector<HTMLElement>("#mc-stage-t");
  const mcSky = document.querySelector<HTMLElement>("#mc-sky");
  const mcReplay = document.querySelector<HTMLButtonElement>("#mc-replay");
  const hudRoot = document.querySelector<HTMLElement>("#hud");
  const keymapEl = document.querySelector<HTMLElement>("#keymap");
  const keymapClose = document.querySelector<HTMLButtonElement>("#keymap-close");
  const keymapCanvas = document.querySelector<HTMLCanvasElement>("#keymap-canvas");
  const keymapCtx = keymapCanvas?.getContext("2d") ?? null;
  const metricsEl = document.querySelector<HTMLElement>("#metrics");
  const metricsClose = document.querySelector<HTMLButtonElement>("#metrics-close");
  const crossSectionEl = document.querySelector<HTMLElement>("#cross-section");
  const crossSectionClose = document.querySelector<HTMLButtonElement>(
    "#cross-section-close",
  );
  const crossSectionCanvas = document.querySelector<HTMLCanvasElement>(
    "#cross-section-canvas",
  );
  const crossSectionCtx = crossSectionCanvas?.getContext("2d") ?? null;
  ensureEarthGcOverlayBound();
  ensurePolarOverlayBound();
  setPolarOverlaySamples(samples);
  const stageState = stageStateFromSamples(samples);
  const crossModel =
    samples.length > 0
      ? buildCrossSectionModel(samples, stageState, recoveryProfile)
      : null;
  const boosterKeyframes =
    stageState != null
      ? buildBoosterKeyframes(stageState, recoveryProfile)
      : null;
  const bookmarks = buildBookmarks(timeline);
  const scrubEventTicks = buildScrubEventTicks(timeline.events);
  /** Event currently shown in the callout (for click-to-seek). */
  let activeCalloutEvent: MissionEvent | null = null;
  const mx = {
    phase: document.querySelector<HTMLElement>("#mx-phase"),
    time: document.querySelector<HTMLElement>("#mx-time"),
    date: document.querySelector<HTMLElement>("#mx-date"),
    progress: document.querySelector<HTMLElement>("#mx-progress"),
    playback: document.querySelector<HTMLElement>("#mx-playback"),
    altEarth: document.querySelector<HTMLElement>("#mx-alt-earth"),
    rEarth: document.querySelector<HTMLElement>("#mx-r-earth"),
    altMoon: document.querySelector<HTMLElement>("#mx-alt-moon"),
    distMoon: document.querySelector<HTMLElement>("#mx-dist-moon"),
    rMoon: document.querySelector<HTMLElement>("#mx-r-moon"),
    cam: document.querySelector<HTMLElement>("#mx-cam"),
    speed: document.querySelector<HTMLElement>("#mx-speed"),
    speedEarth: document.querySelector<HTMLElement>("#mx-speed-earth"),
    speedMoon: document.querySelector<HTMLElement>("#mx-speed-moon"),
    booster: document.querySelector<HTMLElement>("#mx-booster"),
    ship: document.querySelector<HTMLElement>("#mx-ship"),
    mass: document.querySelector<HTMLElement>("#mx-mass"),
    thrust: document.querySelector<HTMLElement>("#mx-thrust"),
    accel: document.querySelector<HTMLElement>("#mx-accel"),
    engines: document.querySelector<HTMLElement>("#mx-engines"),
    staged: document.querySelector<HTMLElement>("#mx-staged"),
    duration: document.querySelector<HTMLElement>("#mx-duration"),
    translunarInjectionDeltaV: document.querySelector<HTMLElement>(
      "#mx-translunar-injection-delta-v",
    ),
    minalt: document.querySelector<HTMLElement>("#mx-minalt"),
    peakSpeed: document.querySelector<HTMLElement>("#mx-peak-speed"),
    stageT: document.querySelector<HTMLElement>("#mx-stage-t"),
    keplerDev: document.querySelector<HTMLElement>("#mx-kepler-dev"),
    sky: document.querySelector<HTMLElement>("#mx-sky"),
    forceRow: document.querySelector<HTMLElement>("#mx-force-row"),
    forceCheck: document.querySelector<HTMLElement>("#mx-force-check"),
  };

  let scrubbing = false;
  let lastPhase: PhaseId | null = null;
  let lastMissionT = -1;
  /** Events already shown this pass (reset when scrubbing backward). */
  const firedEvents = new Set<string>();
  let calloutTimer: ReturnType<typeof setTimeout> | null = null;
  let camToastTimer: ReturnType<typeof setTimeout> | null = null;
  let completeShown = false;
  let keymapOpen = false;
  let metricsOpen = false;
  let crossSectionOpen = false;
  let hudVisible = true;
  let lastCamMode: CameraMode = "earth";
  /** UI mirror of Auto-cam; main is source of truth via setAutoCamEnabled. */
  let autoCamEnabled = true;

  function setAutoCamEnabled(enabled: boolean): void {
    if (autoCamEnabled === enabled) return;
    autoCamEnabled = enabled;
    if (btnAutoCam) {
      btnAutoCam.setAttribute("aria-pressed", enabled ? "true" : "false");
      btnAutoCam.title = enabled
        ? "Auto-cam on — guided framing by phase (G)"
        : "Auto-cam off — press G or click to re-enable";
      btnAutoCam.textContent = enabled ? "Auto-cam" : "Auto-cam off";
    }
  }

  function toggleAutoCam(): void {
    if (!handlers.onAutoCamToggle) return;
    const on = handlers.onAutoCamToggle();
    setAutoCamEnabled(on);
    showAutoCamToast(on);
  }

  function showAutoCamToast(on: boolean): void {
    if (!camToast || !camToastTitle) return;
    camToastTitle.textContent = on ? "Auto-cam on" : "Auto-cam off";
    if (camToastDetail) {
      camToastDetail.textContent = on
        ? "Camera follows mission phases"
        : "Manual focus · G to re-enable";
      camToastDetail.hidden = false;
    }
    camToast.hidden = false;
    camToast.classList.remove("cam-toast-out");
    void camToast.offsetWidth;
    camToast.classList.add("cam-toast-in");
    if (camToastTimer) clearTimeout(camToastTimer);
    camToastTimer = setTimeout(() => {
      camToast.classList.remove("cam-toast-in");
      camToast.classList.add("cam-toast-out");
      camToastTimer = setTimeout(() => {
        camToast.hidden = true;
        camToast.classList.remove("cam-toast-out");
      }, 300);
    }, CAM_TOAST_MS);
  }

  function setHudVisible(visible: boolean): void {
    hudVisible = visible;
    if (hudRoot) {
      hudRoot.classList.toggle("hud-hidden", !visible);
      hudRoot.setAttribute("aria-hidden", visible ? "false" : "true");
    }
  }

  function toggleHud(): void {
    setHudVisible(!hudVisible);
  }

  function setKeymapOpen(open: boolean): void {
    keymapOpen = open;
    if (keymapEl) keymapEl.hidden = !open;
    if (btnKeymap) {
      btnKeymap.setAttribute("aria-pressed", open ? "true" : "false");
    }
    if (hudRoot) {
      hudRoot.classList.toggle("keymap-open", open);
    }
    if (open) {
      setMetricsOpen(false);
      setCrossSectionOpen(false);
      setEarthGcOpen(false);
      setPolarMapOpen(false);
      // Draw after layout so canvas has real CSS size
      requestAnimationFrame(() => redrawKeymap());
    }
  }

  function toggleKeymap(): void {
    setKeymapOpen(!keymapOpen);
  }

  function redrawKeymap(): void {
    if (!keymapOpen || !keymapCtx || !keymapCanvas) return;
    const rect = keymapCanvas.getBoundingClientRect();
    const cssW = Math.max(rect.width, 320);
    const cssH = Math.max(rect.height, 200);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    drawVisualKeymap(keymapCtx, cssW, cssH, dpr);
  }

  function setMetricsOpen(open: boolean): void {
    metricsOpen = open;
    if (metricsEl) metricsEl.hidden = !open;
    if (open) {
      setKeymapOpen(false);
      setCrossSectionOpen(false);
      setEarthGcOpen(false);
      setPolarMapOpen(false);
    }
  }

  function toggleMetrics(): void {
    setMetricsOpen(!metricsOpen);
  }

  function setCrossSectionOpen(open: boolean): void {
    crossSectionOpen = open;
    if (crossSectionEl) crossSectionEl.hidden = !open;
    if (btnCrossSection) {
      btnCrossSection.setAttribute("aria-pressed", open ? "true" : "false");
    }
    if (hudRoot) {
      hudRoot.classList.toggle("cross-section-open", open);
    }
    if (open) {
      setKeymapOpen(false);
      setMetricsOpen(false);
      setEarthGcOpen(false);
      setPolarMapOpen(false);
    }
  }

  function toggleCrossSection(): void {
    setCrossSectionOpen(!crossSectionOpen);
  }

  function setEarthGcOpen(open: boolean): void {
    setEarthGcOverlayOpen(open);
    if (btnEarthGc) {
      btnEarthGc.setAttribute("aria-pressed", open ? "true" : "false");
    }
    if (hudRoot) {
      hudRoot.classList.toggle("earth-gc-open", open);
    }
    if (open) {
      setKeymapOpen(false);
      setMetricsOpen(false);
      setCrossSectionOpen(false);
      setPolarMapOpen(false);
    }
  }

  function toggleEarthGc(): void {
    setEarthGcOpen(!isEarthGcOverlayOpen());
  }

  function setPolarMapOpen(open: boolean): void {
    setPolarOverlayOpen(open);
    if (btnPolarMap) {
      btnPolarMap.setAttribute("aria-pressed", open ? "true" : "false");
    }
    if (hudRoot) {
      hudRoot.classList.toggle("polar-map-open", open);
    }
    if (open) {
      setKeymapOpen(false);
      setMetricsOpen(false);
      setCrossSectionOpen(false);
      setEarthGcOpen(false);
    }
  }

  function togglePolarMap(): void {
    setPolarMapOpen(!isPolarOverlayOpen());
  }

  /**
   * Tab theater cycle: main → ascent CS → Earth GC → Polar → KeyMap → main.
   * Metrics stays on M only (not in the cycle).
   */
  function cycleTheaterViews(): void {
    const earthGcOpen = isEarthGcOverlayOpen();
    const polarOpen = isPolarOverlayOpen();
    if (!crossSectionOpen && !earthGcOpen && !polarOpen && !keymapOpen) {
      setCrossSectionOpen(true);
    } else if (crossSectionOpen) {
      setCrossSectionOpen(false);
      setEarthGcOpen(true);
    } else if (earthGcOpen) {
      setEarthGcOpen(false);
      setPolarMapOpen(true);
    } else if (polarOpen) {
      setPolarMapOpen(false);
      setKeymapOpen(true);
    } else {
      setKeymapOpen(false);
    }
  }

  function redrawCrossSection(missionT: number): void {
    if (
      !crossSectionOpen ||
      !crossSectionCtx ||
      !crossSectionCanvas ||
      !crossModel
    ) {
      return;
    }
    const rect = crossSectionCanvas.getBoundingClientRect();
    const cssW = Math.max(rect.width, 320);
    const cssH = Math.max(rect.height, 200);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const live = liveCrossSection(
      crossModel,
      samples,
      stageState,
      missionT,
      boosterKeyframes,
      recoveryProfile,
    );
    drawCrossSection(
      crossSectionCtx,
      crossModel,
      live,
      missionT,
      cssW,
      cssH,
      dpr,
    );
  }

  if (markersEl) {
    renderPhaseMarkers(markersEl, timeline.segments);
  }
  if (eventsEl) {
    renderEventTicks(eventsEl, scrubEventTicks, (ev) => seekToEvent(ev));
  }
  if (bookmarksEl) {
    renderBookmarks(bookmarksEl, bookmarks, (bm) => jumpToBookmark(bm));
  }

  function setTelemetryDimmed(dimmed: boolean): void {
    telemetryEl?.classList.toggle("tel-dimmed", dimmed);
  }

  function setActiveEventTick(id: string | null): void {
    if (!eventsEl) return;
    for (const node of eventsEl.querySelectorAll<HTMLElement>("[data-event]")) {
      node.classList.toggle("active", node.dataset.event === id);
    }
  }

  /**
   * Seek scrubber to a narrative event, show its callout, and highlight the tick.
   * Marks the event as fired so playthrough does not re-toast immediately.
   */
  function seekToEvent(ev: MissionEvent): void {
    setActiveBookmark(null);
    scrub.value = String(Math.round(ev.u * 1000));
    handlers.onScrub(ev.u);
    firedEvents.add(ev.id);
    setActiveEventTick(ev.id);
    showCallout(ev);
  }

  function setActiveBookmark(id: string | null): void {
    if (!bookmarksEl) return;
    for (const node of bookmarksEl.querySelectorAll<HTMLElement>("[data-bookmark]")) {
      node.classList.toggle("active", node.dataset.bookmark === id);
    }
  }

  function showBookmarkToast(bm: CinematicBookmark): void {
    if (!camToast || !camToastTitle) return;
    camToastTitle.textContent = `Bookmark · ${bm.label}`;
    if (camToastDetail) {
      camToastDetail.textContent = `${formatMissionTime(bm.t)} · seek + camera`;
      camToastDetail.hidden = false;
    }
    camToast.hidden = false;
    camToast.classList.remove("cam-toast-out");
    void camToast.offsetWidth;
    camToast.classList.add("cam-toast-in");
    if (camToastTimer) clearTimeout(camToastTimer);
    camToastTimer = setTimeout(() => {
      camToast.classList.remove("cam-toast-in");
      camToast.classList.add("cam-toast-out");
      camToastTimer = setTimeout(() => {
        camToast.hidden = true;
        camToast.classList.remove("cam-toast-out");
      }, 300);
    }, CAM_TOAST_MS);
  }

  function jumpToBookmark(bm: CinematicBookmark): void {
    setActiveBookmark(bm.id);
    setActiveEventTick(null);
    scrub.value = String(Math.round(bm.u * 1000));
    if (handlers.onBookmark) {
      handlers.onBookmark(bm);
    } else {
      handlers.onScrub(bm.u);
    }
    showBookmarkToast(bm);
  }

  if (btnPlay) {
    btnPlay.addEventListener("click", () => handlers.onPlayToggle());
  }
  if (btnAutoCam) {
    btnAutoCam.addEventListener("click", () => toggleAutoCam());
    setAutoCamEnabled(true);
  }
  if (btnCrossSection) {
    btnCrossSection.addEventListener("click", () => toggleCrossSection());
  }
  if (btnKeymap) {
    btnKeymap.addEventListener("click", () => toggleKeymap());
  }
  speed.addEventListener("change", () => {
    handlers.onSpeedMode(parseSpeedMode(speed.value));
  });

  scrub.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  scrub.addEventListener("pointerup", () => {
    scrubbing = false;
  });
  scrub.addEventListener("input", () => {
    setActiveBookmark(null);
    setActiveEventTick(null);
    handlers.onScrub(Number(scrub.value) / 1000);
  });

  if (keymapClose) {
    keymapClose.addEventListener("click", () => setKeymapOpen(false));
  }
  if (keymapEl) {
    keymapEl.addEventListener("click", (ev) => {
      // Backdrop click closes; clicks inside the card do not
      if (ev.target === keymapEl) setKeymapOpen(false);
    });
  }
  if (metricsClose) {
    metricsClose.addEventListener("click", () => setMetricsOpen(false));
  }
  if (metricsEl) {
    metricsEl.addEventListener("click", (ev) => {
      if (ev.target === metricsEl) setMetricsOpen(false);
    });
  }
  if (crossSectionClose) {
    crossSectionClose.addEventListener("click", () => setCrossSectionOpen(false));
  }
  if (crossSectionEl) {
    crossSectionEl.addEventListener("click", (ev) => {
      if (ev.target === crossSectionEl) setCrossSectionOpen(false);
    });
  }
  if (btnEarthGc) {
    btnEarthGc.addEventListener("click", () => toggleEarthGc());
  }
  if (btnPolarMap) {
    btnPolarMap.addEventListener("click", () => togglePolarMap());
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    // Don't steal typing from form controls. Scrubber (range) stays open to
    // shortcuts so Tab still cycles views after seeking.
    const t = e.target;
    if (
      (t instanceof HTMLInputElement && t.type !== "range") ||
      t instanceof HTMLSelectElement ||
      t instanceof HTMLTextAreaElement
    ) {
      return;
    }
    // Tab cycles main → ascent CS → Earth GC → Polar → KeyMap → main
    if (e.key === "Tab") {
      e.preventDefault();
      cycleTheaterViews();
      return;
    }
    if (e.key === "h" || e.key === "H") {
      e.preventDefault();
      toggleHud();
      return;
    }
    if (e.key === "k" || e.key === "K") {
      e.preventDefault();
      toggleKeymap();
      return;
    }
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleMetrics();
      return;
    }
    if (
      e.key === "Escape" &&
      (keymapOpen ||
        metricsOpen ||
        crossSectionOpen ||
        isEarthGcOverlayOpen() ||
        isPolarOverlayOpen())
    ) {
      e.preventDefault();
      if (crossSectionOpen) setCrossSectionOpen(false);
      else if (isEarthGcOverlayOpen()) setEarthGcOpen(false);
      else if (isPolarOverlayOpen()) setPolarMapOpen(false);
      else if (metricsOpen) setMetricsOpen(false);
      else setKeymapOpen(false);
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      handlers.onPlayToggle();
    } else if (e.code === "Backquote" || e.key === "`" || e.key === "~") {
      // ` cycle cameras (Shift+` still cycles — same order as 1–8)
      e.preventDefault();
      cycleCamera();
    } else if (e.shiftKey && e.code.startsWith("Digit")) {
      // Shift+1… — use e.code (Shift+1 is "!" on many layouts, not "1")
      const digit = Number(e.code.slice("Digit".length));
      const bm = bookmarkForShiftDigit(bookmarks, digit);
      if (bm) {
        e.preventDefault();
        jumpToBookmark(bm);
      }
    } else if (e.key === "1") {
      handleCameraKey("sun", "1");
    } else if (e.key === "2") {
      handleCameraKey("moon", "2");
    } else if (e.key === "3") {
      handleCameraKey("earth", "3");
    } else if (e.key === "4") {
      handleCameraKey("starbase", "4");
    } else if (e.key === "5") {
      handleCameraKey("trench", "5");
    } else if (e.key === "6") {
      handleCameraKey("gridfin", "6");
    } else if (e.key === "7") {
      handleCameraKey("chase", "7");
    } else if (e.key === "8") {
      handleCameraKey("fin", "8");
    } else if (e.key === "q" || e.key === "Q") {
      handlers.onOrbitKey("q", true);
    } else if (e.key === "e" || e.key === "E") {
      handlers.onOrbitKey("e", true);
    } else if (e.key === "r" || e.key === "R") {
      handlers.onOrbitKey("r", true);
    } else if (e.key === "f" || e.key === "F") {
      handlers.onOrbitKey("f", true);
    } else if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      handlers.onOrbitKey("c", true);
    } else if (e.key === "v" || e.key === "V") {
      e.preventDefault();
      handlers.onOrbitKey("v", true);
    } else if (e.key === "w" || e.key === "W") {
      noteCameraMode(handlers.onPanKey("w", true));
    } else if (e.key === "a" || e.key === "A") {
      noteCameraMode(handlers.onPanKey("a", true));
    } else if (e.key === "s" || e.key === "S") {
      noteCameraMode(handlers.onPanKey("s", true));
    } else if (e.key === "d" || e.key === "D") {
      noteCameraMode(handlers.onPanKey("d", true));
    } else if (e.key === "z" || e.key === "Z") {
      handlers.onZoomKey("z", true);
    } else if (e.key === "x" || e.key === "X") {
      handlers.onZoomKey("x", true);
    } else if (e.key === "," || e.key === "<") {
      e.preventDefault();
      const next = handlers.onSpeedNudge(-1);
      speed.value = String(next);
    } else if (e.key === "." || e.key === ">") {
      e.preventDefault();
      const next = handlers.onSpeedNudge(1);
      speed.value = String(next);
    } else if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      handlers.onToggleLabels?.();
    } else if (e.key === "o" || e.key === "O") {
      e.preventDefault();
      handlers.onToggleOrbits?.();
    } else if (e.key === "g" || e.key === "G") {
      e.preventDefault();
      toggleAutoCam();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "q" || e.key === "Q") {
      handlers.onOrbitKey("q", false);
    } else if (e.key === "e" || e.key === "E") {
      handlers.onOrbitKey("e", false);
    } else if (e.key === "r" || e.key === "R") {
      handlers.onOrbitKey("r", false);
    } else if (e.key === "f" || e.key === "F") {
      handlers.onOrbitKey("f", false);
    } else if (e.key === "c" || e.key === "C") {
      handlers.onOrbitKey("c", false);
    } else if (e.key === "v" || e.key === "V") {
      handlers.onOrbitKey("v", false);
    } else if (e.key === "w" || e.key === "W") {
      handlers.onPanKey("w", false);
    } else if (e.key === "a" || e.key === "A") {
      handlers.onPanKey("a", false);
    } else if (e.key === "s" || e.key === "S") {
      handlers.onPanKey("s", false);
    } else if (e.key === "d" || e.key === "D") {
      handlers.onPanKey("d", false);
    } else if (e.key === "z" || e.key === "Z") {
      handlers.onZoomKey("z", false);
    } else if (e.key === "x" || e.key === "X") {
      handlers.onZoomKey("x", false);
    }
  });

  window.addEventListener("blur", () => {
    handlers.onOrbitKey("q", false);
    handlers.onOrbitKey("e", false);
    handlers.onOrbitKey("r", false);
    handlers.onOrbitKey("f", false);
    handlers.onOrbitKey("c", false);
    handlers.onOrbitKey("v", false);
    handlers.onPanKey("w", false);
    handlers.onPanKey("a", false);
    handlers.onPanKey("s", false);
    handlers.onPanKey("d", false);
    handlers.onZoomKey("z", false);
    handlers.onZoomKey("x", false);
  });

  // Initial rate from select (defaults to 1× in HTML)
  handlers.onSpeedMode(parseSpeedMode(speed.value));

  if (mcReplay) {
    mcReplay.addEventListener("click", () => {
      handlers.onScrub(0);
      // Start playback if paused
      if (!lastPlaying) {
        handlers.onPlayToggle();
      }
      if (completeEl) completeEl.hidden = true;
      completeShown = false;
    });
  }

  function hideCallout(): void {
    if (!callout) return;
    callout.hidden = true;
    callout.classList.remove("callout-out", "callout-in");
    activeCalloutEvent = null;
    setTelemetryDimmed(false);
    setActiveEventTick(null);
  }

  function showCallout(ev: MissionEvent): void {
    if (!callout || !calloutTitle) return;
    activeCalloutEvent = ev;
    calloutTitle.textContent = ev.title;
    if (calloutDetail) {
      calloutDetail.textContent = ev.detail ?? "";
      calloutDetail.hidden = !ev.detail;
    }
    callout.title = `Jump to ${ev.title} · ${formatMissionTime(ev.t)}`;
    callout.setAttribute(
      "aria-label",
      `Mission event: ${ev.title}. Activate to jump to ${formatMissionTime(ev.t)}`,
    );
    callout.hidden = false;
    callout.classList.remove("callout-out");
    // retrigger enter animation
    void callout.offsetWidth;
    callout.classList.add("callout-in");
    setTelemetryDimmed(true);
    setActiveEventTick(ev.id);
    if (calloutTimer) clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => {
      callout.classList.remove("callout-in");
      callout.classList.add("callout-out");
      calloutTimer = setTimeout(() => {
        hideCallout();
      }, 320);
    }, CALLOUT_MS);
  }

  if (callout) {
    callout.addEventListener("click", (e) => {
      e.preventDefault();
      if (!activeCalloutEvent) return;
      seekToEvent(activeCalloutEvent);
    });
    callout.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (!activeCalloutEvent) return;
      seekToEvent(activeCalloutEvent);
    });
  }

  const CAMERA_LABELS: Record<
    CameraMode,
    { title: string; detail: string }
  > = {
    free: { title: "Free camera", detail: "WASD pan · drag to look" },
    sun: { title: "Sun", detail: "Focus · key 1 · double-tap to frame" },
    moon: { title: "Moon", detail: "Focus · key 2 · double-tap to frame" },
    earth: { title: "Earth", detail: "Focus · key 3 · double-tap to frame" },
    starbase: {
      title: "Starbase",
      detail: "Pad · key 4 · double-tap to frame",
    },
    trench: {
      title: "Launchpad",
      detail: "Flame trench · engines side · key 5",
    },
    gridfin: {
      title: "Booster",
      detail: "Grid fin · aft engines · key 6",
    },
    chase: {
      title: "Starship",
      detail: "Chase · key 7 · double-tap to frame",
    },
    fin: { title: "Ship fin", detail: "Aft engines · key 8" },
  };

  /** Double-tap window for number-key frame zoom (ms). */
  const CAM_DOUBLE_TAP_MS = 380;
  let lastCamKey: string | null = null;
  let lastCamKeyT = 0;

  function showCameraToast(mode: CameraMode, framed = false): void {
    if (!camToast || !camToastTitle) return;
    const info = CAMERA_LABELS[mode];
    camToastTitle.textContent = framed ? `${info.title} · framed` : info.title;
    if (camToastDetail) {
      camToastDetail.textContent = framed
        ? "Zoom matched to object size"
        : info.detail;
      camToastDetail.hidden = false;
    }
    camToast.hidden = false;
    camToast.classList.remove("cam-toast-out");
    void camToast.offsetWidth;
    camToast.classList.add("cam-toast-in");
    if (camToastTimer) clearTimeout(camToastTimer);
    camToastTimer = setTimeout(() => {
      camToast.classList.remove("cam-toast-in");
      camToast.classList.add("cam-toast-out");
      camToastTimer = setTimeout(() => {
        camToast.hidden = true;
        camToast.classList.remove("cam-toast-out");
      }, 300);
    }, CAM_TOAST_MS);
  }

  function noteCameraMode(mode: CameraMode): void {
    if (mode === lastCamMode) return;
    lastCamMode = mode;
    showCameraToast(mode);
  }

  function switchCamera(mode: CameraMode): void {
    handlers.onCamera(mode);
    lastCamMode = mode;
    showCameraToast(mode, false);
  }

  /** Focus + size-relative zoom (double-tap 1–6). */
  function frameCamera(mode: CameraMode): void {
    if (handlers.onCameraFrame) handlers.onCameraFrame(mode);
    else handlers.onCamera(mode);
    lastCamMode = mode;
    showCameraToast(mode, true);
  }

  /** Auto-cam cut: toast only (does not disable Auto-cam). */
  function notifyAutoCamera(mode: CameraMode): void {
    lastCamMode = mode;
    if (!camToast || !camToastTitle) return;
    const info = CAMERA_LABELS[mode];
    camToastTitle.textContent = `Auto · ${info.title}`;
    if (camToastDetail) {
      camToastDetail.textContent = "Guided phase camera";
      camToastDetail.hidden = false;
    }
    camToast.hidden = false;
    camToast.classList.remove("cam-toast-out");
    void camToast.offsetWidth;
    camToast.classList.add("cam-toast-in");
    if (camToastTimer) clearTimeout(camToastTimer);
    camToastTimer = setTimeout(() => {
      camToast.classList.remove("cam-toast-in");
      camToast.classList.add("cam-toast-out");
      camToastTimer = setTimeout(() => {
        camToast.hidden = true;
        camToast.classList.remove("cam-toast-out");
      }, 300);
    }, CAM_TOAST_MS);
  }

  /** Focus modes cycled by ` (backtick) — same order as number keys 1–8. */
  const CAMERA_CYCLE: readonly CameraMode[] = [
    "sun",
    "moon",
    "earth",
    "starbase",
    "trench",
    "gridfin",
    "chase",
    "fin",
  ];

  /** Advance focus to the next preset (skip free / unlisted). */
  function cycleCamera(): void {
    const i = CAMERA_CYCLE.indexOf(lastCamMode);
    const next = CAMERA_CYCLE[(i < 0 ? 0 : i + 1) % CAMERA_CYCLE.length]!;
    switchCamera(next);
  }

  /**
   * Single tap: switch focus (keep zoom). Double-tap same key: frame object.
   */
  function handleCameraKey(mode: CameraMode, key: string): void {
    const now = performance.now();
    const isDouble =
      lastCamKey === key && now - lastCamKeyT <= CAM_DOUBLE_TAP_MS;
    lastCamKey = key;
    lastCamKeyT = now;
    if (isDouble) frameCamera(mode);
    else switchCamera(mode);
  }

  function maybeFireEvents(missionT: number, playing: boolean): void {
    // Rewound: allow events ahead of the new time to fire again
    if (lastMissionT >= 0 && missionT + 1e-3 < lastMissionT) {
      for (const ev of timeline.events) {
        if (ev.t > missionT) firedEvents.delete(ev.id);
      }
    }
    lastMissionT = missionT;

    for (const ev of timeline.events) {
      if (firedEvents.has(ev.id)) continue;
      if (missionT + 0.05 < ev.t) continue;

      const age = missionT - ev.t;
      // Jumping far past a milestone: mark seen, no toast spam
      if (age > 12) {
        firedEvents.add(ev.id);
        continue;
      }
      // Hold callouts until play/scrub so page load doesn't flash Liftoff
      if (!playing && !scrubbing) continue;

      firedEvents.add(ev.id);
      showCallout(ev);
    }
  }

  function applyNewsTickerRate(playbackRate: number, playing: boolean): void {
    if (!newsTrackEl) return;
    const rate = Number.isFinite(playbackRate) ? playbackRate : 1;
    const period = newsTickerPeriodS(rate);
    const dir = rate < 0 ? "reverse" : "normal";
    newsTrackEl.style.setProperty("--news-ticker-dur", `${period}s`);
    newsTrackEl.style.setProperty("--news-ticker-dir", dir);
    // Pause when stopped or rate is effectively zero
    const paused = !playing || Math.abs(rate) < 1e-6;
    newsTrackEl.classList.toggle("news-ticker-pause", paused);
    lastNewsRate = rate;
  }

  function updateNewsTicker(
    missionT: number,
    playing: boolean,
    playbackRate: number,
  ): void {
    if (!newsTickerEl || !newsTextEl) return;
    const beat = newsAtMissionTime(newsBeats, missionT);
    if (!beat) {
      newsTickerEl.hidden = true;
      return;
    }
    newsTickerEl.hidden = false;
    // Crawl: current + short trail so the marquee stays dense
    const crawl = formatTickerCrawl(newsBeats, missionT, 2);
    const line = crawl || beat.line;
    const textChanged =
      beat.id !== lastNewsId || newsTextEl.textContent !== line;
    if (textChanged) {
      lastNewsId = beat.id;
      newsTextEl.textContent = line;
      if (newsTextDupEl) newsTextDupEl.textContent = line;
    }
    const rateChanged =
      !Number.isFinite(lastNewsRate) ||
      Math.abs(lastNewsRate - playbackRate) > 1e-9;
    if (textChanged || rateChanged) {
      // Re-bind animation so duration/direction take effect cleanly
      if (newsTrackEl) {
        newsTrackEl.style.animation = "none";
        void newsTrackEl.offsetWidth;
        newsTrackEl.style.animation = "";
      }
    }
    applyNewsTickerRate(playbackRate, playing);
  }

  function update(tel: Telemetry): void {
    const u = tel.durationS > 0 ? tel.t / tel.durationS : 0;
    phaseEl.textContent = tel.phase;
    if (missionClockEl) {
      missionClockEl.textContent = formatWebcastMissionTime(tel.t);
    }
    updateNewsTicker(tel.t, tel.playing, tel.playbackSpeed);
    if (dateEl) dateEl.textContent = tel.dateUtc;
    distEl.textContent = formatDistance(tel.distanceToMoon);
    progEl.textContent = formatProgressPercent(tel.t, tel.durationS);
    altEl.textContent = formatDistance(Math.max(0, tel.altitude));
    if (camEl) camEl.textContent = formatFocusDistance(tel.focusDistance);
    spdEl.textContent = formatSpeed(tel.speed);
    boosterEl.textContent = formatFuel(tel.fuelBooster, "booster");
    shipEl.textContent = formatFuel(tel.fuelShip, "ship");
    thrustEl.textContent = formatThrust(tel.thrustN);
    // Sky phase (Sun / Moon) — live at scrubber time
    if (skyEl) {
      try {
        skyEl.textContent = formatSkyPhaseLine(Math.max(0, tel.t));
      } catch {
        skyEl.textContent = "—";
      }
    }
    if (barBooster) {
      barBooster.style.width = fuelBarWidthPercent(tel.fuelBooster);
    }
    if (barShip) {
      barShip.style.width = fuelBarWidthPercent(tel.fuelShip);
    }

    lastPlaying = tel.playing;
    if (btnPlay) {
      btnPlay.textContent = tel.playing ? "Pause" : "Play";
      btnPlay.setAttribute("aria-pressed", tel.playing ? "true" : "false");
    }

    // Mission complete panel (main delays this until landing-beat hold elapses)
    if (completeEl) {
      if (tel.missionComplete) {
        if (!completeShown) {
          completeShown = true;
          if (mcSub) {
            mcSub.textContent = landingBeatCompleteSubtitle(tel.completeKind, {
              splashdown: tel.phaseId === "splashdown",
            });
          }
          if (mcDuration) mcDuration.textContent = formatMissionTime(tel.durationS);
          if (mcTranslunarInjectionDeltaV) {
            mcTranslunarInjectionDeltaV.textContent = formatTranslunarInjectionDv(
              tel.translunarInjectionDeltaV,
            );
          }
          if (mcMinAlt) {
            mcMinAlt.textContent = formatMinMoonAlt(tel.minMoonAlt);
          }
          if (mcFuel) mcFuel.textContent = formatFuel(tel.fuelShip, "ship");
          if (mcPeakSpeed) {
            mcPeakSpeed.textContent = formatOptional(
              tel.peakSpeedKmS,
              formatSpeed,
            );
          }
          if (mcStageT) {
            mcStageT.textContent = formatOptional(
              tel.stageT,
              formatMissionTime,
            );
          }
          if (mcSky) {
            try {
              // Phase at terminal mission time (landing / splash)
              mcSky.textContent = formatSkyPhaseLine(
                Math.max(0, tel.durationS > 0 ? tel.durationS : tel.t),
              );
            } catch {
              mcSky.textContent = "—";
            }
          }
        }
        completeEl.hidden = false;
      } else {
        completeEl.hidden = true;
        completeShown = false;
      }
    }

    // Keep the speed select in sync with keyboard nudges
    const rateStr = String(tel.playbackSpeed);
    if (
      speed.value !== rateStr &&
      speed.querySelector(`option[value="${rateStr}"]`)
    ) {
      speed.value = rateStr;
    }

    if (!scrubbing) {
      scrub.value = String(Math.round(Math.min(1, u) * 1000));
    }

    // Highlight active phase marker
    if (markersEl && tel.phaseId !== lastPhase) {
      lastPhase = tel.phaseId;
      for (const node of markersEl.querySelectorAll<HTMLElement>("[data-phase]")) {
        node.classList.toggle("active", node.dataset.phase === tel.phaseId);
      }
    }

    maybeFireEvents(tel.t, tel.playing);

    if (metricsOpen) updateMetrics(tel);
    if (crossSectionOpen) redrawCrossSection(tel.t);
    if (isEarthGcOverlayOpen()) redrawEarthGcOverlay();
    setPolarOverlayMissionT(tel.t);
    if (isPolarOverlayOpen()) redrawPolarOverlay();
    if (keymapOpen) redrawKeymap();
  }

  function updateMetrics(tel: Telemetry): void {
    const rEarth = R_EARTH + tel.altEarth;
    const rMoon = tel.distMoon;
    const boosterKg = clamp01(tel.fuelBooster) * BOOSTER_PROP_KG;
    const shipKg = clamp01(tel.fuelShip) * SHIP_PROP_KG;
    const wetKg = wetMassFromFuel(
      tel.fuelBooster,
      tel.fuelShip,
      tel.staged,
      BOOSTER_DRY_KG,
      BOOSTER_PROP_KG,
      SHIP_DRY_KG,
      SHIP_PROP_KG,
    );
    const accelG = thrustAccelG(tel.thrustN, wetKg);

    setText(mx.phase, tel.phase);
    setText(mx.time, formatMissionTimeDetailed(tel.t));
    setText(mx.date, tel.dateUtc);
    try {
      setText(mx.sky, formatSkyPhaseLine(Math.max(0, tel.t)));
    } catch {
      setText(mx.sky, "—");
    }
    setText(
      mx.progress,
      formatProgressRemainingLine(tel.t, tel.durationS),
    );
    setText(
      mx.playback,
      formatPlaybackLine(tel.playbackSpeed, tel.playing),
    );
    setText(mx.altEarth, formatDistancePrecise(tel.altEarth));
    setText(mx.rEarth, formatDistancePrecise(rEarth));
    setText(mx.altMoon, formatDistancePrecise(tel.altMoon));
    setText(mx.distMoon, formatDistancePrecise(Math.max(0, rMoon - R_MOON)));
    setText(mx.rMoon, formatDistancePrecise(rMoon));
    setText(mx.cam, formatFocusDistance(tel.focusDistance));
    setText(mx.speed, formatSpeedPrecise(tel.speed));
    setText(mx.speedEarth, formatSpeedPrecise(tel.speedEarth));
    setText(mx.speedMoon, formatSpeedPrecise(tel.speedMoon));
    setText(
      mx.booster,
      tel.staged
        ? "staged · empty"
        : formatFuelDetailed(tel.fuelBooster, boosterKg, BOOSTER_PROP_KG),
    );
    setText(
      mx.ship,
      formatFuelDetailed(tel.fuelShip, shipKg, SHIP_PROP_KG),
    );
    setText(mx.mass, formatMassKg(wetKg));
    setText(mx.thrust, formatThrustDetailed(tel.thrustN));
    setText(mx.accel, formatAccelG(accelG));
    setText(
      mx.engines,
      tel.burning && tel.thrustN > 500 ? "burning" : "coast / idle",
    );
    setText(mx.staged, tel.staged ? "yes · ship only" : "no · full stack");
    setText(mx.duration, formatMissionTimeDetailed(tel.durationS));
    setText(
      mx.translunarInjectionDeltaV,
      formatTranslunarInjectionDvDetailed(tel.translunarInjectionDeltaV),
    );
    setText(
      mx.minalt,
      Number.isFinite(tel.minMoonAlt)
        ? formatDistancePrecise(Math.max(0, tel.minMoonAlt))
        : "—",
    );
    setText(
      mx.peakSpeed,
      formatOptional(tel.peakSpeedKmS, formatSpeedPrecise),
    );
    setText(
      mx.stageT,
      formatOptional(tel.stageT, formatMissionTimeDetailed),
    );
    setText(
      mx.keplerDev,
      tel.keplerRefMaxDevKm != null &&
        Number.isFinite(tel.keplerRefMaxDevKm) &&
        tel.keplerRefMaxDevKm > 0
        ? formatDistancePrecise(tel.keplerRefMaxDevKm)
        : "—",
    );
    // Flight 13: n-body vs Earth-only force check (optional)
    if (mx.forceRow && mx.forceCheck) {
      const line = tel.forceCompareLine?.trim();
      if (line) {
        mx.forceRow.hidden = false;
        mx.forceCheck.textContent = line;
      } else {
        mx.forceRow.hidden = true;
        mx.forceCheck.textContent = "—";
      }
    }
  }

  return { update, setAutoCamEnabled, notifyAutoCamera };
}

function setText(node: HTMLElement | null, text: string): void {
  if (node) node.textContent = text;
}

function renderPhaseMarkers(
  root: HTMLElement,
  segments: PhaseSegment[],
): void {
  root.replaceChildren();
  // Prefer one marker per phase start; hide ultra-short / overlapping labels
  const major = new Set<PhaseId>([
    "launch",
    "ascent",
    "lowEarthOrbit",
    "translunarInjection",
    "coast",
    "approach",
    "braking",
    "descent",
    "landed",
    "impact",
  ]);

  for (const seg of segments) {
    if (!major.has(seg.phase)) continue;
    // Skip labels that would stack (very short phases under ~0.4% width)
    const widthPct = (seg.u1 - seg.u0) * 100;
    const mark = document.createElement("button");
    mark.type = "button";
    mark.className = "scrub-mark";
    mark.dataset.phase = seg.phase;
    mark.style.left = `${(seg.u0 * 100).toFixed(3)}%`;
    mark.title = `${seg.label} · ${formatMissionTime(seg.t0)}`;
    mark.setAttribute("aria-label", `Jump to ${seg.label}`);

    const tick = document.createElement("span");
    tick.className = "scrub-tick";
    mark.appendChild(tick);

    // Only label if there's room (coast always labeled; short burns tick-only if cramped)
    if (widthPct >= 2.2 || seg.phase === "coast" || seg.phase === "ascent") {
      const lab = document.createElement("span");
      lab.className = "scrub-lab";
      lab.textContent = seg.shortLabel;
      mark.appendChild(lab);
    }

    mark.addEventListener("click", (e) => {
      e.preventDefault();
      const scrub = document.querySelector<HTMLInputElement>("#scrub");
      if (!scrub) return;
      const u = seg.u0;
      scrub.value = String(Math.round(u * 1000));
      scrub.dispatchEvent(new Event("input", { bubbles: true }));
    });

    root.appendChild(mark);
  }
}

/** Subtle event ticks under the scrubber range (click → seek + callout). */
function renderEventTicks(
  root: HTMLElement,
  ticks: ReturnType<typeof buildScrubEventTicks>,
  onSeek: (ev: MissionEvent) => void,
): void {
  root.replaceChildren();
  for (const tick of ticks) {
    const ev = tick.event;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = tick.secondary
      ? "scrub-event scrub-event-secondary"
      : "scrub-event";
    btn.dataset.event = ev.id;
    btn.style.left = `${(ev.u * 100).toFixed(3)}%`;
    btn.title = `${ev.title}${ev.detail ? ` · ${ev.detail}` : ""} · ${formatMissionTime(ev.t)}`;
    btn.setAttribute(
      "aria-label",
      `Jump to ${ev.title} at ${formatMissionTime(ev.t)}`,
    );

    const dot = document.createElement("span");
    dot.className = "scrub-event-tick";
    btn.appendChild(dot);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSeek(ev);
    });

    root.appendChild(btn);
  }
}

/** Compact seek+camera buttons under the scrubber (Pad · Stage · translunar injection · …). */
function renderBookmarks(
  root: HTMLElement,
  bookmarks: CinematicBookmark[],
  onJump: (bm: CinematicBookmark) => void,
): void {
  root.replaceChildren();
  if (bookmarks.length === 0) {
    root.hidden = true;
    return;
  }
  root.hidden = false;

  bookmarks.forEach((bm, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bookmark-btn";
    btn.dataset.bookmark = bm.id;
    btn.textContent = bm.shortLabel;
    const keyHint = i < 9 ? `Shift+${i + 1}` : "";
    btn.title = keyHint
      ? `${bm.label} · ${formatMissionTime(bm.t)} · ${keyHint}`
      : `${bm.label} · ${formatMissionTime(bm.t)}`;
    btn.setAttribute(
      "aria-label",
      `Bookmark ${bm.label} at ${formatMissionTime(bm.t)}`,
    );
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onJump(bm);
    });
    root.appendChild(btn);
  });
}

function el<T extends HTMLElement>(sel: string): T {
  const node = document.querySelector(sel);
  if (!node) throw new Error(`Missing element ${sel}`);
  return node as T;
}

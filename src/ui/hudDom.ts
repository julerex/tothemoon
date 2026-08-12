/**
 * DOM queries for {@link bindHud}. Split so each collector stays short.
 */

export type HudButtons = {
  btnPlay: HTMLButtonElement | null;
  btnAutoCam: HTMLButtonElement | null;
  btnCrossSection: HTMLButtonElement | null;
  btnEarthGc: HTMLButtonElement | null;
  btnPolarMap: HTMLButtonElement | null;
  btnKeymap: HTMLButtonElement | null;
};

export type HudTransport = {
  speed: HTMLSelectElement;
  scrub: HTMLInputElement;
  markersEl: HTMLElement | null;
  eventsEl: HTMLElement | null;
  bookmarksEl: HTMLElement | null;
};

export type HudTelStrip = {
  phaseEl: HTMLElement;
  missionClockEl: HTMLElement | null;
  missionClockRateEl: HTMLElement | null;
  newsTickerEl: HTMLElement | null;
  newsTextEl: HTMLElement | null;
  newsTextDupEl: HTMLElement | null;
  newsTrackEl: HTMLElement | null;
  dateEl: HTMLElement | null;
  distEl: HTMLElement;
  progEl: HTMLElement;
  altEl: HTMLElement;
  camEl: HTMLElement | null;
  spdEl: HTMLElement;
  boosterEl: HTMLElement;
  shipEl: HTMLElement;
  thrustEl: HTMLElement;
  skyEl: HTMLElement | null;
  barBooster: HTMLElement | null;
  barShip: HTMLElement | null;
  telemetryEl: HTMLElement | null;
};

export type HudCalloutToast = {
  callout: HTMLElement | null;
  calloutTitle: HTMLElement | null;
  calloutDetail: HTMLElement | null;
  camToast: HTMLElement | null;
  camToastTitle: HTMLElement | null;
  camToastDetail: HTMLElement | null;
};

export type HudCompleteCard = {
  completeEl: HTMLElement | null;
  mcSub: HTMLElement | null;
  mcDuration: HTMLElement | null;
  mcTranslunarInjectionDeltaV: HTMLElement | null;
  mcMinAlt: HTMLElement | null;
  mcFuel: HTMLElement | null;
  mcPeakSpeed: HTMLElement | null;
  mcStageT: HTMLElement | null;
  mcSky: HTMLElement | null;
  mcReplay: HTMLButtonElement | null;
};

export type HudOverlays = {
  hudRoot: HTMLElement | null;
  keymapEl: HTMLElement | null;
  keymapClose: HTMLButtonElement | null;
  keymapCanvas: HTMLCanvasElement | null;
  keymapCtx: CanvasRenderingContext2D | null;
  metricsEl: HTMLElement | null;
  metricsClose: HTMLButtonElement | null;
  crossSectionEl: HTMLElement | null;
  crossSectionClose: HTMLButtonElement | null;
  crossSectionCanvas: HTMLCanvasElement | null;
  crossSectionCtx: CanvasRenderingContext2D | null;
};

export type MetricsDom = {
  phase: HTMLElement | null;
  time: HTMLElement | null;
  date: HTMLElement | null;
  progress: HTMLElement | null;
  playback: HTMLElement | null;
  altEarth: HTMLElement | null;
  rEarth: HTMLElement | null;
  altMoon: HTMLElement | null;
  distMoon: HTMLElement | null;
  rMoon: HTMLElement | null;
  cam: HTMLElement | null;
  speed: HTMLElement | null;
  speedEarth: HTMLElement | null;
  speedMoon: HTMLElement | null;
  booster: HTMLElement | null;
  ship: HTMLElement | null;
  mass: HTMLElement | null;
  thrust: HTMLElement | null;
  accel: HTMLElement | null;
  engines: HTMLElement | null;
  staged: HTMLElement | null;
  duration: HTMLElement | null;
  translunarInjectionDeltaV: HTMLElement | null;
  minalt: HTMLElement | null;
  peakSpeed: HTMLElement | null;
  stageT: HTMLElement | null;
  keplerDev: HTMLElement | null;
  sky: HTMLElement | null;
  forceRow: HTMLElement | null;
  forceCheck: HTMLElement | null;
};

export type HudDom = HudButtons &
  HudTransport &
  HudTelStrip &
  HudCalloutToast &
  HudCompleteCard &
  HudOverlays;

function q<T extends Element>(sel: string): T | null {
  return document.querySelector<T>(sel);
}

/** Required element; throws when missing (critical chrome). */
export function el<T extends HTMLElement>(sel: string): T {
  const node = document.querySelector(sel);
  if (!node) throw new Error(`Missing element ${sel}`);
  return node as T;
}

function collectButtons(): HudButtons {
  return {
    btnPlay: q("#btn-play"),
    btnAutoCam: q("#btn-auto-cam"),
    btnCrossSection: q("#btn-cross-section"),
    btnEarthGc: q("#btn-earth-gc"),
    btnPolarMap: q("#btn-polar-map"),
    btnKeymap: q("#btn-keymap"),
  };
}

function collectTransport(): HudTransport {
  return {
    speed: el<HTMLSelectElement>("#speed"),
    scrub: el<HTMLInputElement>("#scrub"),
    markersEl: q("#scrub-markers"),
    eventsEl: q("#scrub-events"),
    bookmarksEl: q("#bookmarks"),
  };
}

function collectTelStripA(): Pick<
  HudTelStrip,
  | "phaseEl"
  | "missionClockEl"
  | "missionClockRateEl"
  | "newsTickerEl"
  | "newsTextEl"
  | "newsTextDupEl"
  | "newsTrackEl"
  | "dateEl"
  | "distEl"
  | "progEl"
> {
  return {
    phaseEl: el("#phase"),
    missionClockEl: q("#mission-clock-value"),
    missionClockRateEl: q("#mission-clock-rate"),
    newsTickerEl: q("#news-ticker"), newsTextEl: q("#news-ticker-text"),
    newsTextDupEl: q("#news-ticker-text-dup"), newsTrackEl: q("#news-ticker-track"),
    dateEl: q("#date"), distEl: el("#distance"), progEl: el("#progress"),
  };
}

function collectTelStripB(): Omit<
  HudTelStrip,
  keyof ReturnType<typeof collectTelStripA>
> {
  return {
    altEl: el("#tel-altitude"), camEl: q("#tel-cam"), spdEl: el("#tel-speed"),
    boosterEl: el("#tel-booster"), shipEl: el("#tel-ship"), thrustEl: el("#tel-thrust"),
    skyEl: q("#tel-sky"), barBooster: q("#bar-booster"), barShip: q("#bar-ship"),
    telemetryEl: q(".telemetry"),
  };
}

function collectCalloutToast(): HudCalloutToast {
  return {
    callout: q("#callout"),
    calloutTitle: q("#callout-title"),
    calloutDetail: q("#callout-detail"),
    camToast: q("#cam-toast"),
    camToastTitle: q("#cam-toast-title"),
    camToastDetail: q("#cam-toast-detail"),
  };
}

function collectCompleteCardA(): Pick<
  HudCompleteCard,
  | "completeEl"
  | "mcSub"
  | "mcDuration"
  | "mcTranslunarInjectionDeltaV"
  | "mcMinAlt"
> {
  return {
    completeEl: q("#mission-complete"),
    mcSub: q(".mc-sub"),
    mcDuration: q("#mc-duration"),
    mcTranslunarInjectionDeltaV: q("#mc-translunar-injection-delta-v"),
    mcMinAlt: q("#mc-minalt"),
  };
}

function collectCompleteCardB(): Omit<
  HudCompleteCard,
  keyof ReturnType<typeof collectCompleteCardA>
> {
  return {
    mcFuel: q("#mc-fuel"),
    mcPeakSpeed: q("#mc-peak-speed"),
    mcStageT: q("#mc-stage-t"),
    mcSky: q("#mc-sky"),
    mcReplay: q("#mc-replay"),
  };
}

function collectCompleteCard(): HudCompleteCard {
  return { ...collectCompleteCardA(), ...collectCompleteCardB() };
}

function collectKeymapOverlay(): Pick<
  HudOverlays,
  "hudRoot" | "keymapEl" | "keymapClose" | "keymapCanvas" | "keymapCtx"
> {
  const keymapCanvas = q<HTMLCanvasElement>("#keymap-canvas");
  return {
    hudRoot: q("#hud"),
    keymapEl: q("#keymap"),
    keymapClose: q("#keymap-close"),
    keymapCanvas,
    keymapCtx: keymapCanvas?.getContext("2d") ?? null,
  };
}

function collectPanelOverlay(): Omit<
  HudOverlays,
  keyof ReturnType<typeof collectKeymapOverlay>
> {
  const crossSectionCanvas = q<HTMLCanvasElement>("#cross-section-canvas");
  return {
    metricsEl: q("#metrics"),
    metricsClose: q("#metrics-close"),
    crossSectionEl: q("#cross-section"),
    crossSectionClose: q("#cross-section-close"),
    crossSectionCanvas,
    crossSectionCtx: crossSectionCanvas?.getContext("2d") ?? null,
  };
}

function collectOverlays(): HudOverlays {
  return { ...collectKeymapOverlay(), ...collectPanelOverlay() };
}

/** All HUD chrome nodes used by {@link bindHud}. */
export function collectHudDom(): HudDom {
  return {
    ...collectButtons(),
    ...collectTransport(),
    ...collectTelStripA(),
    ...collectTelStripB(),
    ...collectCalloutToast(),
    ...collectCompleteCard(),
    ...collectOverlays(),
  };
}

function collectMetricsDomA(): Pick<
  MetricsDom,
  | "phase"
  | "time"
  | "date"
  | "progress"
  | "playback"
  | "altEarth"
  | "rEarth"
  | "altMoon"
  | "distMoon"
  | "rMoon"
  | "cam"
  | "speed"
  | "speedEarth"
  | "speedMoon"
> {
  return {
    phase: q("#mx-phase"), time: q("#mx-time"), date: q("#mx-date"),
    progress: q("#mx-progress"), playback: q("#mx-playback"),
    altEarth: q("#mx-alt-earth"), rEarth: q("#mx-r-earth"),
    altMoon: q("#mx-alt-moon"), distMoon: q("#mx-dist-moon"), rMoon: q("#mx-r-moon"),
    cam: q("#mx-cam"), speed: q("#mx-speed"),
    speedEarth: q("#mx-speed-earth"), speedMoon: q("#mx-speed-moon"),
  };
}

function collectMetricsDomB(): Omit<
  MetricsDom,
  keyof ReturnType<typeof collectMetricsDomA>
> {
  return {
    booster: q("#mx-booster"), ship: q("#mx-ship"), mass: q("#mx-mass"),
    thrust: q("#mx-thrust"), accel: q("#mx-accel"), engines: q("#mx-engines"),
    staged: q("#mx-staged"), duration: q("#mx-duration"),
    translunarInjectionDeltaV: q("#mx-translunar-injection-delta-v"),
    minalt: q("#mx-minalt"), peakSpeed: q("#mx-peak-speed"), stageT: q("#mx-stage-t"),
    keplerDev: q("#mx-kepler-dev"), sky: q("#mx-sky"),
    forceRow: q("#mx-force-row"), forceCheck: q("#mx-force-check"),
  };
}

/** Metrics (M) overlay field nodes. */
export function collectMetricsDom(): MetricsDom {
  return { ...collectMetricsDomA(), ...collectMetricsDomB() };
}

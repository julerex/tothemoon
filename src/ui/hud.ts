import type { MissionClock } from "../mission/clock";
import type { CameraMode } from "../camera/modes";
import type {
  MissionEvent,
  MissionTimeline,
  PhaseSegment,
} from "../mission/timeline";
import type { PhaseId } from "../physics/mission";
import {
  BOOSTER_DRY_KG,
  BOOSTER_PROP_KG,
  R_EARTH,
  R_MOON,
  SHIP_DRY_KG,
  SHIP_PROP_KG,
} from "../physics/constants";

export type HudHandlers = {
  onPlayToggle: () => void;
  /** Fixed multiplier, or null when Auto is selected */
  onSpeedMode: (mode: "auto" | number) => void;
  /** `,` / `.` — step playback speed down / up through fixed presets */
  onSpeedNudge: (dir: -1 | 1) => number;
  onScrub: (t: number) => void;
  onCamera: (mode: CameraMode) => void;
  /** A/D camera-orbit, Q/E ecliptic yaw, R/F pitch around focus (hold) */
  onOrbitKey: (
    key: "q" | "e" | "r" | "f" | "a" | "d",
    down: boolean,
  ) => CameraMode;
  /** W/S — pan forward/back (hold) */
  onPanKey: (key: "w" | "s", down: boolean) => CameraMode;
  /** Z/X — zoom in/out (hold) */
  onZoomKey: (key: "z" | "x", down: boolean) => CameraMode;
  /** L — toggle scene labels (poles, Starbase, …) */
  onToggleLabels?: () => void;
  /** O — toggle orbit overlays (grids, Moon path, craft trail, ground track) */
  onToggleOrbits?: () => void;
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
  /** Whether Auto speed is active */
  autoSpeed: boolean;
  /** True once the craft has landed */
  missionComplete: boolean;
  /** TLI Δv (km/s) for mission-complete stats */
  tliDv: number;
  /** Minimum lunar altitude during approach/capture (km) */
  minMoonAlt: number;
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
};

const CALLOUT_MS = 4200;

export function bindHud(
  _clock: MissionClock,
  timeline: MissionTimeline,
  handlers: HudHandlers,
): {
  update: (tel: Telemetry) => void;
} {
  const btnPlay = el<HTMLButtonElement>("#btn-play");
  const speed = el<HTMLSelectElement>("#speed");
  const scrub = el<HTMLInputElement>("#scrub");
  const markersEl = document.querySelector<HTMLElement>("#scrub-markers");
  const phaseEl = el<HTMLElement>("#phase");
  const timeEl = el<HTMLElement>("#time");
  const dateEl = document.querySelector<HTMLElement>("#date");
  const distEl = el<HTMLElement>("#distance");
  const progEl = el<HTMLElement>("#progress");
  const altEl = el<HTMLElement>("#tel-altitude");
  const spdEl = el<HTMLElement>("#tel-speed");
  const boosterEl = el<HTMLElement>("#tel-booster");
  const shipEl = el<HTMLElement>("#tel-ship");
  const thrustEl = el<HTMLElement>("#tel-thrust");
  const barBooster = document.querySelector<HTMLElement>("#bar-booster");
  const barShip = document.querySelector<HTMLElement>("#bar-ship");
  const callout = document.querySelector<HTMLElement>("#callout");
  const calloutTitle = document.querySelector<HTMLElement>("#callout-title");
  const calloutDetail = document.querySelector<HTMLElement>("#callout-detail");
  const completeEl = document.querySelector<HTMLElement>("#mission-complete");
  const mcDuration = document.querySelector<HTMLElement>("#mc-duration");
  const mcTli = document.querySelector<HTMLElement>("#mc-tlidv");
  const mcMinAlt = document.querySelector<HTMLElement>("#mc-minalt");
  const mcFuel = document.querySelector<HTMLElement>("#mc-fuel");
  const mcReplay = document.querySelector<HTMLButtonElement>("#mc-replay");
  const keymapEl = document.querySelector<HTMLElement>("#keymap");
  const keymapClose = document.querySelector<HTMLButtonElement>("#keymap-close");
  const metricsEl = document.querySelector<HTMLElement>("#metrics");
  const metricsClose = document.querySelector<HTMLButtonElement>("#metrics-close");
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
    tlidv: document.querySelector<HTMLElement>("#mx-tlidv"),
    minalt: document.querySelector<HTMLElement>("#mx-minalt"),
  };

  let scrubbing = false;
  let lastPhase: PhaseId | null = null;
  let lastMissionT = -1;
  /** Events already shown this pass (reset when scrubbing backward). */
  const firedEvents = new Set<string>();
  let calloutTimer: ReturnType<typeof setTimeout> | null = null;
  let completeShown = false;
  let keymapOpen = false;
  let metricsOpen = false;

  function setKeymapOpen(open: boolean): void {
    keymapOpen = open;
    if (keymapEl) keymapEl.hidden = !open;
    if (open) setMetricsOpen(false);
  }

  function toggleKeymap(): void {
    setKeymapOpen(!keymapOpen);
  }

  function setMetricsOpen(open: boolean): void {
    metricsOpen = open;
    if (metricsEl) metricsEl.hidden = !open;
    if (open) setKeymapOpen(false);
  }

  function toggleMetrics(): void {
    setMetricsOpen(!metricsOpen);
  }

  if (markersEl) {
    renderPhaseMarkers(markersEl, timeline.segments);
  }

  btnPlay.addEventListener("click", () => handlers.onPlayToggle());
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

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    // Don't steal typing from form controls
    const t = e.target;
    if (
      t instanceof HTMLInputElement ||
      t instanceof HTMLSelectElement ||
      t instanceof HTMLTextAreaElement
    ) {
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
    if (e.key === "Escape" && (keymapOpen || metricsOpen)) {
      e.preventDefault();
      if (metricsOpen) setMetricsOpen(false);
      else setKeymapOpen(false);
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      handlers.onPlayToggle();
    } else if (e.key === "1") {
      handlers.onCamera("sun");
    } else if (e.key === "2") {
      handlers.onCamera("earth");
    } else if (e.key === "3") {
      handlers.onCamera("moon");
    } else if (e.key === "4") {
      handlers.onCamera("chase");
    } else if (e.key === "5") {
      handlers.onCamera("starbase");
    } else if (e.key === "6") {
      handlers.onCamera("fin");
    } else if (e.key === "q" || e.key === "Q") {
      handlers.onOrbitKey("q", true);
    } else if (e.key === "e" || e.key === "E") {
      handlers.onOrbitKey("e", true);
    } else if (e.key === "r" || e.key === "R") {
      handlers.onOrbitKey("r", true);
    } else if (e.key === "f" || e.key === "F") {
      handlers.onOrbitKey("f", true);
    } else if (e.key === "a" || e.key === "A") {
      handlers.onOrbitKey("a", true);
    } else if (e.key === "d" || e.key === "D") {
      handlers.onOrbitKey("d", true);
    } else if (e.key === "w" || e.key === "W") {
      handlers.onPanKey("w", true);
    } else if (e.key === "s" || e.key === "S") {
      handlers.onPanKey("s", true);
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
    } else if (e.key === "a" || e.key === "A") {
      handlers.onOrbitKey("a", false);
    } else if (e.key === "d" || e.key === "D") {
      handlers.onOrbitKey("d", false);
    } else if (e.key === "w" || e.key === "W") {
      handlers.onPanKey("w", false);
    } else if (e.key === "s" || e.key === "S") {
      handlers.onPanKey("s", false);
    } else if (e.key === "z" || e.key === "Z") {
      handlers.onZoomKey("z", false);
    } else if (e.key === "x" || e.key === "X") {
      handlers.onZoomKey("x", false);
    }
  });

  window.addEventListener("blur", () => {
    handlers.onOrbitKey("q", false);
    handlers.onOrbitKey("e", false);
    handlers.onOrbitKey("a", false);
    handlers.onOrbitKey("d", false);
    handlers.onOrbitKey("r", false);
    handlers.onOrbitKey("f", false);
    handlers.onPanKey("w", false);
    handlers.onPanKey("s", false);
    handlers.onZoomKey("z", false);
    handlers.onZoomKey("x", false);
  });

  // Initial mode from select (defaults to Auto in HTML)
  handlers.onSpeedMode(parseSpeedMode(speed.value));

  if (mcReplay) {
    mcReplay.addEventListener("click", () => {
      handlers.onScrub(0);
      // Start playback if paused
      if (btnPlay.getAttribute("aria-pressed") !== "true") {
        handlers.onPlayToggle();
      }
      if (completeEl) completeEl.hidden = true;
      completeShown = false;
    });
  }

  function showCallout(ev: MissionEvent): void {
    if (!callout || !calloutTitle) return;
    calloutTitle.textContent = ev.title;
    if (calloutDetail) {
      calloutDetail.textContent = ev.detail ?? "";
      calloutDetail.hidden = !ev.detail;
    }
    callout.hidden = false;
    callout.classList.remove("callout-out");
    // retrigger enter animation
    void callout.offsetWidth;
    callout.classList.add("callout-in");
    if (calloutTimer) clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => {
      callout.classList.remove("callout-in");
      callout.classList.add("callout-out");
      calloutTimer = setTimeout(() => {
        callout.hidden = true;
        callout.classList.remove("callout-out");
      }, 320);
    }, CALLOUT_MS);
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

  function update(tel: Telemetry): void {
    const u = tel.durationS > 0 ? tel.t / tel.durationS : 0;
    phaseEl.textContent = tel.phase;
    timeEl.textContent = formatMissionTime(tel.t);
    if (dateEl) dateEl.textContent = tel.dateUtc;
    distEl.textContent = formatDistance(tel.distanceToMoon);
    progEl.textContent = `${Math.round(Math.min(1, u) * 100)}%`;
    altEl.textContent = formatDistance(Math.max(0, tel.altitude));
    spdEl.textContent = formatSpeed(tel.speed);
    boosterEl.textContent = formatFuel(tel.fuelBooster, "booster");
    shipEl.textContent = formatFuel(tel.fuelShip, "ship");
    thrustEl.textContent = formatThrust(tel.thrustN);
    if (barBooster) {
      barBooster.style.width = `${Math.round(clamp01(tel.fuelBooster) * 100)}%`;
    }
    if (barShip) {
      barShip.style.width = `${Math.round(clamp01(tel.fuelShip) * 100)}%`;
    }

    btnPlay.textContent = tel.playing ? "Pause" : "Play";
    btnPlay.setAttribute("aria-pressed", tel.playing ? "true" : "false");

    // Mission complete panel
    if (completeEl) {
      if (tel.missionComplete) {
        if (!completeShown) {
          completeShown = true;
          if (mcDuration) mcDuration.textContent = formatMissionTime(tel.durationS);
          if (mcTli) mcTli.textContent = `${tel.tliDv.toFixed(3)} km/s`;
          if (mcMinAlt) {
            mcMinAlt.textContent =
              tel.minMoonAlt < 1
                ? `${(tel.minMoonAlt * 1000).toFixed(0)} m`
                : formatDistance(Math.max(0, tel.minMoonAlt));
          }
          if (mcFuel) mcFuel.textContent = formatFuel(tel.fuelShip, "ship");
        }
        completeEl.hidden = false;
      } else {
        completeEl.hidden = true;
        completeShown = false;
      }
    }

    // Keep Auto selected; show effective rate in the Auto option label
    if (tel.autoSpeed) {
      const autoOpt = speed.querySelector<HTMLOptionElement>('option[value="auto"]');
      if (autoOpt) {
        autoOpt.textContent = `Auto · ${formatRate(tel.playbackSpeed)}`;
      }
      if (speed.value !== "auto") speed.value = "auto";
    } else {
      const autoOpt = speed.querySelector<HTMLOptionElement>('option[value="auto"]');
      if (autoOpt) autoOpt.textContent = "Auto";
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
  }

  function updateMetrics(tel: Telemetry): void {
    const u = tel.durationS > 0 ? tel.t / tel.durationS : 0;
    const rEarth = R_EARTH + tel.altEarth;
    const rMoon = tel.distMoon;
    const boosterKg = clamp01(tel.fuelBooster) * BOOSTER_PROP_KG;
    const shipKg = clamp01(tel.fuelShip) * SHIP_PROP_KG;
    const wetKg = tel.staged
      ? SHIP_DRY_KG + shipKg
      : BOOSTER_DRY_KG + boosterKg + SHIP_DRY_KG + shipKg;
    const accelG =
      wetKg > 1 && tel.thrustN > 0
        ? tel.thrustN / (wetKg * 9.80665)
        : 0;

    setText(mx.phase, tel.phase);
    setText(mx.time, formatMissionTimeDetailed(tel.t));
    setText(mx.date, tel.dateUtc);
    setText(
      mx.progress,
      `${(Math.min(1, Math.max(0, u)) * 100).toFixed(2)}% · ${formatMissionTimeDetailed(Math.max(0, tel.durationS - tel.t))} left`,
    );
    setText(
      mx.playback,
      tel.autoSpeed
        ? `Auto · ${formatRate(tel.playbackSpeed)}`
        : `${formatRate(tel.playbackSpeed)}${tel.playing ? "" : " · paused"}`,
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
    setText(
      mx.accel,
      accelG > 1e-4 ? `${accelG.toFixed(3)} g` : "—",
    );
    setText(
      mx.engines,
      tel.burning && tel.thrustN > 500 ? "burning" : "coast / idle",
    );
    setText(mx.staged, tel.staged ? "yes · ship only" : "no · full stack");
    setText(mx.duration, formatMissionTimeDetailed(tel.durationS));
    setText(mx.tlidv, `${tel.tliDv.toFixed(4)} km/s`);
    setText(
      mx.minalt,
      Number.isFinite(tel.minMoonAlt)
        ? formatDistancePrecise(Math.max(0, tel.minMoonAlt))
        : "—",
    );
  }

  return { update };
}

function setText(node: HTMLElement | null, text: string): void {
  if (node) node.textContent = text;
}

function parseSpeedMode(value: string): "auto" | number {
  if (value === "auto") return "auto";
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : "auto";
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
    "leo",
    "tli",
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

function formatRate(speed: number): string {
  if (speed >= 100) return `${Math.round(speed)}×`;
  if (speed >= 10) return `${Math.round(speed)}×`;
  return `${speed.toFixed(0)}×`;
}

function formatMissionTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${String(m).padStart(2, "0")}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Metrics panel: include seconds. */
function formatMissionTimeDetailed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${h}h ${pad(m)}m ${pad(sec)}s`;
  return `${h}h ${pad(m)}m ${pad(sec)}s · ${s.toLocaleString()} s`;
}

function formatDistance(km: number): string {
  const v = Math.max(0, km);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Mkm`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Mm`;
  if (v >= 10) return `${Math.round(v)} km`;
  return `${v.toFixed(2)} km`;
}

function formatDistancePrecise(km: number): string {
  const v = km; // allow negative altitude (below mean radius)
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(3)} Mkm`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(3)} Mm (${abs.toFixed(1)} km)`;
  if (abs >= 1) return `${sign}${abs.toFixed(3)} km`;
  if (abs >= 0.001) return `${sign}${(abs * 1000).toFixed(1)} m`;
  return `${sign}${(abs * 1e6).toFixed(0)} mm`;
}

/** Camera–focus range: AU-scale down to meters. */
function formatFocusDistance(km: number): string {
  const v = Math.max(0, km);
  if (v >= 149_597_870.7) return `${(v / 149_597_870.7).toFixed(3)} AU`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Mkm`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Mm`;
  if (v >= 10) return `${Math.round(v)} km`;
  if (v >= 1) return `${v.toFixed(2)} km`;
  if (v >= 0.001) return `${(v * 1000).toFixed(0)} m`;
  return `${(v * 1e6).toFixed(0)} mm`;
}

function formatSpeed(kmPerS: number): string {
  const v = Math.max(0, kmPerS);
  if (v >= 1) return `${v.toFixed(2)} km/s`;
  return `${(v * 1000).toFixed(0)} m/s`;
}

function formatSpeedPrecise(kmPerS: number): string {
  const v = Math.max(0, kmPerS);
  if (v >= 1) return `${v.toFixed(4)} km/s · ${(v * 1000).toFixed(1)} m/s`;
  return `${(v * 1000).toFixed(2)} m/s · ${v.toFixed(6)} km/s`;
}

function formatFuel(frac: number, tank: "booster" | "ship"): string {
  const f = Math.max(0, Math.min(1, frac));
  const cap = tank === "booster" ? BOOSTER_PROP_KG : SHIP_PROP_KG;
  const kg = f * cap;
  const pct = `${Math.round(f * 100)}%`;
  if (kg >= 1_000_000) return `${pct} · ${(kg / 1_000_000).toFixed(2)} kt`;
  if (kg >= 1000) return `${pct} · ${(kg / 1000).toFixed(0)} t`;
  return `${pct} · ${Math.round(kg)} kg`;
}

function formatFuelDetailed(frac: number, kg: number, capKg: number): string {
  const f = clamp01(frac);
  const pct = `${(f * 100).toFixed(2)}%`;
  return `${pct} · ${formatMassKg(kg)} / ${formatMassKg(capKg)}`;
}

function formatMassKg(kg: number): string {
  const v = Math.max(0, kg);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(3)} kt (${Math.round(v).toLocaleString()} kg)`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)} t (${Math.round(v).toLocaleString()} kg)`;
  return `${Math.round(v)} kg`;
}

function formatThrust(newtons: number): string {
  const n = Math.max(0, newtons);
  if (n < 500) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MN`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} kN`;
  return `${Math.round(n)} N`;
}

function formatThrustDetailed(newtons: number): string {
  const n = Math.max(0, newtons);
  if (n < 1) return "0 N";
  if (n >= 1e6) return `${(n / 1e6).toFixed(3)} MN · ${(n / 1e3).toFixed(0)} kN`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)} kN · ${Math.round(n).toLocaleString()} N`;
  return `${n.toFixed(1)} N`;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function el<T extends HTMLElement>(sel: string): T {
  const node = document.querySelector(sel);
  if (!node) throw new Error(`Missing element ${sel}`);
  return node as T;
}

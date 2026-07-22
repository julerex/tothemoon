import type { MissionClock } from "../mission/clock";
import type { CameraMode } from "../camera/modes";
import type {
  MissionEvent,
  MissionTimeline,
  PhaseSegment,
} from "../mission/timeline";
import type { PhaseId } from "../physics/mission";
import { BOOSTER_PROP_KG, SHIP_PROP_KG } from "../physics/constants";

export type HudHandlers = {
  onPlayToggle: () => void;
  /** Fixed multiplier, or null when Auto is selected */
  onSpeedMode: (mode: "auto" | number) => void;
  onScrub: (t: number) => void;
  onCamera: (mode: CameraMode) => void;
  /** R — ecliptic north (+Z) screen-up, free orbit */
  onCameraReset: () => void;
  /** F — cycle Sun → Earth → Moon → Ship */
  onCameraCycle: () => CameraMode;
  /** Q/E — orbit left/right around focus (hold) */
  onOrbitKey: (key: "q" | "e", down: boolean) => CameraMode;
  /** WASD — pan forward/left/back/right (hold) */
  onPanKey: (key: "w" | "a" | "s" | "d", down: boolean) => CameraMode;
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
  const camBtns = document.querySelectorAll<HTMLButtonElement>("[data-camera]");
  const callout = document.querySelector<HTMLElement>("#callout");
  const calloutTitle = document.querySelector<HTMLElement>("#callout-title");
  const calloutDetail = document.querySelector<HTMLElement>("#callout-detail");
  const completeEl = document.querySelector<HTMLElement>("#mission-complete");
  const mcDuration = document.querySelector<HTMLElement>("#mc-duration");
  const mcTli = document.querySelector<HTMLElement>("#mc-tlidv");
  const mcMinAlt = document.querySelector<HTMLElement>("#mc-minalt");
  const mcFuel = document.querySelector<HTMLElement>("#mc-fuel");
  const mcReplay = document.querySelector<HTMLButtonElement>("#mc-replay");

  let scrubbing = false;
  let lastPhase: PhaseId | null = null;
  let lastMissionT = -1;
  /** Events already shown this pass (reset when scrubbing backward). */
  const firedEvents = new Set<string>();
  let calloutTimer: ReturnType<typeof setTimeout> | null = null;
  let completeShown = false;

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

  for (const btn of camBtns) {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.camera as CameraMode;
      handlers.onCamera(mode);
      setActiveCamera(mode);
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space") {
      e.preventDefault();
      handlers.onPlayToggle();
    } else if (e.key === "1") {
      handlers.onCamera("free");
      setActiveCamera("free");
    } else if (e.key === "2") {
      handlers.onCamera("earth");
      setActiveCamera("earth");
    } else if (e.key === "3") {
      handlers.onCamera("chase");
      setActiveCamera("chase");
    } else if (e.key === "4") {
      handlers.onCamera("moon");
      setActiveCamera("moon");
    } else if (e.key === "5") {
      handlers.onCamera("solar");
      setActiveCamera("solar");
    } else if (e.key === "r" || e.key === "R") {
      handlers.onCameraReset();
      setActiveCamera("free");
    } else if (e.key === "f" || e.key === "F") {
      const mode = handlers.onCameraCycle();
      setActiveCamera(mode);
    } else if (e.key === "q" || e.key === "Q") {
      const mode = handlers.onOrbitKey("q", true);
      setActiveCamera(mode);
    } else if (e.key === "e" || e.key === "E") {
      const mode = handlers.onOrbitKey("e", true);
      setActiveCamera(mode);
    } else if (e.key === "w" || e.key === "W") {
      setActiveCamera(handlers.onPanKey("w", true));
    } else if (e.key === "a" || e.key === "A") {
      setActiveCamera(handlers.onPanKey("a", true));
    } else if (e.key === "s" || e.key === "S") {
      setActiveCamera(handlers.onPanKey("s", true));
    } else if (e.key === "d" || e.key === "D") {
      setActiveCamera(handlers.onPanKey("d", true));
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "q" || e.key === "Q") {
      handlers.onOrbitKey("q", false);
    } else if (e.key === "e" || e.key === "E") {
      handlers.onOrbitKey("e", false);
    } else if (e.key === "w" || e.key === "W") {
      handlers.onPanKey("w", false);
    } else if (e.key === "a" || e.key === "A") {
      handlers.onPanKey("a", false);
    } else if (e.key === "s" || e.key === "S") {
      handlers.onPanKey("s", false);
    } else if (e.key === "d" || e.key === "D") {
      handlers.onPanKey("d", false);
    }
  });

  window.addEventListener("blur", () => {
    handlers.onOrbitKey("q", false);
    handlers.onOrbitKey("e", false);
    handlers.onPanKey("w", false);
    handlers.onPanKey("a", false);
    handlers.onPanKey("s", false);
    handlers.onPanKey("d", false);
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

  function setActiveCamera(mode: CameraMode): void {
    for (const btn of camBtns) {
      btn.classList.toggle("active", btn.dataset.camera === mode);
    }
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
  }

  return { update };
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

function formatDistance(km: number): string {
  const v = Math.max(0, km);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Mkm`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Mm`;
  if (v >= 10) return `${Math.round(v)} km`;
  return `${v.toFixed(2)} km`;
}

function formatSpeed(kmPerS: number): string {
  const v = Math.max(0, kmPerS);
  if (v >= 1) return `${v.toFixed(2)} km/s`;
  return `${(v * 1000).toFixed(0)} m/s`;
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

function formatThrust(newtons: number): string {
  const n = Math.max(0, newtons);
  if (n < 500) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MN`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} kN`;
  return `${Math.round(n)} N`;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function el<T extends HTMLElement>(sel: string): T {
  const node = document.querySelector(sel);
  if (!node) throw new Error(`Missing element ${sel}`);
  return node as T;
}

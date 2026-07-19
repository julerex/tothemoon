import type { MissionClock } from "../mission/clock";
import type { CameraMode } from "../camera/modes";
import { BOOSTER_PROP_KG, SHIP_PROP_KG } from "../physics/constants";

export type HudHandlers = {
  onPlayToggle: () => void;
  onSpeed: (speed: number) => void;
  onScrub: (t: number) => void;
  onCamera: (mode: CameraMode) => void;
};

export type Telemetry = {
  phase: string;
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
};

export function bindHud(_clock: MissionClock, handlers: HudHandlers): {
  update: (tel: Telemetry) => void;
} {
  const btnPlay = el<HTMLButtonElement>("#btn-play");
  const speed = el<HTMLSelectElement>("#speed");
  const scrub = el<HTMLInputElement>("#scrub");
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
  const camBtns = document.querySelectorAll<HTMLButtonElement>("[data-camera]");

  let scrubbing = false;

  btnPlay.addEventListener("click", () => handlers.onPlayToggle());
  speed.addEventListener("change", () => {
    handlers.onSpeed(Number(speed.value));
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
    }
  });

  handlers.onSpeed(Number(speed.value));

  function setActiveCamera(mode: CameraMode): void {
    for (const btn of camBtns) {
      btn.classList.toggle("active", btn.dataset.camera === mode);
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

    btnPlay.textContent = tel.playing ? "Pause" : "Play";
    btnPlay.setAttribute("aria-pressed", tel.playing ? "true" : "false");

    if (!scrubbing) {
      scrub.value = String(Math.round(Math.min(1, u) * 1000));
    }
  }

  return { update };
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

function el<T extends HTMLElement>(sel: string): T {
  const node = document.querySelector(sel);
  if (!node) throw new Error(`Missing element ${sel}`);
  return node as T;
}

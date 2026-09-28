/**
 * Flight 14 briefing overlay (menu surface — not the 3D theater).
 */
import {
  setEarthGcOverlayOpen,
  setEarthGcProfile,
} from "../ui/earthGcOverlay";

function briefingEl(): HTMLElement | null {
  return document.getElementById("flight14-briefing");
}

export function isFlight14BriefingOpen(): boolean {
  const el = briefingEl();
  return !!el && !el.hidden;
}

export function setFlight14BriefingOpen(open: boolean): void {
  ensureFlight14BriefingBound();
  const el = briefingEl();
  if (!el) return;
  el.hidden = !open;
  const menus = document.getElementById("menus");
  if (open) {
    if (menus) menus.hidden = true;
    document.body.classList.add("menus-active");
    document.body.classList.remove("theater-active");
  } else if (menus) {
    menus.hidden = false;
  }
}

let bound = false;

export function ensureFlight14BriefingBound(): void {
  if (bound) return;
  bound = true;
  const el = briefingEl();
  if (!el) return;
  el.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-briefing-action]");
    if (!t) return;
    const action = t.dataset.briefingAction;
    if (action === "close") setFlight14BriefingOpen(false);
    if (action === "gc") {
      setEarthGcProfile("flight-14");
      setEarthGcOverlayOpen(true);
    }
    if (action === "theater") {
      setFlight14BriefingOpen(false);
      location.hash = "#/mission/flight-14";
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isFlight14BriefingOpen()) {
      e.preventDefault();
      setFlight14BriefingOpen(false);
    }
  });
}

/**
 * Starship Flight 13 — briefing-first entry.
 * Official approximate timeline from docs/STARSHIP_13.md (SpaceX public profile).
 * Interactive 3D theater is the next slice; this screen is the mission home base.
 */

import { navigate, setTheaterVisible } from "../app/shell";
import {
  ensureEarthGcOverlayBound,
  setEarthGcOverlayOpen,
} from "../ui/earthGcOverlay";

/** Approximate T+ events from the SpaceX Flight 13 mission profile. */
const FLIGHT_EVENTS: ReadonlyArray<{ t: string; label: string }> = [
  { t: "00:00:00", label: "Liftoff" },
  { t: "00:00:58", label: "Max Q" },
  { t: "00:02:18", label: "Super Heavy main engine cutoff" },
  { t: "00:02:21", label: "Hot-staging (Starship ignition + stage separation)" },
  { t: "00:02:25", label: "Super Heavy boostback burn start" },
  { t: "00:03:03", label: "Super Heavy boostback burn shutdown" },
  { t: "00:06:27", label: "Super Heavy landing burn start" },
  { t: "00:06:53", label: "Super Heavy landing burn shutdown" },
  { t: "00:08:05", label: "Starship engine cutoff" },
  { t: "00:16:40", label: "Payload deploy demo start" },
  { t: "00:27:39", label: "Payload deploy demo complete" },
  { t: "00:38:58", label: "Raptor in-space relight demo" },
  { t: "00:47:30", label: "Starship entry" },
  { t: "01:02:23", label: "Starship is transonic" },
  { t: "01:03:01", label: "Starship is subsonic" },
  { t: "01:05:01", label: "Landing burn start" },
  { t: "01:05:03", label: "Landing flip" },
  { t: "01:05:12", label: "Landing burn 3 → 2 engines" },
  { t: "01:05:19", label: "Landing burn 2 → 1 engine" },
  { t: "01:05:21", label: "Landing (Indian Ocean splashdown)" },
];

/**
 * Show the Flight 13 briefing (not the lunar HUD). Leaves theater canvas hidden.
 */
export function startFlight13Mission(): void {
  setTheaterVisible(false);
  document.title = "tothemoon — Starship Flight 13";

  // Reuse the menus root as a full-screen briefing host
  const menus = document.getElementById("menus");
  if (!menus) throw new Error("#menus not found");
  menus.hidden = false;
  document.body.classList.add("menus-active");
  document.body.classList.remove("theater-active");

  // Hide standard menu screens; inject briefing panel
  const mainMenu = document.getElementById("main-menu");
  const missionMenu = document.getElementById("mission-menu");
  if (mainMenu) mainMenu.hidden = true;
  if (missionMenu) missionMenu.hidden = true;

  let briefing = document.getElementById("flight13-briefing");
  if (!briefing) {
    briefing = document.createElement("div");
    briefing.id = "flight13-briefing";
    briefing.className = "menu-screen";
    menus.appendChild(briefing);
  }
  briefing.hidden = false;

  briefing.innerHTML = `
    <div class="menu-panel menu-panel-wide flight13-panel">
      <header class="menu-header-row">
        <button type="button" class="menu-back" data-f13="back" title="Back to Mission Menu">
          ← Mission Menu
        </button>
        <div>
          <p class="menu-kicker">Flight test · V3 vehicles</p>
          <h1 class="menu-title menu-title-sm">Starship Flight 13</h1>
          <p class="menu-card-sub-static">Starbase · ~65&nbsp;min profile · July 2026 window</p>
        </div>
      </header>

      <div class="flight13-grid">
        <section class="flight13-overview" aria-label="Mission overview">
          <h2 class="flight13-h2">Overview</h2>
          <p>
            Starship’s thirteenth flight test targets Super Heavy launch, hot-staging,
            boostback, and an offshore landing burn in the Gulf of America, plus
            Ship objectives: <strong>20 Starlink V3</strong> deploy demo, a single
            Raptor in-space relight, and controlled entry / splashdown in the Indian Ocean.
          </p>
          <p class="flight13-note">
            Interactive 3D theater for this profile is <strong>next</strong> — this
            briefing locks the public timeline so the pack and scrubber can follow it.
            Source notes: <code>docs/STARSHIP_13.md</code>.
          </p>
          <ul class="flight13-objectives">
            <li>Booster: ascent · stage separation · boostback · landing burn (offshore)</li>
            <li>Ship: SECO · Starlink V3 deploy · Raptor relight · entry · splashdown</li>
            <li>First Starlink V3 ride on Starship (suborbital; demise on reentry)</li>
          </ul>
          <p class="flight13-source">
            Profile text © SpaceX —
            <a href="https://www.spacex.com/launches/starship-flight-13" target="_blank" rel="noopener noreferrer">spacex.com/launches/starship-flight-13</a>
          </p>
        </section>

        <section class="flight13-timeline" aria-label="Flight test timeline">
          <h2 class="flight13-h2">Flight test timeline <span class="flight13-approx">(approx.)</span></h2>
          <ol class="flight13-events">
            ${FLIGHT_EVENTS.map(
              (e) =>
                `<li><time class="flight13-t">T+ ${e.t}</time><span class="flight13-label">${escapeHtml(e.label)}</span></li>`,
            ).join("")}
          </ol>
        </section>
      </div>

      <div class="flight13-actions">
        <button type="button" class="menu-btn menu-btn-primary" data-f13="earth-gc">
          Earth great circle
        </button>
        <button type="button" class="menu-btn menu-btn-ghost" data-f13="back">
          Back to Mission Menu
        </button>
        <button type="button" class="menu-btn menu-btn-ghost" data-f13="soon" disabled title="3D theater coming next">
          Theater — coming next
        </button>
      </div>
    </div>
  `;

  ensureEarthGcOverlayBound();

  briefing.onclick = (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-f13]");
    if (!t) return;
    if (t.dataset.f13 === "back") {
      setEarthGcOverlayOpen(false);
      briefing!.hidden = true;
      navigate("/missions");
    } else if (t.dataset.f13 === "earth-gc") {
      setEarthGcOverlayOpen(true);
    }
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

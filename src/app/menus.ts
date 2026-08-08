/**
 * Main menu and Mission Menu screens. Pure DOM bind; routing stays in main.
 */

import { MISSIONS, type MissionDef } from "./missionCatalog";
import { navigate } from "./shell";

function missionCard(m: MissionDef): string {
  const statusLabel = m.status === "ready" ? "Play" : "Open briefing";
  const statusClass =
    m.status === "ready" ? "mission-card-ready" : "mission-card-preview";
  return `
    <button type="button" class="mission-card ${statusClass}" data-mission="${m.path}" aria-label="${escapeAttr(m.title)} — ${statusLabel}">
      <span class="mission-card-badge">${escapeHtml(m.badge)}</span>
      <span class="mission-card-title">${escapeHtml(m.title)}</span>
      <span class="mission-card-sub">${escapeHtml(m.subtitle)}</span>
      <span class="mission-card-blurb">${escapeHtml(m.blurb)}</span>
      <span class="mission-card-cta">${statusLabel} →</span>
    </button>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

/**
 * Fill menu containers and wire navigation. Safe to call once at boot.
 */
export function bindMenus(): void {
  const main = document.getElementById("main-menu");
  const missions = document.getElementById("mission-menu");
  if (!main || !missions) {
    throw new Error("Menu roots #main-menu / #mission-menu not found");
  }

  main.innerHTML = `
    <div class="menu-panel">
      <p class="menu-kicker">Interactive mission theater</p>
      <h1 class="menu-title">tothemoon</h1>
      <p class="menu-lead">
        True-scale Three.js theaters for Starship-class missions.
        Pick a mission to scrub the flight, fly the cameras, and watch the timeline.
      </p>
      <nav class="menu-actions" aria-label="Main menu">
        <button type="button" class="menu-btn menu-btn-primary" data-nav="missions">
          Mission Menu
        </button>
        <a
          class="menu-btn menu-btn-ghost"
          href="https://github.com/julerex/tothemoon"
          target="_blank"
          rel="noopener noreferrer"
        >Source on GitHub</a>
      </nav>
      <p class="menu-foot">© Julian le Roux 2026 · scene unit = 1&nbsp;km</p>
    </div>
  `;

  missions.innerHTML = `
    <div class="menu-panel menu-panel-wide">
      <header class="menu-header-row">
        <button type="button" class="menu-back" data-nav="main" title="Back to main menu">
          ← Main menu
        </button>
        <div>
          <p class="menu-kicker">Choose a flight</p>
          <h1 class="menu-title menu-title-sm">Mission Menu</h1>
        </div>
      </header>
      <div class="mission-grid" role="list">
        ${MISSIONS.map(missionCard).join("")}
      </div>
      <p class="menu-foot">More missions can land here as packs are baked.</p>
    </div>
  `;

  main.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-nav]");
    if (!t) return;
    const nav = t.dataset.nav;
    if (nav === "missions") navigate("/missions");
  });

  missions.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-nav], [data-mission]",
    );
    if (!t) return;
    if (t.dataset.nav === "main") {
      navigate("/");
      return;
    }
    const path = t.dataset.mission;
    if (path) navigate(`/mission/${path}`);
  });
}

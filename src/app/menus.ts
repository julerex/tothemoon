/**
 * Mission list and Glossary screens. Pure DOM bind; routing stays in main.
 * On the mission list, digit keys 1…n open flights in catalog order.
 */

import {
  glossaryGrouped,
  type GlossaryEntry,
} from "./glossary";
import { MISSIONS, type MissionDef } from "./missionCatalog";
import { getShellView, navigate } from "./shell";

/**
 * Map a keyboard digit (`"1"`…`"9"`) to a mission path, or null if unbound.
 * Order matches the mission cards on the main page.
 */
export function missionPathForDigit(digit: string): string | null {
  const index = Number(digit) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= MISSIONS.length) return null;
  return MISSIONS[index]?.path ?? null;
}

function missionCard(m: MissionDef, digit: string): string {
  const statusLabel = m.status === "ready" ? "Play" : "Open briefing";
  const statusClass = missionStatusClass(m);
  return missionCardHtml(m, statusLabel, statusClass, digit);
}

function missionStatusClass(m: MissionDef): string {
  return m.status === "ready" ? "mission-card-ready" : "mission-card-preview";
}

function missionCardHtml(
  m: MissionDef,
  statusLabel: string,
  statusClass: string,
  digit: string,
): string {
  return `
    <button type="button" class="mission-card ${statusClass}" data-mission="${m.path}" aria-keyshortcuts="${digit}" aria-label="${escapeAttr(m.title)} — ${statusLabel}">
      <span class="mission-card-title">${escapeHtml(m.title)}</span>
      <span class="mission-card-sub">${escapeHtml(m.subtitle)}</span>
      <span class="mission-card-blurb">${escapeHtml(m.blurb)}</span>
      <span class="mission-card-cta">${statusLabel} →</span>
    </button>
  `;
}

function glossaryEntryHtml(e: GlossaryEntry): string {
  return `
    <div class="glossary-entry" id="glossary-${escapeAttr(e.id)}">
      <dt class="glossary-term">${escapeHtml(e.term)}</dt>
      <dd class="glossary-def">${escapeHtml(e.definition)}</dd>
    </div>
  `;
}

function glossaryBodyHtml(): string {
  return glossaryGrouped().map(glossarySectionHtml).join("");
}

function glossarySectionHtml(g: {
  category: string;
  label: string;
  entries: GlossaryEntry[];
}): string {
  return `<section class="glossary-section" aria-labelledby="glossary-cat-${g.category}"><h2 class="glossary-cat" id="glossary-cat-${g.category}">${escapeHtml(g.label)}</h2><dl class="glossary-list">${g.entries.map(glossaryEntryHtml).join("")}</dl></section>`;
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
  const roots = requireMenuRoots();
  fillMissionMenu(roots.missions);
  fillGlossaryMenu(roots.glossary);
  wireMenuClicks(roots);
}

function requireMenuRoots(): {
  missions: HTMLElement;
  glossary: HTMLElement;
} {
  const missions = el("mission-menu");
  const glossary = el("glossary-menu");
  if (!missions || !glossary) throw missingMenuRoots();
  return { missions, glossary };
}

function missingMenuRoots(): Error {
  return new Error("Menu roots #mission-menu / #glossary-menu not found");
}

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function fillMissionMenu(missions: HTMLElement): void {
  missions.innerHTML = missionMenuHtml();
}

function missionMenuHtml(): string {
  const cards = MISSIONS.map((m, i) => missionCard(m, String(i + 1))).join("");
  return `
    <div class="menu-panel menu-panel-wide">
      <header class="menu-header-row">
        <div>
          <p class="menu-kicker">Choose a flight</p>
          <h1 class="menu-title menu-title-sm">Mission Menu</h1>
        </div>
      </header>
      <div class="mission-grid" role="list">
        ${cards}
      </div>
      <p class="menu-foot">More missions can land here as packs are baked.</p>
      <nav class="menu-foot-links" aria-label="Also">
        <button type="button" class="menu-back" data-nav="glossary">Glossary</button>
        <a class="menu-back" href="https://github.com/julerex/tothemoon" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
      </nav>
    </div>
  `;
}

function fillGlossaryMenu(glossary: HTMLElement): void {
  glossary.innerHTML = glossaryMenuHtml();
}

function glossaryMenuHtml(): string {
  return `<div class="menu-panel menu-panel-wide glossary-panel">${glossaryHeaderHtml()}<div class="glossary-body">${glossaryBodyHtml()}</div><p class="menu-foot">Theater-grade explanations · not flight-ops documentation</p></div>`;
}

function glossaryHeaderHtml(): string {
  return menuHeaderBlock(
    "Reference",
    "Glossary",
    "Terms used in the theater UI, timelines, and physics notes.",
  );
}

function menuHeaderBlock(kicker: string, title: string, sub?: string): string {
  const subHtml = sub
    ? `<p class="menu-card-sub-static">${sub}</p>`
    : "";
  return `<header class="menu-header-row">${menuBackBtn()}<div><p class="menu-kicker">${kicker}</p><h1 class="menu-title menu-title-sm">${title}</h1>${subHtml}</div></header>`;
}

function menuBackBtn(): string {
  return `<button type="button" class="menu-back" data-nav="main" title="Back to main menu (Esc)" aria-keyshortcuts="Escape">← Main menu</button>`;
}

function wireMenuClicks(roots: {
  missions: HTMLElement;
  glossary: HTMLElement;
}): void {
  wireMissionMenuClicks(roots.missions);
  wireMissionMenuKeys(roots.missions);
  wireGlossaryMenuClicks(roots.glossary);
}

function wireMissionMenuClicks(missions: HTMLElement): void {
  missions.addEventListener("click", (e) => handleMissionClick(e));
}

function wireMissionMenuKeys(missions: HTMLElement): void {
  window.addEventListener("keydown", (e) => onMissionMenuKeyDown(missions, e));
}

function onMissionMenuKeyDown(missions: HTMLElement, e: KeyboardEvent): void {
  if (!missionListIsActive(missions)) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (isEditableTarget(e.target)) return;
  if (e.key === "Escape") {
    if (getShellView() !== "missions") return;
    e.preventDefault();
    navigate("/");
    return;
  }
  const path = missionPathForDigit(e.key);
  if (!path) return;
  e.preventDefault();
  navigate(`/mission/${path}`);
}

/** Flight cards are on screen for both the main page and `#/missions`. */
function missionListIsActive(missions: HTMLElement): boolean {
  if (missions.hidden) return false;
  const view = getShellView();
  return view === "main" || view === "missions";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function handleMissionClick(e: Event): void {
  const t = closestNavOrMission(e);
  if (!t) return;
  if (t.dataset.nav === "main") { navigate("/"); return; }
  if (t.dataset.nav === "glossary") { navigate("/glossary"); return; }
  const path = t.dataset.mission;
  if (path) navigate(`/mission/${path}`);
}

function wireGlossaryMenuClicks(glossary: HTMLElement): void {
  glossary.addEventListener("click", (e) => {
    if (navFromEvent(e) === "main") navigate("/");
  });
}

function navFromEvent(e: Event): string | undefined {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-nav]");
  return t?.dataset.nav;
}

function closestNavOrMission(e: Event): HTMLElement | null {
  return (e.target as HTMLElement).closest<HTMLElement>(
    "[data-nav], [data-mission]",
  );
}

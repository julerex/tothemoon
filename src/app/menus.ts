/**
 * Main menu, Mission Menu, and Glossary screens. Pure DOM bind; routing stays in main.
 */

import {
  glossaryGrouped,
  type GlossaryEntry,
} from "./glossary";
import { MISSIONS, type MissionDef } from "./missionCatalog";
import { navigate } from "./shell";

function missionCard(m: MissionDef): string {
  const statusLabel = m.status === "ready" ? "Play" : "Open briefing";
  const statusClass = missionStatusClass(m);
  return missionCardHtml(m, statusLabel, statusClass);
}

function missionStatusClass(m: MissionDef): string {
  return m.status === "ready" ? "mission-card-ready" : "mission-card-preview";
}

function missionCardHtml(
  m: MissionDef,
  statusLabel: string,
  statusClass: string,
): string {
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
  fillMainMenu(roots.main);
  fillMissionMenu(roots.missions);
  fillGlossaryMenu(roots.glossary);
  wireMenuClicks(roots);
}

function requireMenuRoots(): {
  main: HTMLElement;
  missions: HTMLElement;
  glossary: HTMLElement;
} {
  const main = el("main-menu");
  const missions = el("mission-menu");
  const glossary = el("glossary-menu");
  if (!main || !missions || !glossary) throw missingMenuRoots();
  return { main, missions, glossary };
}

function missingMenuRoots(): Error {
  return new Error("Menu roots #main-menu / #mission-menu / #glossary-menu not found");
}

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function fillMainMenu(main: HTMLElement): void {
  main.innerHTML = mainMenuHtml();
}

function mainMenuHtml(): string {
  return [
    '<div class="menu-panel">',
    '<p class="menu-kicker">Interactive mission theater</p>',
    '<h1 class="menu-title">tothemoon</h1>',
    mainMenuLead(),
    mainMenuNav(),
    '<p class="menu-foot">© Julian le Roux 2026 · scene unit = 1&nbsp;km</p>',
    '</div>',
  ].join("");
}

function mainMenuLead(): string {
  return `<p class="menu-lead">True-scale Three.js theaters for Starship-class missions. Pick a mission to scrub the flight, fly the cameras, and watch the timeline.</p>`;
}

function mainMenuNav(): string {
  return `<nav class="menu-actions" aria-label="Main menu">${menuBtn("missions", "Mission Menu", true)}${menuBtn("glossary", "Glossary", false)}<a class="menu-btn menu-btn-ghost" href="https://github.com/julerex/tothemoon" target="_blank" rel="noopener noreferrer">Source on GitHub</a></nav>`;
}

function menuBtn(nav: string, label: string, primary: boolean): string {
  const cls = primary ? "menu-btn menu-btn-primary" : "menu-btn menu-btn-ghost";
  return `<button type="button" class="${cls}" data-nav="${nav}">${label}</button>`;
}

function fillMissionMenu(missions: HTMLElement): void {
  missions.innerHTML = missionMenuHtml();
}

function missionMenuHtml(): string {
  return `
    <div class="menu-panel menu-panel-wide">
      ${menuBackHeader("Choose a flight", "Mission Menu")}
      <div class="mission-grid" role="list">
        ${MISSIONS.map(missionCard).join("")}
      </div>
      <p class="menu-foot">More missions can land here as packs are baked.</p>
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
  return `<button type="button" class="menu-back" data-nav="main" title="Back to main menu">← Main menu</button>`;
}

function menuBackHeader(kicker: string, title: string): string {
  return menuHeaderBlock(kicker, title);
}

function wireMenuClicks(roots: {
  main: HTMLElement;
  missions: HTMLElement;
  glossary: HTMLElement;
}): void {
  wireMainMenuClicks(roots.main);
  wireMissionMenuClicks(roots.missions);
  wireGlossaryMenuClicks(roots.glossary);
}

function wireMainMenuClicks(main: HTMLElement): void {
  main.addEventListener("click", (e) => {
    const nav = navFromEvent(e);
    if (nav === "missions") navigate("/missions");
    if (nav === "glossary") navigate("/glossary");
  });
}

function wireMissionMenuClicks(missions: HTMLElement): void {
  missions.addEventListener("click", (e) => handleMissionClick(e));
}

function handleMissionClick(e: Event): void {
  const t = closestNavOrMission(e);
  if (!t) return;
  if (t.dataset.nav === "main") { navigate("/"); return; }
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

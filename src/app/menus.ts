/**
 * Main menu, Mission Menu, and Glossary screens. Pure DOM bind; routing stays in main.
 * Main-menu items are numbered 1–n and selectable via those digit keys when visible.
 */

import {
  glossaryGrouped,
  type GlossaryEntry,
} from "./glossary";
import { MISSIONS, type MissionDef } from "./missionCatalog";
import { getShellView, navigate } from "./shell";

/** Result of mapping a digit key to a main-menu action. */
export type MainMenuKeyAction =
  | { type: "nav"; path: string }
  | { type: "external"; href: string };

type MainMenuNavItem = {
  digit: string;
  kind: "nav";
  nav: string;
  path: string;
  label: string;
  primary: boolean;
};

type MainMenuLinkItem = {
  digit: string;
  kind: "link";
  href: string;
  label: string;
};

type MainMenuItem = MainMenuNavItem | MainMenuLinkItem;

/** One orientation bullet on the home menu. */
export type MainMenuPoint = { title: string; detail: string };

/**
 * Home-menu orientation copy. Keep these theater-honest (not flight-ops).
 */
export const MAIN_MENU_POINTS: readonly MainMenuPoint[] = [
  {
    title: "True scale",
    detail:
      "Earth, Moon, and the stack live in kilometres. One scene unit is 1 km.",
  },
  {
    title: "Two missions",
    detail:
      "Starship Flight 13 is the July 2026 flight test. Starbase → Moon flies ascent through lunar arrival.",
  },
  {
    title: "Play, scrub, share",
    detail:
      "Pause, change speed, or jump the timeline. The address bar keeps a t= clock you can copy.",
  },
  {
    title: "Cameras",
    detail:
      "Auto-cam follows the webcast (toggle G). Rail buttons, mouse, and WASD take a seat of your own.",
  },
  {
    title: "HUD",
    detail:
      "H hides chrome for a clean view. Open the glossary when a label needs a plain-language definition.",
  },
  {
    title: "This screen",
    detail:
      "Number keys 1–3 match the buttons. Esc returns here from Mission Menu and Glossary.",
  },
];

/** Main menu entries in display order (digit keys 1…n). */
export const MAIN_MENU_ITEMS: readonly MainMenuItem[] = [
  {
    digit: "1",
    kind: "nav",
    nav: "missions",
    path: "/missions",
    label: "Mission Menu",
    primary: true,
  },
  {
    digit: "2",
    kind: "nav",
    nav: "glossary",
    path: "/glossary",
    label: "Glossary",
    primary: false,
  },
  {
    digit: "3",
    kind: "link",
    href: "https://github.com/julerex/tothemoon",
    label: "Source on GitHub",
  },
];

/**
 * Map a keyboard digit (`"1"`…`"9"`) to a main-menu action, or null if unbound.
 */
export function mainMenuActionForDigit(digit: string): MainMenuKeyAction | null {
  const item = MAIN_MENU_ITEMS.find((i) => i.digit === digit);
  if (!item) return null;
  if (item.kind === "nav") return { type: "nav", path: item.path };
  return { type: "external", href: item.href };
}

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
    '<div class="menu-panel menu-panel-home">',
    '<p class="menu-kicker">Interactive mission theater</p>',
    '<h1 class="menu-title">tothemoon</h1>',
    mainMenuLead(),
    mainMenuPoints(),
    mainMenuNav(),
    '<p class="menu-foot">© Julian le Roux 2026 · scene unit = 1&nbsp;km · number keys select menu items</p>',
    '</div>',
  ].join("");
}

function mainMenuLead(): string {
  return `<p class="menu-lead">True-scale Three.js theaters for Starship-class missions. Pick a flight, then watch or drive the camera yourself.</p>`;
}

function mainMenuPoints(): string {
  const items = MAIN_MENU_POINTS.map(mainMenuPointHtml).join("");
  return `<ul class="menu-points">${items}</ul>`;
}

function mainMenuPointHtml(p: MainMenuPoint): string {
  return `<li class="menu-point"><p class="menu-point-title">${escapeHtml(p.title)}</p><p class="menu-point-detail">${escapeHtml(p.detail)}</p></li>`;
}

function mainMenuNav(): string {
  const buttons = MAIN_MENU_ITEMS.map(mainMenuItemHtml).join("");
  return `<nav class="menu-actions" aria-label="Main menu">${buttons}</nav>`;
}

function mainMenuItemHtml(item: MainMenuItem): string {
  const label = numberedLabel(item.digit, item.label);
  if (item.kind === "link") {
    return `<a class="menu-btn menu-btn-ghost" href="${escapeAttr(item.href)}" target="_blank" rel="noopener noreferrer" data-menu-digit="${item.digit}" aria-keyshortcuts="${item.digit}">${label}</a>`;
  }
  const cls = item.primary ? "menu-btn menu-btn-primary" : "menu-btn menu-btn-ghost";
  return `<button type="button" class="${cls}" data-nav="${item.nav}" data-menu-digit="${item.digit}" aria-keyshortcuts="${item.digit}">${label}</button>`;
}

function numberedLabel(digit: string, label: string): string {
  return `<span class="menu-btn-num" aria-hidden="true">${digit}</span><span class="menu-btn-text">${escapeHtml(label)}</span>`;
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
  return `<button type="button" class="menu-back" data-nav="main" title="Back to main menu (Esc)" aria-keyshortcuts="Escape">← Main menu</button>`;
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
  wireMainMenuKeys(roots.main);
  wireMissionMenuClicks(roots.missions);
  wireMissionMenuKeys(roots.missions);
  wireGlossaryMenuClicks(roots.glossary);
}

function wireMainMenuClicks(main: HTMLElement): void {
  main.addEventListener("click", (e) => {
    const nav = navFromEvent(e);
    if (nav === "missions") navigate("/missions");
    if (nav === "glossary") navigate("/glossary");
  });
}

function wireMainMenuKeys(main: HTMLElement): void {
  window.addEventListener("keydown", (e) => onMainMenuKeyDown(main, e));
}

function onMainMenuKeyDown(main: HTMLElement, e: KeyboardEvent): void {
  if (getShellView() !== "main") return;
  if (main.hidden) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (isEditableTarget(e.target)) return;
  const action = mainMenuActionForDigit(e.key);
  if (!action) return;
  e.preventDefault();
  runMainMenuAction(main, action);
}

function runMainMenuAction(main: HTMLElement, action: MainMenuKeyAction): void {
  if (action.type === "nav") {
    navigate(action.path);
    return;
  }
  const digit = MAIN_MENU_ITEMS.find(
    (i) => i.kind === "link" && i.href === action.href,
  )?.digit;
  const link = digit
    ? main.querySelector<HTMLAnchorElement>(`a[data-menu-digit="${digit}"]`)
    : null;
  if (link) link.click();
  else window.open(action.href, "_blank", "noopener,noreferrer");
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function wireMissionMenuClicks(missions: HTMLElement): void {
  missions.addEventListener("click", (e) => handleMissionClick(e));
}

function wireMissionMenuKeys(missions: HTMLElement): void {
  window.addEventListener("keydown", (e) => onMissionMenuKeyDown(missions, e));
}

function onMissionMenuKeyDown(missions: HTMLElement, e: KeyboardEvent): void {
  if (getShellView() !== "missions") return;
  if (missions.hidden) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (isEditableTarget(e.target)) return;
  if (e.key !== "Escape") return;
  e.preventDefault();
  navigate("/");
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

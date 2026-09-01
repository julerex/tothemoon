/**
 * App shell: show/hide menu vs mission theater surfaces.
 * Theater is the canvas + mission HUD; menus sit above a static backdrop.
 */

import { seekParamFromQuery } from "./seekUrl";

export type ShellView = "main" | "missions" | "glossary" | "theater";

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/**
 * Show or hide the 3D canvas. HUD chrome (side info bars + ticker) stays
 * up so menus can sit flush against those rails.
 */
export function setTheaterVisible(visible: boolean): void {
  const canvas = el("c");
  if (canvas) canvas.hidden = !visible;
  if (!visible) {
    const underground = el("underground");
    if (underground) underground.hidden = true;
  }
  if (visible) {
    document.body.classList.add("theater-active");
    document.body.classList.remove("menus-active");
  }
}

function showTheaterShell(): void {
  const menusRoot = el("menus");
  if (menusRoot) menusRoot.hidden = true;
  setTheaterVisible(true);
}

function setMenuPanelVisibility(view: Exclude<ShellView, "theater">): void {
  const mainMenu = el("main-menu");
  const missionMenu = el("mission-menu");
  const glossaryMenu = el("glossary-menu");
  if (mainMenu) mainMenu.hidden = view !== "main";
  if (missionMenu) missionMenu.hidden = view !== "missions";
  if (glossaryMenu) glossaryMenu.hidden = view !== "glossary";
}

function showMenuShell(view: Exclude<ShellView, "theater">): void {
  const menusRoot = el("menus");
  setTheaterVisible(false);
  if (menusRoot) menusRoot.hidden = false;
  document.body.classList.add("menus-active");
  document.body.classList.remove("theater-active");
  setMenuPanelVisibility(view);
}

/**
 * Switch between main menu, mission picker, glossary, and (after a mission
 * starts) theater. Does not start mission code — only DOM visibility.
 */
export function setShellView(view: ShellView): void {
  if (view === "theater") showTheaterShell();
  else showMenuShell(view);
}

/**
 * Active surface, derived from the hash rather than mirrored in module state:
 * every view transition goes through a route (`#/mission/<path>` → theater).
 */
export function getShellView(): ShellView {
  const route = parseRoute();
  return route.kind === "mission" ? "theater" : route.kind;
}

/** Navigate via hash so refresh / share links restore the screen. */
export function navigate(hashPath: string): void {
  const path = hashPath.startsWith("#") ? hashPath : `#${hashPath}`;
  if (location.hash === path) {
    // Force hashchange consumers when already on the same path
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  location.hash = path;
}

export type ParsedRoute = {
  kind: "main" | "missions" | "glossary" | "mission";
  missionPath?: string;
  /** Physics mission time (s) from `t=`; negative = T− countdown. */
  seekT?: number;
};

function splitHash(hash: string): { path: string; query: URLSearchParams } {
  const stripped = hash.replace(/^#/, "");
  const q = stripped.indexOf("?");
  const pathRaw = q >= 0 ? stripped.slice(0, q) : stripped;
  const path = (pathRaw || "/").replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(q >= 0 ? stripped.slice(q + 1) : "");
  return { path, query };
}

function parseMissionRoute(raw: string): ParsedRoute | null {
  const m = raw.match(/^\/?mission\/([^/]+)$/);
  if (!m?.[1]) return null;
  return { kind: "mission", missionPath: m[1] };
}

function seekTFromQueries(
  hashQuery: URLSearchParams,
  search = "",
): number | undefined {
  const fromHash = seekParamFromQuery(hashQuery);
  if (fromHash != null) return fromHash;
  return seekParamFromQuery(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search));
}

/**
 * Parse location.hash into a route.
 * `#/` or empty → main; `#/missions` → picker; `#/glossary` → glossary;
 * `#/mission/<id>` → mission; optional `?t=` seeks the mission clock
 * (hash query wins over `location.search`).
 */
export function parseRoute(
  hash = typeof location !== "undefined" ? location.hash : "",
  search = typeof location !== "undefined" ? location.search : "",
): ParsedRoute {
  const { path, query } = splitHash(hash);
  if (path === "/" || path === "") return { kind: "main" };
  if (path === "/missions" || path === "missions") return { kind: "missions" };
  if (path === "/glossary" || path === "glossary") return { kind: "glossary" };
  const mission = parseMissionRoute(path);
  if (!mission) return { kind: "main" };
  const seekT = seekTFromQueries(query, search);
  return seekT == null ? mission : { ...mission, seekT };
}

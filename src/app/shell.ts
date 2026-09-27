/**
 * App shell: show/hide menu vs mission theater surfaces.
 * Theater is the canvas plus the mission HUD. Menu pages are the flight
 * list (or the glossary) on a static backdrop, with that HUD hidden.
 */

import { seekParamFromQuery } from "./seekUrl";

export type ShellView = "main" | "missions" | "glossary" | "theater";

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/**
 * Show or hide the 3D canvas. Menu pages do not keep the mission HUD;
 * `body.menus-active` hides that chrome in CSS.
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
  setMissionHudPresented(true);
  setTheaterVisible(true);
}

/** Mission HUD is in the tree only while a theater is up. */
function setMissionHudPresented(presented: boolean): void {
  const hud = el("hud");
  if (!hud) return;
  hud.setAttribute("aria-hidden", presented ? "false" : "true");
}

/**
 * Panel shown for a menu route. The main page and `#/missions` both
 * show the flight cards. The glossary stays its own screen.
 */
export function menuPanelForView(
  view: Exclude<ShellView, "theater">,
): "missions" | "glossary" {
  return view === "glossary" ? "glossary" : "missions";
}

function setMenuPanelVisibility(view: Exclude<ShellView, "theater">): void {
  const panel = menuPanelForView(view);
  const missionMenu = el("mission-menu");
  const glossaryMenu = el("glossary-menu");
  if (missionMenu) missionMenu.hidden = panel !== "missions";
  if (glossaryMenu) glossaryMenu.hidden = panel !== "glossary";
}

function showMenuShell(view: Exclude<ShellView, "theater">): void {
  const menusRoot = el("menus");
  setTheaterVisible(false);
  setMissionHudPresented(false);
  if (menusRoot) menusRoot.hidden = false;
  document.body.classList.add("menus-active");
  document.body.classList.remove("theater-active");
  setMenuPanelVisibility(view);
}

/**
 * Switch between the mission list, glossary, and (after a mission starts)
 * theater. Does not start mission code — only DOM visibility.
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

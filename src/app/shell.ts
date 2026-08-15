/**
 * App shell: show/hide menu vs mission theater surfaces.
 * Theater is the canvas + mission HUD; menus sit above a static backdrop.
 */

export type ShellView = "main" | "missions" | "glossary" | "theater";

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/**
 * Show or hide the 3D canvas and mission HUD.
 * Menus stay independent so a mission can opt into theater later.
 */
export function setTheaterVisible(visible: boolean): void {
  const canvas = el("c");
  const hud = el("hud");
  if (canvas) canvas.hidden = !visible;
  if (hud) hud.hidden = !visible;
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

type ParsedRoute = {
  kind: "main" | "missions" | "glossary" | "mission";
  missionPath?: string;
};

function parseMissionRoute(raw: string): ParsedRoute | null {
  const m = raw.match(/^\/?mission\/([^/]+)$/);
  if (!m?.[1]) return null;
  return { kind: "mission", missionPath: m[1] };
}

/**
 * Parse location.hash into a route.
 * `#/` or empty → main; `#/missions` → picker; `#/glossary` → glossary;
 * `#/mission/<id>` → mission.
 */
export function parseRoute(hash = location.hash): ParsedRoute {
  const raw = (hash.replace(/^#/, "") || "/").replace(/\/+$/, "") || "/";
  if (raw === "/" || raw === "") return { kind: "main" };
  if (raw === "/missions" || raw === "missions") return { kind: "missions" };
  if (raw === "/glossary" || raw === "glossary") return { kind: "glossary" };
  return parseMissionRoute(raw) ?? { kind: "main" };
}

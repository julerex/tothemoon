/**
 * App shell: show/hide menu vs mission theater surfaces.
 * Theater is the canvas + mission HUD; menus sit above a static backdrop.
 */

export type ShellView = "main" | "missions" | "theater";

let currentView: ShellView = "main";

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

/**
 * Switch between main menu, mission picker, and (after a mission starts) theater.
 * Does not start mission code — only DOM visibility.
 */
export function setShellView(view: ShellView): void {
  currentView = view;
  const mainMenu = el("main-menu");
  const missionMenu = el("mission-menu");
  const menusRoot = el("menus");

  if (view === "theater") {
    if (menusRoot) menusRoot.hidden = true;
    setTheaterVisible(true);
    return;
  }

  setTheaterVisible(false);
  if (menusRoot) menusRoot.hidden = false;
  document.body.classList.add("menus-active");
  document.body.classList.remove("theater-active");

  if (mainMenu) mainMenu.hidden = view !== "main";
  if (missionMenu) missionMenu.hidden = view !== "missions";
}

export function getShellView(): ShellView {
  return currentView;
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

/**
 * Parse location.hash into a route.
 * `#/` or empty → main; `#/missions` → picker; `#/mission/<id>` → mission.
 */
export function parseRoute(hash = location.hash): {
  kind: "main" | "missions" | "mission";
  missionPath?: string;
} {
  const raw = (hash.replace(/^#/, "") || "/").replace(/\/+$/, "") || "/";
  if (raw === "/" || raw === "") return { kind: "main" };
  if (raw === "/missions" || raw === "missions") return { kind: "missions" };
  const m = raw.match(/^\/?mission\/([^/]+)$/);
  if (m?.[1]) return { kind: "mission", missionPath: m[1] };
  // Unknown → main menu
  return { kind: "main" };
}

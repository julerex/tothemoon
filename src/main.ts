/**
 * App entry: menu shell first, then lazy-load the selected mission.
 *
 * Routes (hash):
 *   #/                  Main menu
 *   #/missions          Mission Menu
 *   #/glossary          Glossary
 *   #/mission/<path>    Start that mission (to-the-moon | flight-13)
 */
import "./style.css";
import { bindMenus } from "./app/menus";
import { missionByPath, type MissionDef } from "./app/missionCatalog";
import { navigate, parseRoute, setShellView } from "./app/shell";

/** Once a full theater is running we avoid double-start without reload. */
let theaterStarted = false;

bindMenus();

function hideBriefing(): void {
  const briefing = document.getElementById("flight13-briefing");
  if (briefing) briefing.hidden = true;
}

/** Reload if leaving an active theater via hash navigation. */
function leaveTheaterIfNeeded(): boolean {
  if (!theaterStarted) return false;
  location.reload();
  return true;
}

function showMenuView(
  view: "main" | "missions" | "glossary",
  title: string,
): void {
  if (leaveTheaterIfNeeded()) return;
  hideBriefing();
  setShellView(view);
  document.title = title;
}

async function startToTheMoonTheater(): Promise<void> {
  theaterStarted = true;
  setShellView("theater");
  const { startToTheMoonMission } = await import("./missions/toTheMoon");
  startToTheMoonMission();
}

async function startFlight13TheaterRoute(): Promise<void> {
  theaterStarted = true;
  setShellView("theater");
  const { startFlight13Mission } = await import("./missions/flight13");
  startFlight13Mission();
}

async function launchMissionTheater(def: MissionDef): Promise<void> {
  if (def.id === "to-the-moon") {
    await startToTheMoonTheater();
    return;
  }
  if (def.id === "flight-13") {
    await startFlight13TheaterRoute();
    return;
  }
  navigate("/missions");
}

async function enterTheater(def: MissionDef): Promise<void> {
  if (theaterStarted) {
    setShellView("theater");
    return;
  }
  await launchMissionTheater(def);
}

async function startMission(path: string): Promise<void> {
  const def = missionByPath(path);
  if (!def) {
    navigate("/missions");
    return;
  }
  hideBriefing();
  await enterTheater(def);
}

function applyMenuRoute(kind: "main" | "missions" | "glossary"): void {
  if (kind === "main") showMenuView("main", "tothemoon");
  else if (kind === "missions") showMenuView("missions", "tothemoon — Mission Menu");
  else showMenuView("glossary", "tothemoon — Glossary");
}

function applyRoute(): void {
  const route = parseRoute();
  if (route.kind === "main" || route.kind === "missions" || route.kind === "glossary") {
    applyMenuRoute(route.kind);
    return;
  }
  if (route.kind === "mission" && route.missionPath) {
    void startMission(route.missionPath);
  }
}

window.addEventListener("hashchange", () => {
  applyRoute();
});

// Default: main menu when no hash
if (!location.hash || location.hash === "#") {
  location.replace("#/");
}
applyRoute();

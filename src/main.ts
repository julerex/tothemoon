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
import { missionByPath } from "./app/missionCatalog";
import { navigate, parseRoute, setShellView } from "./app/shell";

/** Once a full theater is running we avoid double-start without reload. */
let theaterStarted = false;

bindMenus();

async function startMission(path: string): Promise<void> {
  const def = missionByPath(path);
  if (!def) {
    navigate("/missions");
    return;
  }

  // Hide flight-13 briefing if leaving it
  hideBriefing();

  if (def.id === "to-the-moon") {
    if (theaterStarted) {
      // Already in lunar theater (e.g. hash re-fire) — stay put
      setShellView("theater");
      return;
    }
    theaterStarted = true;
    setShellView("theater");
    const { startToTheMoonMission } = await import("./missions/toTheMoon");
    startToTheMoonMission();
    return;
  }

  if (def.id === "flight-13") {
    if (theaterStarted) {
      setShellView("theater");
      return;
    }
    theaterStarted = true;
    setShellView("theater");
    const { startFlight13Mission } = await import("./missions/flight13");
    startFlight13Mission();
    return;
  }

  navigate("/missions");
}

function hideBriefing(): void {
  const briefing = document.getElementById("flight13-briefing");
  if (briefing) briefing.hidden = true;
}

function applyRoute(): void {
  const route = parseRoute();
  if (route.kind === "main") {
    if (theaterStarted) {
      // Leaving an active theater via hash requires a clean reload
      location.reload();
      return;
    }
    hideBriefing();
    setShellView("main");
    document.title = "tothemoon";
    return;
  }
  if (route.kind === "missions") {
    if (theaterStarted) {
      location.reload();
      return;
    }
    hideBriefing();
    setShellView("missions");
    document.title = "tothemoon — Mission Menu";
    return;
  }
  if (route.kind === "glossary") {
    if (theaterStarted) {
      location.reload();
      return;
    }
    hideBriefing();
    setShellView("glossary");
    document.title = "tothemoon — Glossary";
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

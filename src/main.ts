/**
 * App entry: menu shell first, then lazy-load the selected mission.
 *
 * Routes (hash):
 *   #/                  Main menu
 *   #/missions          Mission Menu
 *   #/glossary          Glossary
 *   #/mission/<path>    Start that mission (to-the-moon | flight-13)
 *   #/mission/<path>?t= Seek that mission to a clock time (H:MM:SS / seconds)
 */
import "./style.css";
import { bindMenus } from "./app/menus";
import { missionByPath, type MissionDef, type MissionId } from "./app/missionCatalog";
import { applyTheaterSeek, type MissionStartOpts } from "./app/seekUrl";
import { navigate, parseRoute, setShellView } from "./app/shell";
import {
  hideTheaterLoading,
  setTheaterLoadingProgress,
  showTheaterLoading,
} from "./app/theaterLoading";
import { installTheaterBridgeStub } from "./debug/theaterBridge";
import {
  assetLoadFraction,
  assetLoadStatus,
  beginAssetBatch,
  onAssetProgress,
  waitForAssets,
} from "./scene/assetLoad";

/** Once a full theater is running we avoid double-start without reload. */
let theaterStarted = false;

bindMenus();
installTheaterBridgeStub();

/** Unveils the debug bridge after the loading overlay is gone. */
type TheaterUnveiler = () => void;

/** Lazy theater entry point per mission — keeps physics packs out of the shell bundle. */
const MISSION_THEATERS: Readonly<
  Record<MissionId, () => Promise<(opts?: MissionStartOpts) => TheaterUnveiler>>
> = {
  "to-the-moon": () =>
    import("./missions/toTheMoon").then((m) => m.startToTheMoonMission),
  "flight-13": () =>
    import("./missions/flight13").then((m) => m.startFlight13Mission),
};

/** Document title per menu surface. */
const MENU_TITLES: Readonly<Record<"main" | "missions" | "glossary", string>> = {
  main: "tothemoon",
  missions: "tothemoon — Mission Menu",
  glossary: "tothemoon — Glossary",
};

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

function showMenuView(view: "main" | "missions" | "glossary"): void {
  if (leaveTheaterIfNeeded()) return;
  hideBriefing();
  setShellView(view);
  document.title = MENU_TITLES[view];
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Two rAFs so the first textured frames can compile under the overlay. */
function afterTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

const MIN_LOADING_MS = 280;

async function launchMissionTheater(
  def: MissionDef,
  opts?: MissionStartOpts,
): Promise<void> {
  const loadTheater = MISSION_THEATERS[def.id];
  if (!loadTheater) {
    navigate("/missions");
    return;
  }
  theaterStarted = true;
  beginAssetBatch();
  showTheaterLoading(def.title);
  const unsub = onAssetProgress((loaded, total) => {
    setTheaterLoadingProgress(
      assetLoadStatus(loaded, total),
      assetLoadFraction(loaded, total),
    );
  });
  const shownAt = performance.now();
  let unveil: TheaterUnveiler | undefined;
  try {
    setShellView("theater");
    const startMission = await loadTheater();
    setTheaterLoadingProgress("Building scene…", 0);
    unveil = startMission(opts);
    await waitForAssets();
    await afterTwoFrames();
    const hold = MIN_LOADING_MS - (performance.now() - shownAt);
    if (hold > 0) await waitMs(hold);
  } finally {
    unsub();
    await hideTheaterLoading();
    unveil?.();
  }
}

async function enterTheater(
  def: MissionDef,
  opts?: MissionStartOpts,
): Promise<void> {
  if (theaterStarted) {
    setShellView("theater");
    if (opts?.seekT != null) applyTheaterSeek(opts.seekT);
    return;
  }
  await launchMissionTheater(def, opts);
}

async function startMission(path: string, opts?: MissionStartOpts): Promise<void> {
  const def = missionByPath(path);
  if (!def) {
    navigate("/missions");
    return;
  }
  hideBriefing();
  await enterTheater(def, opts);
}

function applyRoute(): void {
  const route = parseRoute();
  if (route.kind === "mission") {
    if (route.missionPath) {
      void startMission(route.missionPath, { seekT: route.seekT });
    }
    return;
  }
  showMenuView(route.kind);
}

window.addEventListener("hashchange", () => {
  applyRoute();
});

// Default: main menu when no hash
if (!location.hash || location.hash === "#") {
  location.replace("#/");
}
applyRoute();

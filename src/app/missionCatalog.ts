/**
 * Multi-mission catalog for the menu shell.
 * Each mission is a lazy-loaded entry point; physics packs stay mission-local.
 */

export type MissionId = "to-the-moon" | "flight-13";

export type MissionStatus = "ready" | "preview";

export type MissionDef = {
  id: MissionId;
  title: string;
  subtitle: string;
  blurb: string;
  /** Short badge for cards (e.g. "July 2027", "Flight test") */
  badge: string;
  status: MissionStatus;
  /** Hash path segment: `#/mission/<path>` */
  path: string;
};

export const MISSIONS: readonly MissionDef[] = [
  {
    id: "to-the-moon",
    title: "Starbase → Moon",
    subtitle: "July 2027 · Boca Chica · true scale",
    blurb:
      "Interactive theater: staged ascent from Starbase, low Earth orbit dogleg, " +
      "translunar injection, ballistic n-body coast, and lunar arrival.",
    badge: "Full theater",
    status: "ready",
    path: "to-the-moon",
  },
  {
    id: "flight-13",
    title: "Starship Flight 13",
    subtitle: "July 2026 · Starbase · flight test profile",
    blurb:
      "Recent Starship / Super Heavy V3 flight test: Gulf of America booster " +
      "landing burn, Starlink V3 deploy demo, Raptor in-space relight, " +
      "Indian Ocean splashdown. Theater in progress — briefing + timeline ready.",
    badge: "Briefing",
    status: "preview",
    path: "flight-13",
  },
] as const;

export function missionById(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id || m.path === id);
}

export function missionByPath(path: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.path === path || m.id === path);
}

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
  status: MissionStatus;
  /** Hash path segment: `#/mission/<path>` */
  path: string;
};

export const MISSIONS: readonly MissionDef[] = [
  {
    id: "flight-13",
    title: "Starship Flight 13",
    subtitle: "July 2026 · Starbase · flight test · true scale",
    blurb:
      "Full theater: staged ascent, hot-stage, suborbital coast, Raptor relight, " +
      "entry, and Indian Ocean splashdown on the public Flight 13 timeline. " +
      "Same visual stack as the lunar mission (pad, craft, cameras, HUD).",
    status: "ready",
    path: "flight-13",
  },
  {
    id: "to-the-moon",
    title: "Starbase → Moon",
    subtitle: "July 2027 · Boca Chica · true scale",
    blurb:
      "Interactive theater: staged ascent from Starbase, low Earth orbit dogleg, " +
      "translunar injection, ballistic n-body coast, and lunar arrival.",
    status: "ready",
    path: "to-the-moon",
  },
] as const;

export function missionById(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id || m.path === id);
}

export function missionByPath(path: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.path === path || m.id === path);
}

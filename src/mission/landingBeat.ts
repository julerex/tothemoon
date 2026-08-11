/**
 * Terminal landing beat: settle camera, hold 1× for a few wall-clock seconds,
 * then reveal the mission-complete card.
 *
 * Pure helpers stay scrub-deterministic; wall-clock hold lives in main.
 */

import type { CameraMode } from "../camera/modes";
import type { PhaseId } from "../physics/missionTypes";

/** Wall-clock hold before the complete card takes focus (seconds). */
export const LANDING_BEAT_HOLD_S = 3.2;

/**
 * Theater selenographic name for the south-pole site.
 * Not a surveyed Artemis pin — documented as theater in README / NEXT.
 */
export const LANDING_SITE_LABEL = "Malapert Massif";

/** Short secondary line for site plates / complete card. */
export const LANDING_SITE_DETAIL = "Lunar south pole · theater";

export type LandingBeatKind = "landed" | "impact" | "flyby";

/**
 * Classify the terminal beat once the mission is complete.
 * Returns null when the craft is still en route.
 */
export function classifyLandingBeat(
  phase: PhaseId,
  missionComplete: boolean,
): LandingBeatKind | null {
  if (!missionComplete) return null;
  if (phase === "landed" || phase === "descent" || phase === "splashdown") return "landed";
  if (phase === "impact") return "impact";
  return "flyby";
}

/** Camera focus for the terminal settle (Ship on surface, Moon for impact/flyby). */
export function landingBeatCameraMode(kind: LandingBeatKind): CameraMode {
  switch (kind) {
    case "landed":
      return "chase";
    case "impact":
    case "flyby":
      return "moon";
  }
}

/**
 * Whether the mission-complete card may show after `wallAgeS` seconds
 * since the beat started (wall-clock, not mission time).
 */
export function landingBeatCardReady(
  wallAgeS: number,
  holdS: number = LANDING_BEAT_HOLD_S,
): boolean {
  if (!Number.isFinite(wallAgeS) || wallAgeS < 0) return false;
  return wallAgeS >= holdS;
}

function lunarCompleteSubtitle(kind: LandingBeatKind | null | undefined): string {
  if (kind === "landed") return `Starbase → ${LANDING_SITE_LABEL} · July 2027`;
  if (kind === "impact") return "Starbase → lunar impact · July 2027";
  if (kind === "flyby") return "Starbase → lunar flyby · July 2027";
  return "Starbase → lunar surface · July 2027";
}

/** Subtitle copy for the mission-complete card. */
export function landingBeatCompleteSubtitle(
  kind: LandingBeatKind | null | undefined,
  opts?: { splashdown?: boolean },
): string {
  if (opts?.splashdown) return "Starbase → Indian Ocean splashdown · Flight 13";
  return lunarCompleteSubtitle(kind);
}

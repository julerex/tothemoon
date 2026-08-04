/**
 * Scrubber event ticks: which narrative beats get clickable marks under the
 * mission range (paired with phase marks above the track).
 *
 * Secondary beats (staging, dogleg, return to launch site theater) are flagged for slightly
 * different styling so they read as mid-phase callouts, not phase starts.
 */

import type { MissionEvent } from "./timeline";

/** Event ids that are not phase-entry markers. */
const SECONDARY_IDS = new Set([
  "staging",
  "boostback",
  "booster-catch",
  "dogleg",
]);

export type ScrubEventTick = {
  event: MissionEvent;
  /** Mid-phase / theater beat (vs phase-entry callout). */
  secondary: boolean;
};

/**
 * Build scrubber event ticks from the timeline event list.
 * Preserves event order; one tick per event id already deduped by timeline.
 */
export function buildScrubEventTicks(
  events: MissionEvent[],
): ScrubEventTick[] {
  return events.map((event) => ({
    event,
    secondary: SECONDARY_IDS.has(event.id),
  }));
}

/** True when `id` is a mid-phase theater beat rather than a phase entry. */
export function isSecondaryScrubEvent(id: string): boolean {
  return SECONDARY_IDS.has(id);
}

/**
 * Cinematic bookmarks: seek + camera framing for key mission beats.
 *
 * Built from {@link MissionTimeline} events / phase segments so bookmarks stay
 * aligned with the baked trajectory. Missing beats (e.g. no LOI on pure
 * impact arcs) are omitted rather than guessed.
 */

import type { CameraMode } from "../camera/modes";
import type { MissionEvent, MissionTimeline, PhaseSegment } from "./timeline";

/** One-shot jump: mission time + guided focus framing. */
export type CinematicBookmark = {
  id: string;
  /** Full label for tooltips / toasts */
  label: string;
  /** Compact button text */
  shortLabel: string;
  /** Mission time (s) */
  t: number;
  /** Normalized progress [0, 1] */
  u: number;
  mode: CameraMode;
  /** Zoom so the subject fills a comfortable fraction of the view */
  frame: boolean;
  /**
   * Multiplier on framed distance (e.g. wide Earth for cislunar coast).
   * Same convention as Auto-cam.
   */
  frameScale?: number;
};

/** Preset id order for UI buttons and Shift+1… keys. */
export const BOOKMARK_IDS = [
  "pad",
  "staging",
  "tli",
  "halfway",
  "loi",
  "touchdown",
] as const;

export type BookmarkId = (typeof BOOKMARK_IDS)[number];

type BookmarkSpec = {
  id: BookmarkId;
  label: string;
  shortLabel: string;
  mode: CameraMode;
  frame: boolean;
  frameScale?: number;
  /** Resolve mission time from timeline; null → omit bookmark. */
  resolveT: (tl: MissionTimeline) => number | null;
};

const SPECS: BookmarkSpec[] = [
  {
    id: "pad",
    label: "Pad",
    shortLabel: "Pad",
    mode: "starbase",
    frame: true,
    resolveT: (tl) => eventT(tl, "liftoff") ?? segmentT0(tl, "launch") ?? 0,
  },
  {
    id: "staging",
    label: "Staging",
    shortLabel: "Stage",
    mode: "chase",
    frame: true,
    resolveT: (tl) => eventT(tl, "staging"),
  },
  {
    id: "tli",
    label: "TLI",
    shortLabel: "TLI",
    mode: "chase",
    frame: true,
    resolveT: (tl) => eventT(tl, "tli") ?? segmentT0(tl, "tli"),
  },
  {
    id: "halfway",
    label: "Halfway",
    shortLabel: "Half",
    mode: "earth",
    frame: true,
    // Match Auto-cam coast overview so both bodies stay readable.
    frameScale: 22,
    resolveT: (tl) => halfwayCoastT(tl),
  },
  {
    id: "loi",
    label: "LOI",
    shortLabel: "LOI",
    mode: "moon",
    frame: true,
    resolveT: (tl) => eventT(tl, "loi") ?? segmentT0(tl, "approach"),
  },
  {
    id: "touchdown",
    label: "Touchdown",
    shortLabel: "Land",
    mode: "chase",
    frame: true,
    resolveT: (tl) => resolveTouchdown(tl)?.t ?? null,
  },
];

/**
 * Build available cinematic bookmarks from a mission timeline.
 * Order is always {@link BOOKMARK_IDS}; absent beats are skipped.
 */
export function buildBookmarks(timeline: MissionTimeline): CinematicBookmark[] {
  const dur = Math.max(timeline.durationS, 1);
  const out: CinematicBookmark[] = [];

  for (const spec of SPECS) {
    const tRaw = spec.resolveT(timeline);
    if (tRaw == null || !Number.isFinite(tRaw)) continue;

    let t = clamp(tRaw, 0, dur);
    let mode = spec.mode;
    let label = spec.label;
    let shortLabel = spec.shortLabel;

    // Impact arcs: still offer a terminal beat, framed on the Moon.
    if (spec.id === "touchdown") {
      const term = resolveTouchdown(timeline);
      if (!term) continue;
      t = clamp(term.t, 0, dur);
      mode = term.mode;
      label = term.label;
      shortLabel = term.shortLabel;
    }

    out.push({
      id: spec.id,
      label,
      shortLabel,
      t,
      u: clamp(t / dur, 0, 1),
      mode,
      frame: spec.frame,
      frameScale: spec.frameScale,
    });
  }

  return out;
}

/**
 * Map Shift+1…Shift+N (1-based) to a bookmark in the built list.
 * Returns null when the key index is out of range.
 */
export function bookmarkForShiftDigit(
  bookmarks: CinematicBookmark[],
  digit: number,
): CinematicBookmark | null {
  if (!Number.isInteger(digit) || digit < 1) return null;
  return bookmarks[digit - 1] ?? null;
}

function eventT(tl: MissionTimeline, id: string): number | null {
  const ev = findEvent(tl.events, id);
  return ev ? ev.t : null;
}

function findEvent(events: MissionEvent[], id: string): MissionEvent | null {
  return events.find((e) => e.id === id) ?? null;
}

function segmentT0(tl: MissionTimeline, phase: string): number | null {
  const seg = findSegment(tl.segments, phase);
  return seg ? seg.t0 : null;
}

function findSegment(
  segments: PhaseSegment[],
  phase: string,
): PhaseSegment | null {
  return segments.find((s) => s.phase === phase) ?? null;
}

/** Midpoint of the coast segment, else mid-mission as a weak fallback. */
function halfwayCoastT(tl: MissionTimeline): number | null {
  const coast = findSegment(tl.segments, "coast");
  if (coast) {
    return (coast.t0 + coast.t1) * 0.5;
  }
  // Pure impact / short missions without a coast phase: mid duration
  if (tl.durationS > 0) return tl.durationS * 0.5;
  return null;
}

function resolveTouchdown(
  tl: MissionTimeline,
): {
  t: number;
  mode: CameraMode;
  label: string;
  shortLabel: string;
} | null {
  const landT =
    eventT(tl, "touchdown") ?? segmentT0(tl, "landed");
  if (landT != null) {
    return {
      t: landT,
      mode: "chase",
      label: "Touchdown",
      shortLabel: "Land",
    };
  }
  const impactT = eventT(tl, "impact") ?? segmentT0(tl, "impact");
  if (impactT != null) {
    return {
      t: impactT,
      mode: "moon",
      label: "Impact",
      shortLabel: "Impact",
    };
  }
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

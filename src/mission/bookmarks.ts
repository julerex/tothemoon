/**
 * Cinematic bookmarks: seek + camera framing for key mission beats.
 *
 * Built from {@link MissionTimeline} events / phase segments so bookmarks stay
 * aligned with the baked trajectory. Missing beats (e.g. no lunar orbit insertion on pure
 * impact arcs) are omitted rather than guessed.
 */

import type { CameraMode } from "../camera/modes";
import { PRELAUNCH_COUNTDOWN_S } from "./prelaunch";
import type { MissionEvent, MissionTimeline, PhaseSegment } from "./timeline";

/** One-shot jump: mission time + guided focus framing. */
export type CinematicBookmark = Readonly<{
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
}>;

/**
 * Transport start: T−5:00 pad hold. Key **0**.
 * Not part of {@link BOOKMARK_IDS} — digits **1…9** stay the mission beats.
 */
export function openingBookmark(): CinematicBookmark {
  return {
    id: "opening",
    label: "T−5:00",
    shortLabel: "T−5",
    t: -PRELAUNCH_COUNTDOWN_S,
    u: 0,
    mode: "starbase",
    frame: true,
  };
}

/**
 * Catalog of beats. Digit keys follow mission time, not this order:
 * {@link buildBookmarks} keeps at most nine so keys **0–9** stay filled.
 */
export const BOOKMARK_IDS = [
  "pad",
  "maxQ",
  "staging",
  "boostback",
  "lowEarthOrbit",
  "landingBurn",
  "boosterCatch",
  "seco",
  "translunarInjection",
  "payload",
  "coastStart",
  "halfway",
  "entry",
  "lunarOrbitInsertion",
  "touchdown",
] as const;

/** Mission beats that fit on digit keys 1–9 (key 0 is the opening). */
const DIGIT_BEATS = 9;

/** A coast this long gets its own start bookmark; shorter coasts keep halfway only. */
const LONG_COAST_S = 3600;

export type BookmarkId = (typeof BOOKMARK_IDS)[number];

type BookmarkSpec = {
  id: BookmarkId;
  label: string;
  shortLabel: string;
  mode: CameraMode;
  frame: boolean;
  frameScale?: number;
  /** Higher survives when more than {@link DIGIT_BEATS} beats resolve. */
  priority: number;
  /** Resolve mission time from timeline; null → omit bookmark. */
  resolveT: (tl: MissionTimeline) => number | null;
};

function beat(
  id: BookmarkId,
  label: string,
  shortLabel: string,
  mode: CameraMode,
  priority: number,
  resolveT: (tl: MissionTimeline) => number | null,
  frameScale?: number,
): BookmarkSpec {
  return { id, label, shortLabel, mode, frame: true, frameScale, priority, resolveT };
}

const SPECS: BookmarkSpec[] = [
  beat("pad", "Pad", "Pad", "starbase", 90, (tl) => eventT(tl, "liftoff") ?? segmentT0(tl, "launch") ?? 0),
  beat("maxQ", "Max Q", "Max Q", "chase", 55, (tl) => eventT(tl, "max-q")),
  beat("staging", "Staging", "Stage", "chase", 80, (tl) => eventT(tl, "staging")),
  beat("boostback", "Boostback", "Back", "booster", 12, (tl) => eventT(tl, "boostback")),
  beat("lowEarthOrbit", "Earth orbit", "Orbit", "earth", 32, (tl) =>
    eventT(tl, "lowEarthOrbit") ?? segmentT0(tl, "lowEarthOrbit")),
  beat("landingBurn", "Booster land", "Boost", "booster", 28, (tl) => eventT(tl, "landing-burn")),
  beat("boosterCatch", "Booster catch", "Catch", "booster", 16, (tl) => eventT(tl, "booster-catch")),
  beat("seco", "SECO", "SECO", "chase", 36, (tl) => eventT(tl, "seco")),
  beat("translunarInjection", "Translunar injection", "Inject", "chase", 50, (tl) =>
    eventT(tl, "translunarInjection") ?? segmentT0(tl, "translunarInjection")),
  beat("payload", "Payload", "Deploy", "chase", 40, (tl) => eventT(tl, "payload-start")),
  beat("coastStart", "Coast", "Coast", "earth", 24, (tl) => longCoastStartT(tl), 8),
  beat("halfway", "Halfway", "Half", "earth", 70, (tl) => halfwayCoastT(tl), 22),
  beat("entry", "Entry", "Entry", "chase", 60, (tl) => eventT(tl, "entry") ?? segmentT0(tl, "entry")),
  beat("lunarOrbitInsertion", "Lunar orbit insertion", "Capture", "moon", 48, (tl) =>
    eventT(tl, "lunarOrbitInsertion") ?? segmentT0(tl, "approach")),
  beat("touchdown", "Touchdown", "Land", "chase", 100, (tl) => resolveTouchdown(tl)?.t ?? null),
];

function bookmarkFromSpec(
  spec: BookmarkSpec,
  t: number,
  dur: number,
  mode: CameraMode,
  label: string,
  shortLabel: string,
): CinematicBookmark {
  return {
    id: spec.id, label, shortLabel, t, u: clamp(t / dur, 0, 1),
    mode, frame: spec.frame, frameScale: spec.frameScale,
  };
}

function resolveTouchdownBookmark(
  timeline: MissionTimeline,
  spec: BookmarkSpec,
  dur: number,
): CinematicBookmark | null {
  const term = resolveTouchdown(timeline);
  if (!term) return null;
  return bookmarkFromSpec(spec, clamp(term.t, 0, dur), dur, term.mode, term.label, term.shortLabel);
}

function resolveTimedBookmark(
  timeline: MissionTimeline,
  spec: BookmarkSpec,
  dur: number,
): CinematicBookmark | null {
  const tRaw = spec.resolveT(timeline);
  if (tRaw == null || !Number.isFinite(tRaw)) return null;
  return bookmarkFromSpec(spec, clamp(tRaw, 0, dur), dur, spec.mode, spec.label, spec.shortLabel);
}

/** Resolve one bookmark spec; null when the beat is absent. */
function resolveBookmark(
  timeline: MissionTimeline,
  spec: BookmarkSpec,
  dur: number,
): CinematicBookmark | null {
  if (spec.id === "touchdown") return resolveTouchdownBookmark(timeline, spec, dur);
  return resolveTimedBookmark(timeline, spec, dur);
}

/**
 * Build available cinematic bookmarks from a mission timeline.
 * The T−5:00 opening is first. Other beats are time-sorted and capped at nine
 * so digit keys **0–9** cover the flight. Absent beats are skipped.
 */
export function buildBookmarks(timeline: MissionTimeline): CinematicBookmark[] {
  const dur = Math.max(timeline.durationS, 1);
  const beats: CinematicBookmark[] = [];
  for (const spec of SPECS) {
    const bm = resolveBookmark(timeline, spec, dur);
    if (bm) beats.push(bm);
  }
  return [openingBookmark(), ...capDigitBeats(beats)];
}

function byTime(a: CinematicBookmark, b: CinematicBookmark): number {
  return a.t - b.t || a.id.localeCompare(b.id);
}

/** Keep the highest-priority beats when a flight has more than nine. */
function capDigitBeats(beats: CinematicBookmark[]): CinematicBookmark[] {
  const sorted = beats.slice().sort(byTime);
  if (sorted.length <= DIGIT_BEATS) return sorted;
  const keep = new Set(
    sorted
      .slice()
      .sort((a, b) => beatPriority(b.id) - beatPriority(a.id) || a.t - b.t)
      .slice(0, DIGIT_BEATS)
      .map((b) => b.id),
  );
  return sorted.filter((b) => keep.has(b.id));
}

function beatPriority(id: string): number {
  return SPECS.find((spec) => spec.id === id)?.priority ?? 0;
}

/**
 * Map a digit key to a bookmark.
 * **0** is the T−5:00 opening. **1…9** are the mission beats, skipping that opening.
 * Returns null when the key index is out of range.
 */
export function bookmarkForDigit(
  bookmarks: readonly CinematicBookmark[],
  digit: number,
): CinematicBookmark | null {
  if (digit === 0) return bookmarks.find((b) => b.id === "opening") ?? null;
  if (!Number.isInteger(digit) || digit < 1) return null;
  const beats = bookmarks.filter((b) => b.id !== "opening");
  return beats[digit - 1] ?? null;
}

/**
 * KeyMap caption for a digit key.
 * **0** stays T−5. Other digits use the bookmark's stage label.
 * Missing beats return undefined so the key is not labeled "Bookmark".
 */
export function keymapDigitAction(
  bookmarks: readonly CinematicBookmark[],
  digit: number,
): string | undefined {
  const bm = bookmarkForDigit(bookmarks, digit);
  if (!bm) return undefined;
  if (bm.id === "opening") return "T−5";
  return bm.label;
}

/**
 * Next or previous bookmark in the built list.
 * Unknown current (`< 0`) wraps from the start (`dir > 0`) or end (`dir < 0`).
 */
export function cycleBookmark(
  bookmarks: readonly CinematicBookmark[],
  currentIndex: number,
  dir: -1 | 1,
): { bookmark: CinematicBookmark; index: number } | null {
  const n = bookmarks.length;
  if (n === 0) return null;
  const from = currentIndex < 0 || currentIndex >= n ? (dir > 0 ? -1 : 0) : currentIndex;
  const index = (from + dir + n) % n;
  return { bookmark: bookmarks[index]!, index };
}

function eventT(tl: MissionTimeline, id: string): number | null {
  const ev = findEvent(tl.events, id);
  return ev ? ev.t : null;
}

function findEvent(events: readonly MissionEvent[], id: string): MissionEvent | null {
  return events.find((e) => e.id === id) ?? null;
}

function segmentT0(tl: MissionTimeline, phase: string): number | null {
  const seg = findSegment(tl.segments, phase);
  return seg ? seg.t0 : null;
}

function findSegment(
  segments: readonly PhaseSegment[],
  phase: string,
): PhaseSegment | null {
  return segments.find((s) => s.phase === phase) ?? null;
}

/** Start of a long coast. Short suborbital coasts keep the halfway bookmark only. */
function longCoastStartT(tl: MissionTimeline): number | null {
  const coast = findSegment(tl.segments, "coast");
  if (!coast || coast.t1 - coast.t0 < LONG_COAST_S) return null;
  return coast.t0;
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

type TouchdownTerm = {
  t: number;
  mode: CameraMode;
  label: string;
  shortLabel: string;
};

function landTouchdown(tl: MissionTimeline): TouchdownTerm | null {
  const landT = eventT(tl, "touchdown") ?? segmentT0(tl, "landed");
  if (landT == null) return null;
  return { t: landT, mode: "chase", label: "Touchdown", shortLabel: "Land" };
}

function impactTouchdown(tl: MissionTimeline): TouchdownTerm | null {
  const impactT = eventT(tl, "impact") ?? segmentT0(tl, "impact");
  if (impactT == null) return null;
  return { t: impactT, mode: "moon", label: "Impact", shortLabel: "Impact" };
}

function splashTouchdown(tl: MissionTimeline): TouchdownTerm | null {
  const splashT = eventT(tl, "splashdown") ?? segmentT0(tl, "splashdown");
  if (splashT == null) return null;
  return {
    t: splashT,
    mode: "chase",
    label: "Splashdown",
    shortLabel: "Splash",
  };
}

function resolveTouchdown(tl: MissionTimeline): TouchdownTerm | null {
  return landTouchdown(tl) ?? splashTouchdown(tl) ?? impactTouchdown(tl);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

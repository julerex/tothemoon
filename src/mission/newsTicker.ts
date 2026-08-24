/**
 * News ticker beats (facade + builders).
 */
export type { NewsBeat } from "./newsTickerCopy";
export { expandEventCopy, isFlightTestTimeline, phaseAmbientFor } from "./newsTickerCopy";
import type { NewsBeat } from "./newsTickerCopy";
import { expandEventCopy, isFlightTestTimeline, phaseAmbientFor } from "./newsTickerCopy";
import type { MissionTimeline, PhaseSegment } from "./timeline";
import type { PhaseId } from "../physics/mission";

type BeatPush = (t: number, id: string, wire: string, line: string) => void;

export function buildNewsBeats(timeline: MissionTimeline): NewsBeat[] {
  const flightTest = isFlightTestTimeline(timeline);
  const beats = collectNewsBeats(timeline, flightTest);
  beats.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return beats;
}

function collectNewsBeats(
  timeline: MissionTimeline,
  flightTest: boolean,
): NewsBeat[] {
  const beats: NewsBeat[] = [];
  const push = makeBeatPush(beats, new Set<string>());
  pushOpeningBeat(push, timeline, flightTest);
  pushEventBeats(push, timeline, flightTest);
  pushPhaseAmbientBeats(push, timeline, flightTest);
  injectMidPhaseBeats(beats, timeline, flightTest);
  return beats;
}

function makeBeatPush(beats: NewsBeat[], seen: Set<string>): BeatPush {
  return (t, id, wire, line) => {
    if (seen.has(id)) return;
    seen.add(id);
    beats.push({ t: Math.max(0, t), id, wire, line });
  };
}

function pushOpeningBeat(
  push: BeatPush,
  timeline: MissionTimeline,
  flightTest: boolean,
): void {
  if (timeline.events.some((e) => e.id === "liftoff" || e.t < 1)) return;
  push(
    0,
    "open",
    "STANDBY",
    flightTest
      ? "SpaceWire desk is live for Starship Flight 13 — awaiting liftoff from Starbase."
      : "SpaceWire desk is live for the Starbase-to-Moon theater — awaiting liftoff.",
  );
}

function pushEventBeats(
  push: BeatPush,
  timeline: MissionTimeline,
  flightTest: boolean,
): void {
  for (const ev of timeline.events) {
    const { wire, line } = expandEventCopy(ev, flightTest);
    push(ev.t, ev.id, wire, line);
  }
}

function pushPhaseAmbientBeats(
  push: BeatPush,
  timeline: MissionTimeline,
  flightTest: boolean,
): void {
  for (const seg of timeline.segments) {
    if (segmentCoveredByEvent(timeline, seg)) continue;
    const amb = phaseAmbientFor(seg.phase, flightTest);
    if (!amb) continue;
    const { wire, line } = amb;
    push(seg.t0, `phase-${seg.phase}-${seg.t0.toFixed(0)}`, wire, line);
  }
}

function segmentCoveredByEvent(
  timeline: MissionTimeline,
  seg: PhaseSegment,
): boolean {
  return timeline.events.some((e) => Math.abs(e.t - seg.t0) < 8);
}

type MidItem = { wire: string; line: string; everyS: number };

function midPhaseCopy(flightTest: boolean): Partial<Record<PhaseId, MidItem[]>> {
  return {
    coast: flightTest ? FLIGHT_COAST_MID : LUNAR_COAST_MID,
    entry: ENTRY_MID,
    lowEarthOrbit: LEO_MID,
  };
}

const FLIGHT_COAST_MID: MidItem[] = [
  {
    everyS: 480,
    wire: "COAST",
    line: "Still on the suborbital arc — tracking ground path over the Atlantic and Africa.",
  },
  {
    everyS: 900,
    wire: "TRACK",
    line: "Coast continues — Pez deploy window or the in-space Raptor relight still ahead.",
  },
];

const LUNAR_COAST_MID: MidItem[] = [
  {
    everyS: 3600 * 6,
    wire: "COAST",
    line: "Translunar coast continues — Earth recedes, lunar sphere of influence still ahead.",
  },
];

const ENTRY_MID: MidItem[] = [
  {
    everyS: 180,
    wire: "ENTRY",
    line: "Entry in progress — high angle of attack, plasma sheath around the windward tiles.",
  },
];

const LEO_MID: MidItem[] = [
  {
    everyS: 1200,
    wire: "ORBIT",
    line: "Parking orbit — waiting for the translunar injection window.",
  },
];

function injectMidPhaseBeats(
  beats: NewsBeat[],
  timeline: MissionTimeline,
  flightTest: boolean,
): void {
  const midCopy = midPhaseCopy(flightTest);
  for (const seg of timeline.segments) {
    const list = midCopy[seg.phase];
    if (!list) continue;
    injectMidForSegment(beats, timeline, seg, list);
  }
}

function injectMidForSegment(
  beats: NewsBeat[],
  timeline: MissionTimeline,
  seg: PhaseSegment,
  list: MidItem[],
): void {
  const span = seg.t1 - seg.t0;
  for (const item of list) {
    if (span < item.everyS * 1.2) continue;
    pushMidOccurrences(beats, timeline, seg, item);
  }
}

function pushMidOccurrences(
  beats: NewsBeat[],
  timeline: MissionTimeline,
  seg: PhaseSegment,
  item: MidItem,
): void {
  let t = seg.t0 + item.everyS;
  let n = 0;
  while (t < seg.t1 - 30 && n < 6) {
    maybePushMidBeat(beats, timeline, seg, item, t);
    t += item.everyS;
    n += 1;
  }
}

function maybePushMidBeat(
  beats: NewsBeat[],
  timeline: MissionTimeline,
  seg: PhaseSegment,
  item: MidItem,
  t: number,
): void {
  if (nearTimelineEvent(timeline, t)) return;
  beats.push({
    t,
    id: `mid-${seg.phase}-${Math.round(t)}`,
    wire: item.wire,
    line: item.line,
  });
}

function nearTimelineEvent(timeline: MissionTimeline, t: number): boolean {
  return timeline.events.some((e) => Math.abs(e.t - t) < 20);
}

/**
 * Active news beat at mission time `t` (last beat with beat.t ≤ t).
 * Returns null only if the beat list is empty.
 */
/** Pad hold copy during the T−5:00 pre-liftoff window. */
export const PRELAUNCH_NEWS_BEAT: NewsBeat = {
  t: -300,
  id: "prelaunch",
  wire: "PAD",
  line: "T−5:00 and counting — Starship is vertical at Starbase, awaiting liftoff.",
};

export function newsAtMissionTime(
  beats: readonly NewsBeat[],
  t: number,
): NewsBeat | null {
  if (t < 0) return PRELAUNCH_NEWS_BEAT;
  if (beats.length === 0) return null;
  if (t < beats[0]!.t) return beats[0]!;
  return lastBeatAtOrBefore(beats, t);
}

function lastBeatAtOrBefore(
  beats: readonly NewsBeat[],
  t: number,
): NewsBeat {
  let best = beats[0]!;
  for (const b of beats) {
    if (b.t <= t + 1e-9) best = b;
    else break;
  }
  return best;
}

/** Marquee string for a beat (headline only — no wire / BREAKING tags). */
export function formatTickerText(beat: NewsBeat): string {
  return beat.line;
}

/**
 * Build a multi-item crawl string: current headline plus a short trail of
 * prior beats. Used when the ticker wants more motion.
 */
export function formatTickerCrawl(
  beats: readonly NewsBeat[],
  t: number,
  trail = 2,
): string {
  if (beats.length === 0) return "";
  const active = newsAtMissionTime(beats, t);
  if (!active) return "";
  return crawlSlice(beats, active, trail)
    .map((b) => formatTickerText(b))
    .join("     ·     ");
}

function crawlSlice(
  beats: readonly NewsBeat[],
  active: NewsBeat,
  trail: number,
): NewsBeat[] {
  const idx = beats.findIndex((b) => b.id === active.id && b.t === active.t);
  const start = Math.max(0, idx - trail);
  return beats.slice(start, idx + 1);
}

/**
 * CSS animation period (s) for one full marquee loop at the given playback
 * rate. 1× → {@link NEWS_TICKER_BASE_PERIOD_S}; faster rates shorten the period
 * proportionally; reverse uses the same period (direction is separate).
 */
export const NEWS_TICKER_BASE_PERIOD_S = 28;

export function newsTickerPeriodS(playbackRate: number): number {
  const mag = Math.abs(playbackRate);
  if (!Number.isFinite(mag) || mag < 1e-6) return NEWS_TICKER_BASE_PERIOD_S;
  const period = NEWS_TICKER_BASE_PERIOD_S / mag;
  return Math.min(120, Math.max(0.05, period));
}

/** Re-export segment type touch for consumers that only import this module. */
export type { PhaseSegment };

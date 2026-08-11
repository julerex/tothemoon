/**
 * Mission-time news ticker beats.
 *
 * Pure helpers: given a {@link MissionTimeline}, build a continuous sequence of
 * wire-style headlines and resolve the active line at any mission time `t`.
 * Scrub-deterministic — no wall-clock state.
 */

import type { MissionEvent, MissionTimeline, PhaseSegment } from "./timeline";
import type { PhaseId } from "../physics/missionTypes";

/** One ticker headline anchored at mission time `t` (s). */
export type NewsBeat = {
  /** Mission time when this line becomes active (s). */
  t: number;
  /** Stable id (event id or synthetic phase id). */
  id: string;
  /** Wire / desk tag shown in the LIVE pill trail. */
  wire: string;
  /** Full scrolling sentence. */
  line: string;
};

/** Whether the timeline is a suborbital flight-test (vs lunar transfer). */
export function isFlightTestTimeline(timeline: MissionTimeline): boolean {
  return timeline.segments.some(
    (s) => s.phase === "entry" || s.phase === "splashdown",
  );
}

/**
 * Expand a timeline event into a news-desk sentence.
 * Falls back to title + detail when no bespoke copy exists.
 */
export function expandEventCopy(
  ev: MissionEvent,
  flightTest: boolean,
): { wire: string; line: string } {
  const known = resolveKnownCopy(ev.id, flightTest);
  if (known) return known;
  const flight = flightTestSpecialCopy(ev.id, flightTest);
  if (flight) return flight;
  return fallbackEventCopy(ev);
}

function resolveKnownCopy(
  id: string,
  flightTest: boolean,
): { wire: string; line: string } | null {
  const known = COPY_BY_ID[id];
  if (!known) return null;
  const line =
    typeof known.line === "function" ? known.line(flightTest) : known.line;
  return { wire: known.wire, line };
}

function flightTestSpecialCopy(
  id: string,
  flightTest: boolean,
): { wire: string; line: string } | null {
  if (!flightTest) return null;
  return FLIGHT_TEST_COPY[id] ?? null;
}

const FLIGHT_TEST_COPY: Record<string, { wire: string; line: string }> = {
  coast: {
    wire: "FLIGHT",
    line:
      "SECO confirmed — Starship is on a suborbital coast toward the Indian Ocean corridor.",
  },
  poweredDescentInitiation: {
    wire: "LANDING",
    line:
      "Landing burn is lighting — Ship flips engines-first for the Indian Ocean splashdown.",
  },
};

function fallbackEventCopy(ev: MissionEvent): { wire: string; line: string } {
  const detail = ev.detail?.trim();
  const line = detail ? `${ev.title} — ${detail}.` : `${ev.title}.`;
  return { wire: "UPDATE", line };
}

type CopySpec = {
  wire: string;
  line: string | ((flightTest: boolean) => string);
};

/** Bespoke wire copy keyed by timeline event id. */
const COPY_BY_ID: Record<string, CopySpec> = {
  liftoff: {
    wire: "LAUNCH",
    line: (ft) =>
      ft
        ? "Starship Flight 13 lifts off from Starbase as Super Heavy lights the Raptor field."
        : "Stack clears the tower at Starbase — Super Heavy and Starship are climbing for the Moon.",
  },
  "max-q": {
    wire: "ASCENT",
    line: "Max Q — peak aerodynamic stress on the vehicle; throttle recovers as the air thins.",
  },
  staging: {
    wire: "STAGING",
    line: (ft) =>
      ft
        ? "Hot-staging: Ship Raptors light while Super Heavy throttles down and separates."
        : "Staging complete — Super Heavy falls away; Ship continues the burn toward low Earth orbit.",
  },
  boostback: {
    wire: "BOOSTER",
    line: (ft) =>
      ft
        ? "Super Heavy flips and lights boostback — targeting an offshore soft landing in the Gulf of America."
        : "Super Heavy boostback burn — the booster is returning toward the tower.",
  },
  "booster-catch": {
    wire: "BOOSTER",
    line: (ft) =>
      ft
        ? "Super Heavy landing burn — soft touchdown in the Gulf recovery zone."
        : "Chopsticks catch window — Super Heavy is in the final landing burn at Starbase.",
  },
  seco: {
    wire: "SECO",
    line: "SECO — Ship main engine cutoff. Suborbital coast begins on the Flight 13 corridor.",
  },
  relight: {
    wire: "DEMO",
    line: "Raptor in-space relight demo — single-engine retrograde burn to set up entry.",
  },
  entry: {
    wire: "ENTRY",
    line: "Entry interface — Starship is belly-first into the atmosphere for a controlled descent.",
  },
  "land-flip": {
    wire: "LANDING",
    line: "Landing flip — Ship rotates engines-first for the terminal burn.",
  },
  "land-3to2": {
    wire: "LANDING",
    line: "Landing burn: three Raptors step down to two as altitude bleeds off.",
  },
  "land-2to1": {
    wire: "LANDING",
    line: "Single-engine landing — final Raptor holds for splashdown.",
  },
  splashdown: {
    wire: "SPLASH",
    line: "Splashdown — Starship is soft in the Indian Ocean. Flight test complete.",
  },
  lowEarthOrbit: {
    wire: "ORBIT",
    line: "Low Earth orbit insertion — parking orbit, due-east from Starbase.",
  },
  dogleg: {
    wire: "GUIDANCE",
    line: "Dogleg burn — Ship is changing plane into the lunar transfer plane (paid Δv).",
  },
  translunarInjection: {
    wire: "TLI",
    line: "Translunar injection — finite prograde burn is sending Starship toward the Moon.",
  },
  coast: {
    wire: "COAST",
    line: "TLI complete — ballistic coast under Sun–Earth–Moon gravity; discrete course corrections only.",
  },
  lunarOrbitInsertion: {
    wire: "LOI",
    line: "Lunar orbit insertion — capture burn into low lunar orbit over the south polar region.",
  },
  lowLunarOrbit: {
    wire: "LLO",
    line: "Low lunar orbit coast — parking for powered descent initiation.",
  },
  poweredDescentInitiation: {
    wire: "DESCENT",
    line: "Powered descent initiation — braking toward the lunar south pole site.",
  },
  touchdown: {
    wire: "LAND",
    line: "Touchdown — Starship is down at the theater south-pole site.",
  },
  impact: {
    wire: "IMPACT",
    line: "Lunar impact — ballistic arrival; no capture burns after translunar injection.",
  },
  ascent: {
    wire: "ASCENT",
    line: "Powered ascent continues — gravity turn building downrange speed.",
  },
};

/** Ambient filler when a long phase has no discrete event yet. */
const PHASE_AMBIENT: Partial<
  Record<PhaseId, (ft: boolean) => { wire: string; line: string }>
> = {
  launch: () => ({
    wire: "PAD",
    line: "Hold down — Raptors at full power, clearing the tower at Starbase.",
  }),
  ascent: (ft) => ({
    wire: "ASCENT",
    line: ft
      ? "Ascent through the Gulf corridor — Super Heavy and Ship still stacked."
      : "Climbing to low Earth orbit — engines throttled for Max Q and staging.",
  }),
  lowEarthOrbit: () => ({
    wire: "ORBIT",
    line: "Coast in low Earth orbit — phasing for translunar injection.",
  }),
  translunarInjection: () => ({
    wire: "TLI",
    line: "Translunar injection burn in progress — Ship is raising apogee toward the Moon.",
  }),
  coast: (ft) => ({
    wire: "COAST",
    line: ft
      ? "Suborbital coast — heat shield forward, tracking toward the Indian Ocean."
      : "Deep-space coast — n-body free flight with planned midcourse corrections.",
  }),
  approach: () => ({
    wire: "LOI",
    line: "Approaching the Moon — lunar orbit insertion burn sequence ahead.",
  }),
  braking: () => ({
    wire: "LLO",
    line: "Low lunar orbit — one more rev before powered descent.",
  }),
  descent: (ft) => ({
    wire: "LANDING",
    line: ft
      ? "Terminal descent — landing burn and splashdown sequence."
      : "Powered descent — throttle and attitude for a soft south-pole landing.",
  }),
  entry: () => ({
    wire: "ENTRY",
    line: "Plasma corridor — belly-flop entry, energy bleeding in the upper atmosphere.",
  }),
  splashdown: () => ({
    wire: "SPLASH",
    line: "Ship is down in the Indian Ocean — recovery assets on station.",
  }),
  landed: () => ({
    wire: "LAND",
    line: "Landed — mission theater complete at the lunar south pole.",
  }),
  impact: () => ({
    wire: "IMPACT",
    line: "Surface impact — end of ballistic free-coast trajectory.",
  }),
};

type BeatPush = (t: number, id: string, wire: string, line: string) => void;

/**
 * Build ordered news beats covering the full mission.
 * Discrete timeline events take priority; phase ambient fills gaps at segment starts.
 */
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
    const amb = PHASE_AMBIENT[seg.phase];
    if (!amb) continue;
    const { wire, line } = amb(flightTest);
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
    line: "Ship remains in free coast; next major beat is the in-space Raptor relight demo.",
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
/** Pad hold copy during the T−2:00 pre-liftoff window. */
export const PRELAUNCH_NEWS_BEAT: NewsBeat = {
  t: -120,
  id: "prelaunch",
  wire: "PAD",
  line: "T−2:00 and counting — Starship is vertical at Starbase, awaiting liftoff.",
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

/** @internal test helper — phase ambient table coverage. */
export function phaseAmbientFor(
  phase: PhaseId,
  flightTest: boolean,
): { wire: string; line: string } | null {
  const fn = PHASE_AMBIENT[phase];
  return fn ? fn(flightTest) : null;
}

/** Re-export segment type touch for consumers that only import this module. */
export type { PhaseSegment };

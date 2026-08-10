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
  const detail = ev.detail?.trim();
  const known = COPY_BY_ID[ev.id];
  if (known) {
    const line = typeof known.line === "function" ? known.line(flightTest) : known.line;
    return { wire: known.wire, line };
  }
  // Phase coast is labeled “Translunar injection complete” on lunar packs;
  // flight-test coast is a suborbital free-flight.
  if (ev.id === "coast" && flightTest) {
    return {
      wire: "FLIGHT",
      line:
        "SECO confirmed — Starship is on a suborbital coast toward the Indian Ocean corridor.",
    };
  }
  if (ev.id === "poweredDescentInitiation" && flightTest) {
    return {
      wire: "LANDING",
      line:
        "Landing burn is lighting — Ship flips engines-first for the Indian Ocean splashdown.",
    };
  }
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
    wire: "BREAKING",
    line: (ft) =>
      ft
        ? "BREAKING: Starship Flight 13 lifts off from Starbase as Super Heavy lights the Raptor field."
        : "BREAKING: Stack clears the tower at Starbase — Super Heavy and Starship are climbing for the Moon.",
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

/**
 * Build ordered news beats covering the full mission.
 * Discrete timeline events take priority; phase ambient fills gaps at segment starts.
 */
export function buildNewsBeats(timeline: MissionTimeline): NewsBeat[] {
  const flightTest = isFlightTestTimeline(timeline);
  const beats: NewsBeat[] = [];
  const seen = new Set<string>();

  const push = (t: number, id: string, wire: string, line: string): void => {
    if (seen.has(id)) return;
    // Avoid near-duplicate times for same wire line
    seen.add(id);
    beats.push({ t: Math.max(0, t), id, wire, line });
  };

  // Opening line at t=0 if no liftoff event
  if (!timeline.events.some((e) => e.id === "liftoff" || e.t < 1)) {
    push(
      0,
      "open",
      "STANDBY",
      flightTest
        ? "SpaceWire desk is live for Starship Flight 13 — awaiting liftoff from Starbase."
        : "SpaceWire desk is live for the Starbase-to-Moon theater — awaiting liftoff.",
    );
  }

  for (const ev of timeline.events) {
    const { wire, line } = expandEventCopy(ev, flightTest);
    push(ev.t, ev.id, wire, line);
  }

  // Phase ambient at segment starts when no event within ±8 s
  for (const seg of timeline.segments) {
    const covered = timeline.events.some((e) => Math.abs(e.t - seg.t0) < 8);
    if (covered) continue;
    const amb = PHASE_AMBIENT[seg.phase];
    if (!amb) continue;
    const { wire, line } = amb(flightTest);
    push(seg.t0, `phase-${seg.phase}-${seg.t0.toFixed(0)}`, wire, line);
  }

  // Mid-phase ambient for long coasts / entries (every ~8 min of mission time)
  injectMidPhaseBeats(beats, timeline, flightTest);

  beats.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return beats;
}

function injectMidPhaseBeats(
  beats: NewsBeat[],
  timeline: MissionTimeline,
  flightTest: boolean,
): void {
  const midCopy: Partial<
    Record<PhaseId, { wire: string; line: string; everyS: number }[]>
  > = {
    coast: flightTest
      ? [
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
        ]
      : [
          {
            everyS: 3600 * 6,
            wire: "COAST",
            line: "Translunar coast continues — Earth recedes, lunar sphere of influence still ahead.",
          },
        ],
    entry: [
      {
        everyS: 180,
        wire: "ENTRY",
        line: "Entry in progress — high angle of attack, plasma sheath around the windward tiles.",
      },
    ],
    lowEarthOrbit: [
      {
        everyS: 1200,
        wire: "ORBIT",
        line: "Parking orbit — waiting for the translunar injection window.",
      },
    ],
  };

  for (const seg of timeline.segments) {
    const list = midCopy[seg.phase];
    if (!list) continue;
    const span = seg.t1 - seg.t0;
    for (const item of list) {
      if (span < item.everyS * 1.2) continue;
      let t = seg.t0 + item.everyS;
      let n = 0;
      while (t < seg.t1 - 30 && n < 6) {
        const nearEvent = timeline.events.some((e) => Math.abs(e.t - t) < 20);
        if (!nearEvent) {
          beats.push({
            t,
            id: `mid-${seg.phase}-${Math.round(t)}`,
            wire: item.wire,
            line: item.line,
          });
        }
        t += item.everyS;
        n += 1;
      }
    }
  }
}

/**
 * Active news beat at mission time `t` (last beat with beat.t ≤ t).
 * Returns null only if the beat list is empty.
 */
export function newsAtMissionTime(
  beats: readonly NewsBeat[],
  t: number,
): NewsBeat | null {
  if (beats.length === 0) return null;
  if (t < beats[0]!.t) return beats[0]!;
  // Linear scan is fine for <200 beats; keep simple + testable
  let best = beats[0]!;
  for (const b of beats) {
    if (b.t <= t + 1e-9) best = b;
    else break;
  }
  return best;
}

/** Full marquee string for a beat (wire prefix + line). */
export function formatTickerText(beat: NewsBeat): string {
  return `${beat.wire}  ·  ${beat.line}`;
}

/**
 * Build a multi-item crawl string: current headline plus a short trail of
 * prior beats (news-desk style). Used when the ticker wants more motion.
 */
export function formatTickerCrawl(
  beats: readonly NewsBeat[],
  t: number,
  trail = 2,
): string {
  if (beats.length === 0) return "";
  const active = newsAtMissionTime(beats, t);
  if (!active) return "";
  const idx = beats.findIndex((b) => b.id === active.id && b.t === active.t);
  const start = Math.max(0, idx - trail);
  const slice = beats.slice(start, idx + 1);
  return slice.map((b) => formatTickerText(b)).join("     ★     ");
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

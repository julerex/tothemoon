/**
 * Mission-time news ticker beats.
 *
 * Pure helpers: given a {@link MissionTimeline}, build a continuous sequence of
 * wire-style headlines and resolve the active line at any mission time `t`.
 * Scrub-deterministic — no wall-clock state.
 */

import type { MissionEvent, MissionTimeline } from "./timeline";
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
        ? "Super Heavy flips and lights boostback — targeting an offshore splashdown in the Gulf of America."
        : "Super Heavy boostback burn — the booster is returning toward the tower.",
  },
  "landing-burn": {
    wire: "BOOSTER",
    line: (ft) =>
      ft
        ? "Landing burn — a subset of Super Heavy engines relight from ~5 km above the Gulf."
        : "Landing burn — Super Heavy is hoverslamming toward the chopsticks at ~5 km AGL.",
  },
  "booster-catch": {
    wire: "BOOSTER",
    line: (ft) =>
      ft
        ? "Hard splashdown — Super Heavy is in the water in the Gulf of America."
        : "Chopsticks catch window — Super Heavy is in the final landing burn at Starbase.",
  },
  seco: {
    wire: "SECO",
    line: "SECO — Ship main engine cutoff. Suborbital coast begins on the Flight 13 corridor.",
  },
  "payload-start": {
    wire: "PAYLOAD",
    line: "Pez deploy — Starlink V3 satellites departing the bay on the suborbital path.",
  },
  "payload-complete": {
    wire: "PAYLOAD",
    line: "Payload complete — all 20 Starlink V3 sats deployed; bay door closing.",
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
    line:
      "Splashdown — Starship is in the water in the Indian Ocean. Recovery drone is inbound.",
  },
  "splash-drone": {
    wire: "DRONE",
    line:
      "Recovery drone is on station — circling the intact ship at sea level in the Indian Ocean.",
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
export const PHASE_AMBIENT: Partial<
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
    line:
      "Ship is floating on its side in the Indian Ocean — recovery drone holding a sea-level orbit.",
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

export type BeatPush = (t: number, id: string, wire: string, line: string) => void;

/** @internal test helper — phase ambient table coverage. */
export function phaseAmbientFor(
  phase: PhaseId,
  flightTest: boolean,
): { wire: string; line: string } | null {
  const fn = PHASE_AMBIENT[phase];
  return fn ? fn(flightTest) : null;
}

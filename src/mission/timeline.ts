/**
 * Build scrubber phase segments and narrative callout events from samples.
 *
 * Segments are contiguous [t0, t1] ranges per phase; events mark liftoff,
 * staging, dogleg, translunar injection, lunar orbit insertion, touchdown, impact, etc. for the HUD.
 */

import { phaseLabel, type PhaseId, type Sample } from "../physics/mission";

/** Scrubber / marker short labels (keep tight — scrubber is narrow). */
const PHASE_SHORT: Record<PhaseId, string> = {
  launch: "Lift",
  ascent: "Ascent",
  lowEarthOrbit: "Earth",
  translunarInjection: "Inject",
  coast: "Coast",
  approach: "Capture",
  braking: "Lunar",
  descent: "Descent",
  landed: "Land",
  impact: "Impact",
  entry: "Entry",
  splashdown: "Splash",
};

export type PhaseSegment = {
  phase: PhaseId;
  label: string;
  shortLabel: string;
  /** Mission time at segment start (s) */
  t0: number;
  /** Mission time at segment end (s) */
  t1: number;
  /** Normalized progress at start [0,1] */
  u0: number;
  /** Normalized progress at end [0,1] */
  u1: number;
};

export type MissionEvent = {
  id: string;
  t: number;
  u: number;
  title: string;
  detail?: string;
};

export type MissionTimeline = {
  durationS: number;
  segments: PhaseSegment[];
  events: MissionEvent[];
};

type EventAdder = (
  id: string,
  t: number,
  title: string,
  detail?: string,
) => void;

/** Build phase segments and narrative events from trajectory samples. */
export function buildTimeline(
  samples: Sample[],
  durationS: number,
): MissionTimeline {
  const dur = Math.max(durationS, 1);
  const segments = buildSegments(samples, dur);
  const events = buildEvents(samples, segments, dur);
  return { durationS: dur, segments, events };
}

function buildSegments(samples: Sample[], durationS: number): PhaseSegment[] {
  if (samples.length === 0) return [];
  const segments: PhaseSegment[] = [];
  walkPhaseEdges(samples, durationS, segments);
  return segments;
}

function walkPhaseEdges(
  samples: Sample[],
  durationS: number,
  segments: PhaseSegment[],
): void {
  let phase = samples[0]!.phase;
  let t0 = samples[0]!.t;
  ({ phase, t0 } = scanPhaseChanges(samples, durationS, segments, phase, t0));
  pushSegment(segments, phase, t0, durationS, durationS);
}

function scanPhaseChanges(
  samples: Sample[],
  durationS: number,
  segments: PhaseSegment[],
  phase: PhaseId,
  t0: number,
): { phase: PhaseId; t0: number } {
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!;
    if (s.phase === phase) continue;
    pushSegment(segments, phase, t0, s.t, durationS);
    phase = s.phase;
    t0 = s.t;
  }
  return { phase, t0 };
}

function pushSegment(
  out: PhaseSegment[],
  phase: PhaseId,
  t0: number,
  t1: number,
  durationS: number,
): void {
  const a = Math.max(0, t0);
  const b = Math.max(a, t1);
  out.push(makeSegment(phase, a, b, durationS));
}

function makeSegment(
  phase: PhaseId,
  t0: number,
  t1: number,
  durationS: number,
): PhaseSegment {
  return {
    phase,
    label: phaseLabel(phase),
    shortLabel: PHASE_SHORT[phase],
    t0,
    t1,
    u0: t0 / durationS,
    u1: t1 / durationS,
  };
}

function makeEventAdder(
  events: MissionEvent[],
  durationS: number,
): EventAdder {
  return (id, t, title, detail) => {
    events.push({ id, t, u: clamp01(t / durationS), title, detail });
  };
}

function buildEvents(
  samples: Sample[],
  segments: PhaseSegment[],
  durationS: number,
): MissionEvent[] {
  const events: MissionEvent[] = [];
  const add = makeEventAdder(events, durationS);
  addPhaseEntryEvents(add, segments);
  addStagingEvents(add, samples);
  addDoglegEvent(add, samples);
  addFlightTestBeats(add, samples, segments);
  events.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return dedupeEvents(events);
}

/** Phase-entry callouts keyed by segment phase. */
const PHASE_ENTRY: Partial<
  Record<PhaseId, { id: string; title: string; detail: string }>
> = {
  launch: { id: "liftoff", title: "Liftoff", detail: "Starbase · Boca Chica" },
  lowEarthOrbit: {
    id: "lowEarthOrbit",
    title: "Low Earth orbit insertion",
    detail: "Parking orbit · due-east",
  },
  translunarInjection: {
    id: "translunarInjection",
    title: "Translunar injection burn",
    detail: "Finite prograde inject · ~2–4 min",
  },
  coast: {
    id: "coast",
    title: "Translunar coast",
    detail: "Restricted n-body coast · capture pending",
  },
  approach: {
    id: "lunarOrbitInsertion",
    title: "Lunar orbit insertion burn",
    detail: "Capture into low lunar orbit",
  },
  braking: {
    id: "lowLunarOrbit",
    title: "Low lunar orbit coast",
    detail: "Parking orbit · ~¾ rev",
  },
  descent: {
    id: "poweredDescentInitiation",
    title: "Powered descent initiation",
    detail: "Powered descent · south pole",
  },
  landed: { id: "touchdown", title: "Touchdown", detail: "Lunar south pole" },
  impact: {
    id: "impact",
    title: "Lunar impact",
    detail: "Ballistic · no post-Translunar injection burns",
  },
  entry: { id: "entry", title: "Entry interface", detail: "Atmospheric entry" },
  splashdown: {
    id: "splashdown",
    title: "Splashdown",
    detail: "Soft landing · Indian Ocean",
  },
};

function addPhaseEntryEvents(
  add: EventAdder,
  segments: PhaseSegment[],
): void {
  for (const seg of segments) {
    if (seg.phase === "ascent") {
      addAscentIfNoLaunch(add, seg, segments);
      continue;
    }
    const spec = PHASE_ENTRY[seg.phase];
    if (spec) add(spec.id, seg.t0, spec.title, spec.detail);
  }
}

function addAscentIfNoLaunch(
  add: EventAdder,
  seg: PhaseSegment,
  segments: PhaseSegment[],
): void {
  if (segments.some((s) => s.phase === "launch")) return;
  add("ascent", seg.t0, "Ascent", "Powered climb to low Earth orbit");
}

function addStagingEvents(add: EventAdder, samples: Sample[]): void {
  const stageIdx = samples.findIndex((s) => s.staged);
  if (stageIdx <= 0) return;
  pushStagingTrio(add, samples[stageIdx]!.t);
}

function pushStagingTrio(add: EventAdder, t: number): void {
  add("staging", t, "Staging", "Booster separation");
  add("boostback", t + 4, "Boostback", "Super Heavy flip · boostback burn");
  add(
    "booster-catch",
    t + 272,
    "Booster landing",
    "Landing burn · recovery zone (chopsticks or Gulf)",
  );
}

function addDoglegEvent(add: EventAdder, samples: Sample[]): void {
  const dogleg = findDoglegSample(samples);
  if (!dogleg) return;
  add("dogleg", dogleg.t, "Dogleg", "Plane change into lunar plane · paid ship Δv");
}

function findDoglegSample(samples: Sample[]): Sample | undefined {
  return samples.find(
    (s) => s.phase === "lowEarthOrbit" && s.burning && s.thrustN > 1e3,
  );
}

function hasFlightTestPhases(samples: Sample[]): boolean {
  return samples.some((s) => s.phase === "entry" || s.phase === "splashdown");
}

function addFlightTestBeats(
  add: EventAdder,
  samples: Sample[],
  segments: PhaseSegment[],
): void {
  if (!hasFlightTestPhases(samples)) return;
  add("max-q", 58, "Max Q", "Peak aerodynamic stress");
  addSecoEvent(add, samples);
  addRelightEvent(add, samples);
  addLandingStepEvents(add, segments);
}

function addSecoEvent(add: EventAdder, samples: Sample[]): void {
  const seco = samples.find(
    (s, i) =>
      s.burning &&
      s.staged &&
      samples[i + 1] &&
      !samples[i + 1]!.burning &&
      (samples[i + 1]!.phase === "coast" || samples[i + 1]!.phase === "ascent"),
  );
  if (seco) add("seco", seco.t, "SECO", "Starship engine cutoff · suborbital coast");
}

function addRelightEvent(add: EventAdder, samples: Sample[]): void {
  const relight = samples.find(
    (s) => s.phase === "coast" && s.burning && s.thrustN > 1e3,
  );
  if (!relight) return;
  add("relight", relight.t, "Raptor relight", "In-space single-engine demo");
}

function addLandingStepEvents(
  add: EventAdder,
  segments: PhaseSegment[],
): void {
  const descent = segments.find((s) => s.phase === "descent");
  if (!descent) return;
  add("land-flip", descent.t0 + 2, "Landing flip", "Belly → engines-first");
  add("land-3to2", descent.t0 + 11, "3 → 2 engines", "Landing burn throttle-down");
  add("land-2to1", descent.t0 + 18, "2 → 1 engine", "Single-engine landing");
}

/** Drop events that share the same id, keep earliest. */
function dedupeEvents(events: MissionEvent[]): MissionEvent[] {
  const seen = new Set<string>();
  const out: MissionEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

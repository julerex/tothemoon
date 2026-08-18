/**
 * Build scrubber phase segments and narrative callout events from samples.
 *
 * Segments are contiguous [t0, t1] ranges per phase; events mark liftoff,
 * staging, dogleg, translunar injection, lunar orbit insertion, touchdown, impact, etc. for the HUD.
 */

import { phaseLabel, type PhaseId } from "../physics/mission";
import type { ReadonlySample } from "../physics/missionTypes";
import { buildEvents } from "./timelineEvents";

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

export type PhaseSegment = Readonly<{
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
}>;

export type MissionEvent = Readonly<{
  id: string;
  t: number;
  u: number;
  title: string;
  detail?: string;
}>;

export type MissionTimeline = Readonly<{
  durationS: number;
  segments: readonly PhaseSegment[];
  events: readonly MissionEvent[];
}>;

export type EventAdder = (
  id: string,
  t: number,
  title: string,
  detail?: string,
) => void;

/** Build phase segments and narrative events from trajectory samples. */
export function buildTimeline(
  samples: readonly ReadonlySample[],
  durationS: number,
): MissionTimeline {
  const dur = Math.max(durationS, 1);
  const segments = buildSegments(samples, dur);
  const events = buildEvents(samples, segments, dur);
  return { durationS: dur, segments, events };
}

function buildSegments(samples: readonly ReadonlySample[], durationS: number): PhaseSegment[] {
  if (samples.length === 0) return [];
  const segments: PhaseSegment[] = [];
  walkPhaseEdges(samples, durationS, segments);
  return segments;
}

function walkPhaseEdges(
  samples: readonly ReadonlySample[],
  durationS: number,
  segments: PhaseSegment[],
): void {
  let phase = samples[0]!.phase;
  let t0 = samples[0]!.t;
  ({ phase, t0 } = scanPhaseChanges(samples, durationS, segments, phase, t0));
  pushSegment(segments, phase, t0, durationS, durationS);
}

function scanPhaseChanges(
  samples: readonly ReadonlySample[],
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
export type PhaseContext = Readonly<{
  phase: PhaseId | null;
  label: string;
  /** Next segment label, or null on the last / empty timeline. */
  nextLabel: string | null;
  elapsedS: number;
  remainingS: number;
}>;

const EMPTY_PHASE_CONTEXT: PhaseContext = {
  phase: null,
  label: "—",
  nextLabel: null,
  elapsedS: 0,
  remainingS: 0,
};

/**
 * Current / next phase at mission time `t`.
 * `t` before the first segment is treated as “time until that phase starts”.
 */
export function phaseContextAt(
  segments: readonly PhaseSegment[],
  t: number,
): PhaseContext {
  if (segments.length === 0) return EMPTY_PHASE_CONTEXT;
  const first = segments[0]!;
  if (t < first.t0) {
    return {
      phase: first.phase,
      label: first.label,
      nextLabel: first.label,
      elapsedS: 0,
      remainingS: Math.max(0, first.t0 - t),
    };
  }
  const i = segmentIndexAt(segments, t);
  const seg = segments[i]!;
  const next = segments[i + 1];
  return {
    phase: seg.phase,
    label: seg.label,
    nextLabel: next?.label ?? null,
    elapsedS: Math.max(0, t - seg.t0),
    remainingS: Math.max(0, seg.t1 - t),
  };
}

function segmentIndexAt(segments: readonly PhaseSegment[], t: number): number {
  for (let i = 0; i < segments.length; i++) {
    if (t < segments[i]!.t1 || i === segments.length - 1) return i;
  }
  return segments.length - 1;
}

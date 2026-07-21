import { phaseLabel, type PhaseId, type Sample } from "../physics/mission";

/** Scrubber / marker short labels (keep tight — scrubber is narrow). */
const PHASE_SHORT: Record<PhaseId, string> = {
  launch: "Lift",
  ascent: "Ascent",
  leo: "LEO",
  tli: "TLI",
  coast: "Coast",
  approach: "Appr.",
  braking: "Brake",
  descent: "Desc.",
  landed: "Land",
};

/**
 * Suggested playback multipliers by phase so burns stay watchable and
 * multi-day coasts don't feel endless. Used when speed mode is Auto.
 */
export const PHASE_AUTO_SPEED: Record<PhaseId, number> = {
  launch: 25,
  ascent: 40,
  leo: 200,
  tli: 50,
  coast: 2000,
  approach: 400,
  braking: 50,
  descent: 25,
  landed: 1,
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

export function autoSpeedForPhase(phase: PhaseId): number {
  return PHASE_AUTO_SPEED[phase] ?? 100;
}

function buildSegments(samples: Sample[], durationS: number): PhaseSegment[] {
  if (samples.length === 0) return [];

  const segments: PhaseSegment[] = [];
  let phase = samples[0]!.phase;
  let t0 = samples[0]!.t;

  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!;
    if (s.phase === phase) continue;
    pushSegment(segments, phase, t0, s.t, durationS);
    phase = s.phase;
    t0 = s.t;
  }
  pushSegment(segments, phase, t0, durationS, durationS);
  return segments;
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
  out.push({
    phase,
    label: phaseLabel(phase),
    shortLabel: PHASE_SHORT[phase],
    t0: a,
    t1: b,
    u0: a / durationS,
    u1: b / durationS,
  });
}

function buildEvents(
  samples: Sample[],
  segments: PhaseSegment[],
  durationS: number,
): MissionEvent[] {
  const events: MissionEvent[] = [];
  const add = (
    id: string,
    t: number,
    title: string,
    detail?: string,
  ): void => {
    events.push({
      id,
      t,
      u: clamp01(t / durationS),
      title,
      detail,
    });
  };

  // Phase-entry events (skip duplicate launch if we also say Liftoff)
  for (const seg of segments) {
    switch (seg.phase) {
      case "launch":
        add("liftoff", seg.t0, "Liftoff", "Starbase · Boca Chica");
        break;
      case "ascent":
        // Usually continuous with launch; only announce if launch was skipped
        if (!segments.some((s) => s.phase === "launch")) {
          add("ascent", seg.t0, "Ascent", "Powered climb to LEO");
        }
        break;
      case "leo":
        add("leo", seg.t0, "LEO insertion", "Parking orbit · lunar plane");
        break;
      case "tli":
        add("tli", seg.t0, "TLI burn", "Trans-lunar injection");
        break;
      case "coast":
        add("coast", seg.t0, "TLI complete", "Trans-lunar coast");
        break;
      case "approach":
        add("approach", seg.t0, "Lunar approach", "Near-Moon capture corridor");
        break;
      case "braking":
        add("loi", seg.t0, "LOI · braking", "Lunar orbit insertion");
        break;
      case "descent":
        add("descent", seg.t0, "Powered descent", "Final approach");
        break;
      case "landed":
        add("touchdown", seg.t0, "Touchdown", "Mission complete");
        break;
    }
  }

  // Staging: first sample where staged flips true
  const stageIdx = samples.findIndex((s) => s.staged);
  if (stageIdx > 0) {
    const s = samples[stageIdx]!;
    add("staging", s.t, "Staging", "Booster separation");
  } else if (stageIdx === 0 && samples[0]?.staged) {
    // already staged at t0 — skip
  }

  // Stable order by time, then id (dedupe same t)
  events.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return dedupeEvents(events);
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

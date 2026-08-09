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
          add("ascent", seg.t0, "Ascent", "Powered climb to low Earth orbit");
        }
        break;
      case "lowEarthOrbit":
        add(
          "lowEarthOrbit",
          seg.t0,
          "Low Earth orbit insertion",
          "Parking orbit · due-east",
        );
        break;
      case "translunarInjection":
        add(
          "translunarInjection",
          seg.t0,
          "Translunar injection burn",
          "Finite prograde inject · ~2–4 min",
        );
        break;
      case "coast":
        add(
          "coast",
          seg.t0,
          "Translunar injection complete",
          "Ballistic 4-body coast · no further burns",
        );
        break;
      case "approach":
        add(
          "lunarOrbitInsertion",
          seg.t0,
          "Lunar orbit insertion burn",
          "Capture into low lunar orbit",
        );
        break;
      case "braking":
        add(
          "lowLunarOrbit",
          seg.t0,
          "Low lunar orbit coast",
          "Parking orbit · ~¾ rev",
        );
        break;
      case "descent":
        add(
          "poweredDescentInitiation",
          seg.t0,
          "Powered descent initiation",
          "Powered descent · south pole",
        );
        break;
      case "landed":
        add("touchdown", seg.t0, "Touchdown", "Lunar south pole");
        break;
      case "impact":
        add(
          "impact",
          seg.t0,
          "Lunar impact",
          "Ballistic · no post-Translunar injection burns",
        );
        break;
      case "entry":
        add("entry", seg.t0, "Entry interface", "Atmospheric entry");
        break;
      case "splashdown":
        add(
          "splashdown",
          seg.t0,
          "Splashdown",
          "Soft landing · Indian Ocean",
        );
        break;
    }
  }

  // Staging: first sample where staged flips true
  const stageIdx = samples.findIndex((s) => s.staged);
  if (stageIdx > 0) {
    const s = samples[stageIdx]!;
    add("staging", s.t, "Staging", "Booster separation");
    // Theater return to launch site beats (kinematic recovery path — see boosterRecovery.ts)
    add(
      "boostback",
      s.t + 4,
      "Boostback",
      "Super Heavy flip · boostback burn",
    );
    add(
      "booster-catch",
      s.t + 272,
      "Booster landing",
      "Landing burn · recovery zone (chopsticks or Gulf)",
    );
  } else if (stageIdx === 0 && samples[0]?.staged) {
    // already staged at t0 — skip
  }

  // Dogleg: first low Earth orbit sample with significant ship burn (plane change)
  const dogleg = samples.find(
    (s) => s.phase === "lowEarthOrbit" && s.burning && s.thrustN > 1e3,
  );
  if (dogleg) {
    add(
      "dogleg",
      dogleg.t,
      "Dogleg",
      "Plane change into lunar plane · paid ship Δv",
    );
  }

  // No midcourse trajectory corrections on the lunar-transfer-style ballistic coast (burns only at lunar orbit insertion/powered descent initiation).

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

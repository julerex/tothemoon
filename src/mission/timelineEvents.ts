/**
 * Narrative callout events for the HUD scrubber.
 */
import { GULF_SCHEDULE } from "../physics/boosterRecovery";
import type { PhaseId } from "../physics/mission";
import type { ReadonlySample } from "../physics/missionTypes";
import type { EventAdder, MissionEvent, PhaseSegment } from "./timeline";

function makeEventAdder(
  events: MissionEvent[],
  durationS: number,
): EventAdder {
  return (id, t, title, detail) => {
    events.push({ id, t, u: clamp01(t / durationS), title, detail });
  };
}

export function buildEvents(
  samples: readonly ReadonlySample[],
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

function addStagingEvents(add: EventAdder, samples: readonly ReadonlySample[]): void {
  const stageIdx = samples.findIndex((s) => s.staged);
  if (stageIdx <= 0) return;
  pushStagingTrio(add, samples[stageIdx]!.t);
}

function pushStagingTrio(add: EventAdder, t: number): void {
  add("staging", t, "Staging", "Booster separation");
  add("boostback", t + 4, "Boostback", "Super Heavy flip · boostback burn");
  add(
    "landing-burn",
    t + GULF_SCHEDULE.landingStartS,
    "Landing burn",
    "Super Heavy landing burn · ~5 km AGL",
  );
  add(
    "booster-catch",
    t + GULF_SCHEDULE.landingEndS,
    "Booster landing",
    "Chopsticks catch or Gulf hard splash",
  );
}

function addDoglegEvent(add: EventAdder, samples: readonly ReadonlySample[]): void {
  const dogleg = findDoglegSample(samples);
  if (!dogleg) return;
  add("dogleg", dogleg.t, "Dogleg", "Plane change into lunar plane · paid ship Δv");
}

function findDoglegSample(samples: readonly ReadonlySample[]): ReadonlySample | undefined {
  return samples.find(
    (s) => s.phase === "lowEarthOrbit" && s.burning && s.thrustN > 1e3,
  );
}

function hasFlightTestPhases(samples: readonly ReadonlySample[]): boolean {
  return samples.some((s) => s.phase === "entry" || s.phase === "splashdown");
}

function addFlightTestBeats(
  add: EventAdder,
  samples: readonly ReadonlySample[],
  segments: PhaseSegment[],
): void {
  if (!hasFlightTestPhases(samples)) return;
  add("max-q", 58, "Max Q", "Peak aerodynamic stress");
  addSecoEvent(add, samples);
  addPayloadEvents(add);
  addRelightEvent(add, samples);
  addLandingStepEvents(add, segments);
}

function addPayloadEvents(add: EventAdder): void {
  // Public T+ table (F13.PAYLOAD_START / END) — theater has no baked payload samples.
  add(
    "payload-start",
    1000,
    "Payload deploy",
    "Pez door open · Starlink V3 deploy start",
  );
  add(
    "payload-complete",
    1659,
    "Payload complete",
    "20 Starlink V3 on the suborbital path",
  );
}

function addSecoEvent(add: EventAdder, samples: readonly ReadonlySample[]): void {
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

function addRelightEvent(add: EventAdder, samples: readonly ReadonlySample[]): void {
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
  const splash = segments.find((s) => s.phase === "splashdown");
  if (!splash) return;
  add(
    "splash-drone",
    splash.t0 + 8,
    "Recovery drone",
    "Sea-level orbit of the floating ship",
  );
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


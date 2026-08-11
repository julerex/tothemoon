/**
 * Pre-liftoff countdown on the transport clock.
 *
 * Physics samples still start at t = 0 (liftoff). Transport progress maps
 * [0, 1] onto [−PRELAUNCH_COUNTDOWN_S, durationS] so the webcast clock can
 * open at T−00:02:00 with the stack on the pad.
 */

import type { MissionTimeline } from "./timeline";

/** Seconds of hold before liftoff (webcast T− clock). */
export const PRELAUNCH_COUNTDOWN_S = 120;

/** Total transport length: countdown + flight. */
export function transportDurationS(physicsDurationS: number): number {
  return Math.max(physicsDurationS, 1) + PRELAUNCH_COUNTDOWN_S;
}

/**
 * Convert normalized transport progress u ∈ [0, 1] to physics mission time (s).
 * Negative = pre-liftoff countdown.
 */
export function transportUToPhysicsT(
  u: number,
  physicsDurationS: number,
): number {
  const total = transportDurationS(physicsDurationS);
  const uu = Math.min(1, Math.max(0, u));
  return uu * total - PRELAUNCH_COUNTDOWN_S;
}

/**
 * Convert physics mission time (s) to transport u ∈ [0, 1].
 */
export function physicsTToTransportU(
  physicsT: number,
  physicsDurationS: number,
): number {
  const total = transportDurationS(physicsDurationS);
  return Math.min(1, Math.max(0, (physicsT + PRELAUNCH_COUNTDOWN_S) / total));
}

/**
 * Physics sample progress u for {@link sampleAtProgress} on a {@link Trajectory}.
 * Pre-liftoff clamps to the pad (first sample).
 */
export function physicsTToSampleU(
  physicsT: number,
  physicsDurationS: number,
): number {
  if (physicsT <= 0) return 0;
  const dur = Math.max(physicsDurationS, 1);
  return Math.min(1, physicsT / dur);
}

/**
 * Remap timeline scrub fractions so marks line up with a transport clock that
 * includes pre-liftoff. Event/segment **times** stay physics-relative (liftoff = 0).
 */
function remapSegmentU(seg: MissionTimeline["segments"][number], physicsDurationS: number) {
  return {
    ...seg,
    u0: physicsTToTransportU(seg.t0, physicsDurationS),
    u1: physicsTToTransportU(seg.t1, physicsDurationS),
  };
}

function remapEventU(ev: MissionTimeline["events"][number], physicsDurationS: number) {
  return { ...ev, u: physicsTToTransportU(ev.t, physicsDurationS) };
}

export function timelineWithPrelaunch(
  timeline: MissionTimeline,
  physicsDurationS: number,
): MissionTimeline {
  return {
    durationS: transportDurationS(physicsDurationS),
    segments: timeline.segments.map((seg) => remapSegmentU(seg, physicsDurationS)),
    events: timeline.events.map((ev) => remapEventU(ev, physicsDurationS)),
  };
}

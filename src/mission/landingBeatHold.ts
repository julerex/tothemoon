/**
 * Terminal landing-beat hold: pin 1×, settle camera, delay complete card.
 * Shared by lunar and Flight 13 theaters.
 *
 * Pure: {@link stepLandingBeat} maps (state, frame input) to the next state, a
 * card flag, and a description of the side effects to apply — same shape as the
 * transport reducers in `clock.ts`. Callers own the clock and camera, so the
 * transition itself stays testable without stubbing six callbacks.
 */

import type { CameraMode } from "../camera/modes";
import {
  classifyLandingBeat,
  landingBeatCameraMode,
  landingBeatCardReady,
  type LandingBeatKind,
} from "./landingBeat";
import type { PhaseId } from "../physics/missionTypes";

/** Immutable hold state for one mission theater. */
export type LandingBeatState = Readonly<{
  kind: LandingBeatKind | null;
  /** performance.now() when the hold started; null → card ready immediately */
  holdStartMs: number | null;
  /** One-shot settle applied for the current complete edge */
  settled: boolean;
  wasComplete: boolean;
}>;

/** Fresh hold state (mission start, or a scrub back before complete). */
export function createLandingBeatState(): LandingBeatState {
  return Object.freeze({
    kind: null,
    holdStartMs: null,
    settled: false,
    wasComplete: false,
  });
}

/** One frame of mission state; no callbacks. */
export type LandingBeatInput = Readonly<{
  completeRaw: boolean;
  phase: PhaseId;
  /** Map splashdown → landed for classify when needed */
  classifyPhase?: PhaseId;
  playing: boolean;
  nowMs: number;
  clockSpeed: number;
  staged: boolean;
}>;

/** What the caller should do to the clock and camera after the transition. */
export type LandingBeatEffects = Readonly<{
  /** Playback is faster than 1× and should be pinned back for the beat. */
  pinSpeed1x: boolean;
  /** Non-null → sync guided-camera state to this frame. */
  autoCamPhase: Readonly<{ phase: PhaseId; staged: boolean }> | null;
  /** Non-null → ease onto this mode and report it as an auto-cam cut. */
  settleCamera: CameraMode | null;
}>;

const NO_EFFECTS: LandingBeatEffects = Object.freeze({
  pinSpeed1x: false,
  autoCamPhase: null,
  settleCamera: null,
});

/** Result of advancing the beat by one frame. */
export type LandingBeatStep = Readonly<{
  state: LandingBeatState;
  /** Whether the mission-complete card should show. */
  showCompleteCard: boolean;
  effects: LandingBeatEffects;
}>;

/** Hold has run long enough (or never started, when paused at the edge). */
function cardReadyFromHold(state: LandingBeatState, nowMs: number): boolean {
  return (
    state.holdStartMs == null ||
    landingBeatCardReady((nowMs - state.holdStartMs) / 1000)
  );
}

/** First frame at complete: latch the beat kind and start the hold clock. */
function onRisingComplete(
  state: LandingBeatState,
  beatKind: LandingBeatKind | null,
  input: LandingBeatInput,
): LandingBeatState {
  if (state.wasComplete) return state;
  return Object.freeze({
    ...state,
    kind: beatKind,
    settled: false,
    holdStartMs: input.playing ? input.nowMs : null,
  });
}

/** One-shot settle: pin 1× and frame the landing camera while the hold runs. */
function settleEffects(
  state: LandingBeatState,
  beatKind: LandingBeatKind | null,
  input: LandingBeatInput,
): LandingBeatEffects {
  if (!input.playing || state.settled || !beatKind) return NO_EFFECTS;
  return Object.freeze({
    pinSpeed1x: Math.abs(input.clockSpeed) > 1 + 1e-9,
    autoCamPhase: Object.freeze({ phase: input.phase, staged: input.staged }),
    settleCamera: landingBeatCameraMode(beatKind),
  });
}

function advanceCompleteBeat(
  state: LandingBeatState,
  input: LandingBeatInput,
): LandingBeatStep {
  const beatKind = classifyLandingBeat(input.classifyPhase ?? input.phase, input.completeRaw);
  const risen = onRisingComplete(state, beatKind, input);
  const effects = settleEffects(risen, beatKind, input);
  const settled = risen.settled || effects.settleCamera != null;
  return Object.freeze({
    state: Object.freeze({ ...risen, kind: beatKind, wasComplete: true, settled }),
    showCompleteCard: input.completeRaw && cardReadyFromHold(risen, input.nowMs),
    effects,
  });
}

/**
 * Advance landing-beat state for one frame.
 * Scrubbing back before complete resets the hold.
 */
export function stepLandingBeat(
  state: LandingBeatState,
  input: LandingBeatInput,
): LandingBeatStep {
  if (!input.completeRaw) {
    return Object.freeze({
      state: createLandingBeatState(),
      showCompleteCard: false,
      effects: NO_EFFECTS,
    });
  }
  return advanceCompleteBeat(state, input);
}

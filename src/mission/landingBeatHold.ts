/**
 * Terminal landing-beat hold: pin 1×, settle camera, delay complete card.
 * Shared by lunar and Flight 13 theaters.
 */

import type { CameraMode } from "../camera/modes";
import {
  classifyLandingBeat,
  landingBeatCameraMode,
  landingBeatCardReady,
  type LandingBeatKind,
} from "./landingBeat";
import type { PhaseId } from "../physics/missionTypes";

/** Mutable hold state closed over by a mission theater. */
export type LandingBeatState = {
  kind: LandingBeatKind | null;
  /** performance.now() when the hold started; null → card ready immediately */
  holdStartMs: number | null;
  /** One-shot settle applied for the current complete edge */
  settled: boolean;
  wasComplete: boolean;
};

/** Fresh hold state (mission start). */
export function createLandingBeatState(): LandingBeatState {
  return {
    kind: null,
    holdStartMs: null,
    settled: false,
    wasComplete: false,
  };
}

/** Clear hold when scrubbing back before complete. */
export function clearLandingBeat(state: LandingBeatState): void {
  state.kind = null;
  state.holdStartMs = null;
  state.settled = false;
  state.wasComplete = false;
}

function onRisingComplete(
  state: LandingBeatState,
  beatKind: LandingBeatKind | null,
  playing: boolean,
  nowMs: number,
): void {
  state.kind = beatKind;
  state.settled = false;
  state.holdStartMs = playing ? nowMs : null;
}

export type LandingSettleArgs = {
  state: LandingBeatState;
  beatKind: LandingBeatKind | null;
  playing: boolean;
  clockSpeed: number;
  setSpeed: (rate: number) => void;
  phase: PhaseId;
  staged: boolean;
  setAutoCamPhase: (phase: PhaseId, staged: boolean) => void;
  easeToMode: (mode: CameraMode, opts: { frame: boolean }) => void;
  notifyAutoCamera: (mode: CameraMode) => void;
};

/** One-shot: pin 1× and settle camera while the hold runs. */
export function maybeSettleLandingBeat(args: LandingSettleArgs): void {
  const { state, beatKind, playing } = args;
  if (!playing || state.settled || !beatKind) return;
  state.settled = true;
  if (Math.abs(args.clockSpeed) > 1 + 1e-9) args.setSpeed(1);
  const mode = landingBeatCameraMode(beatKind);
  args.setAutoCamPhase(args.phase, args.staged);
  args.easeToMode(mode, { frame: true });
  args.notifyAutoCamera(mode);
}

export type LandingBeatStep = {
  completeRaw: boolean;
  phase: PhaseId;
  /** Map splashdown → landed for classify when needed */
  classifyPhase?: PhaseId;
  playing: boolean;
  nowMs: number;
  clockSpeed: number;
  staged: boolean;
  setSpeed: (rate: number) => void;
  setAutoCamPhase: (phase: PhaseId, staged: boolean) => void;
  easeToMode: (mode: CameraMode, opts: { frame: boolean }) => void;
  notifyAutoCamera: (mode: CameraMode) => void;
};

function settleFromStep(state: LandingBeatState, step: LandingBeatStep, beatKind: LandingBeatKind | null): void {
  maybeSettleLandingBeat({
    state, beatKind, playing: step.playing, clockSpeed: step.clockSpeed,
    setSpeed: step.setSpeed, phase: step.phase, staged: step.staged,
    setAutoCamPhase: step.setAutoCamPhase, easeToMode: step.easeToMode,
    notifyAutoCamera: step.notifyAutoCamera,
  });
}

function cardReadyFromHold(state: LandingBeatState, nowMs: number): boolean {
  return state.holdStartMs == null || landingBeatCardReady((nowMs - state.holdStartMs) / 1000);
}

function advanceCompleteBeat(state: LandingBeatState, step: LandingBeatStep): boolean {
  const phaseForKind = step.classifyPhase ?? step.phase;
  const beatKind = classifyLandingBeat(phaseForKind, step.completeRaw);
  if (!state.wasComplete) onRisingComplete(state, beatKind, step.playing, step.nowMs);
  state.wasComplete = true;
  state.kind = beatKind;
  settleFromStep(state, step, beatKind);
  return step.completeRaw && cardReadyFromHold(state, step.nowMs);
}

/**
 * Advance landing-beat state for one frame.
 * @returns whether the complete card should show
 */
export function stepLandingBeat(
  state: LandingBeatState,
  step: LandingBeatStep,
): boolean {
  if (!step.completeRaw) {
    clearLandingBeat(state);
    return false;
  }
  return advanceCompleteBeat(state, step);
}

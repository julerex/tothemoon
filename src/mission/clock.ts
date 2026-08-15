/**
 * Normalized mission transport clock for play/pause/scrub/speed.
 *
 * Progress `t` is in [0, 1]. At |speed| = 1, wall-clock duration equals the
 * mission duration; higher |speed| compresses playback. Negative speed rewinds.
 *
 * Pure transitions operate on {@link ClockState}. {@link createMissionClock}
 * returns a thin shell that holds state and notifies subscribers (seek / tick
 * only) — all transport logic stays in the pure reducers above it.
 */

/** Listener called with normalized progress after seek/tick. */
export type ClockListener = (t: number) => void;

/** Immutable transport state (normalized progress, play flag, signed speed). */
export type ClockState = Readonly<{
  /** Normalized progress in [0, 1]. */
  t: number;
  /** True while the clock advances on `tick`. */
  playing: boolean;
  /** Signed playback rate (mission-duration multiples per wall second). */
  speed: number;
}>;

/** Initial state: paused at t = 0, speed 1. */
export function initialClockState(): ClockState {
  return Object.freeze({ t: 0, playing: false, speed: 1 });
}

/** Clamp to [0, 1]. */
export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Signed rate; |speed| ≥ 0.1. Negative rewinds. Non-finite / zero → 1.
 */
export function normalizeSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed === 0) return 1;
  const mag = Math.max(0.1, Math.abs(speed));
  return speed < 0 ? -mag : mag;
}

/** Replace playback rate (does not change t / playing). */
export function clockSetSpeed(state: ClockState, speed: number): ClockState {
  const next = normalizeSpeed(speed);
  if (next === state.speed) return state;
  return Object.freeze({ ...state, speed: next });
}

/** Start advancing on subsequent ticks. */
export function clockPlay(state: ClockState): ClockState {
  if (state.playing) return state;
  return Object.freeze({ ...state, playing: true });
}

/** Stop advancing (keeps current t). */
export function clockPause(state: ClockState): ClockState {
  if (!state.playing) return state;
  return Object.freeze({ ...state, playing: false });
}

/** Toggle play/pause. */
export function clockToggle(state: ClockState): ClockState {
  return Object.freeze({ ...state, playing: !state.playing });
}

/** Scrub to absolute normalized time (clamped). */
export function clockSeek(state: ClockState, t: number): ClockState {
  const next = clamp01(t);
  if (next === state.t) return state;
  return Object.freeze({ ...state, t: next });
}

/**
 * Advance by real delta seconds while playing.
 * At |speed| 1, full mission takes `missionDurationS` real seconds.
 * Negative speed rewinds; clamps and pauses at 0 / 1.
 * Returns the same reference when paused or when state is unchanged.
 */
function applyEndClamps(speed: number, t: number, playing: boolean): { t: number; playing: boolean } {
  if (speed > 0 && t >= 1) return { t: 1, playing: false };
  if (speed < 0 && t <= 0) return { t: 0, playing: false };
  return { t, playing };
}

export function clockTick(
  state: ClockState,
  dtSec: number,
  missionDurationS: number,
): ClockState {
  if (!state.playing) return state;
  if (!(missionDurationS > 0) || !Number.isFinite(dtSec)) return state;
  const rate = state.speed / missionDurationS;
  const next = applyEndClamps(state.speed, clamp01(state.t + dtSec * rate), state.playing);
  if (next.t === state.t && next.playing === state.playing) return state;
  return Object.freeze({ ...state, t: next.t, playing: next.playing });
}

/**
 * Mission clock: thin shell over pure {@link ClockState} transitions.
 * Subscribe notifies on seek / tick (not play/pause/speed alone).
 */
export type MissionClock = Readonly<{
  /** Normalized progress in [0, 1]. */
  readonly t: number;
  /** True while the clock is advancing on `tick`. */
  readonly playing: boolean;
  /** Signed playback rate (mission-duration multiples per wall second). */
  readonly speed: number;
  /** Snapshot of pure transport state. */
  getState: () => ClockState;
  /** Replace entire state (e.g. restore); does not notify. */
  setState: (next: ClockState) => void;
  /** Signed rate; |speed| ≥ 0.1. Negative rewinds. Non-finite / zero → 1. */
  setSpeed: (speed: number) => void;
  /** Start advancing on subsequent `tick` calls. */
  play: () => void;
  /** Stop advancing (keeps current `t`). */
  pause: () => void;
  /** Toggle play/pause. */
  toggle: () => void;
  /** Scrub to absolute normalized time and notify listeners. */
  seek: (t: number) => void;
  /**
   * Advance by real delta seconds.
   * At |speed| 1, full mission takes `missionDurationS` real seconds.
   * Negative speed rewinds; clamps and pauses at 0 / 1.
   */
  tick: (dtSec: number, missionDurationS: number) => void;
  /**
   * Subscribe to progress changes (seek / tick).
   * @returns Unsubscribe function.
   */
  subscribe: (fn: ClockListener) => () => void;
}>;

export function createMissionClock(): MissionClock {
  let state = initialClockState();
  const listeners = new Set<ClockListener>();
  const emit = (): void => {
    for (const fn of listeners) fn(state.t);
  };

  return Object.freeze({
    get t() {
      return state.t;
    },
    get playing() {
      return state.playing;
    },
    get speed() {
      return state.speed;
    },
    getState: () => state,
    setState(next) {
      state = next;
    },
    setSpeed(speed) {
      state = clockSetSpeed(state, speed);
    },
    play() {
      state = clockPlay(state);
    },
    pause() {
      state = clockPause(state);
    },
    toggle() {
      state = clockToggle(state);
    },
    seek(t) {
      state = clockSeek(state, t);
      // Always notify (matches historical scrubber/HUD coupling).
      emit();
    },
    tick(dtSec, missionDurationS) {
      if (!state.playing) return;
      state = clockTick(state, dtSec, missionDurationS);
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  });
}

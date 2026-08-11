/**
 * Normalized mission transport clock for play/pause/scrub/speed.
 *
 * Progress `t` is in [0, 1]. At |speed| = 1, wall-clock duration equals the
 * mission duration; higher |speed| compresses playback. Negative speed rewinds.
 *
 * Pure transitions operate on {@link ClockState}. {@link MissionClock} is a thin
 * shell that holds state and notifies subscribers (seek / tick only).
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
export function clockTick(
  state: ClockState,
  dtSec: number,
  missionDurationS: number,
): ClockState {
  if (!state.playing) return state;
  if (!(missionDurationS > 0) || !Number.isFinite(dtSec)) return state;

  const rate = state.speed / missionDurationS;
  let t = clamp01(state.t + dtSec * rate);
  // Explicit boolean: after `if (!state.playing) return`, TS narrows playing to true
  let playing: boolean = state.playing;

  if (state.speed > 0 && t >= 1) {
    t = 1;
    playing = false;
  } else if (state.speed < 0 && t <= 0) {
    t = 0;
    playing = false;
  }

  if (t === state.t && playing === state.playing) return state;
  return Object.freeze({ ...state, t, playing });
}

/**
 * Mission clock: thin shell over pure {@link ClockState} transitions.
 * Subscribe notifies on seek / tick (not play/pause/speed alone).
 */
export class MissionClock {
  private state: ClockState = initialClockState();
  private listeners = new Set<ClockListener>();

  /** Normalized progress in [0, 1]. */
  get t(): number {
    return this.state.t;
  }

  /** True while the clock is advancing on `tick`. */
  get playing(): boolean {
    return this.state.playing;
  }

  /** Signed playback rate (mission-duration multiples per wall second). */
  get speed(): number {
    return this.state.speed;
  }

  /** Snapshot of pure transport state. */
  getState(): ClockState {
    return this.state;
  }

  /** Replace entire state (e.g. restore); does not notify. */
  setState(next: ClockState): void {
    this.state = next;
  }

  /** Signed rate; |speed| ≥ 0.1. Negative rewinds. Non-finite / zero → 1. */
  setSpeed(speed: number): void {
    this.state = clockSetSpeed(this.state, speed);
  }

  /** Start advancing on subsequent `tick` calls. */
  play(): void {
    this.state = clockPlay(this.state);
  }

  /** Stop advancing (keeps current `t`). */
  pause(): void {
    this.state = clockPause(this.state);
  }

  /** Toggle play/pause. */
  toggle(): void {
    this.state = clockToggle(this.state);
  }

  /** Scrub to absolute normalized time and notify listeners. */
  seek(t: number): void {
    this.state = clockSeek(this.state, t);
    // Always notify (matches historical scrubber/HUD coupling).
    this.emit();
  }

  /**
   * Advance by real delta seconds.
   * At |speed| 1, full mission takes MISSION_DURATION_S real seconds.
   * Negative speed rewinds; clamps and pauses at 0 / 1.
   */
  tick(dtSec: number, missionDurationS: number): void {
    if (!this.state.playing) return;
    this.state = clockTick(this.state, dtSec, missionDurationS);
    this.emit();
  }

  /**
   * Subscribe to progress changes (seek / tick).
   * @returns Unsubscribe function.
   */
  subscribe(fn: ClockListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state.t);
  }
}

/**
 * Normalized mission transport clock for play/pause/scrub/speed.
 *
 * Progress `t` is in [0, 1]. At |speed| = 1, wall-clock duration equals the
 * mission duration; higher |speed| compresses playback. Negative speed rewinds.
 */

/** Listener called with normalized progress after seek/tick. */
export type ClockListener = (t: number) => void;

/**
 * Mission clock: normalized progress t ∈ [0, 1], play/pause, signed speed
 * multiplier (negative = reverse through the mission).
 */
export class MissionClock {
  private _t = 0;
  private _playing = false;
  private _speed = 1;
  private listeners = new Set<ClockListener>();

  /** Normalized progress in [0, 1]. */
  get t(): number {
    return this._t;
  }

  /** True while the clock is advancing on `tick`. */
  get playing(): boolean {
    return this._playing;
  }

  /** Signed playback rate (mission-duration multiples per wall second). */
  get speed(): number {
    return this._speed;
  }

  /** Signed rate; |speed| ≥ 0.1. Negative rewinds. Non-finite / zero → 1. */
  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed === 0) {
      this._speed = 1;
      return;
    }
    const mag = Math.max(0.1, Math.abs(speed));
    this._speed = speed < 0 ? -mag : mag;
  }

  /** Start advancing on subsequent `tick` calls. */
  play(): void {
    this._playing = true;
  }

  /** Stop advancing (keeps current `t`). */
  pause(): void {
    this._playing = false;
  }

  /** Toggle play/pause. */
  toggle(): void {
    this._playing = !this._playing;
  }

  /** Scrub to absolute normalized time and notify listeners. */
  seek(t: number): void {
    this._t = clamp01(t);
    this.emit();
  }

  /**
   * Advance by real delta seconds.
   * At |speed| 1, full mission takes MISSION_DURATION_S real seconds.
   * Negative speed rewinds; clamps and pauses at 0 / 1.
   */
  tick(dtSec: number, missionDurationS: number): void {
    if (!this._playing) return;
    const rate = this._speed / missionDurationS;
    this._t = clamp01(this._t + dtSec * rate);
    if (this._speed > 0 && this._t >= 1) {
      this._t = 1;
      this._playing = false;
    } else if (this._speed < 0 && this._t <= 0) {
      this._t = 0;
      this._playing = false;
    }
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
    for (const fn of this.listeners) fn(this._t);
  }
}

/** Clamp to [0, 1]. */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

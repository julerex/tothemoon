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

  get t(): number {
    return this._t;
  }

  get playing(): boolean {
    return this._playing;
  }

  get speed(): number {
    return this._speed;
  }

  /** Signed rate; |speed| ≥ 0.1. Negative rewinds. */
  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed === 0) {
      this._speed = 1;
      return;
    }
    const mag = Math.max(0.1, Math.abs(speed));
    this._speed = speed < 0 ? -mag : mag;
  }

  play(): void {
    this._playing = true;
  }

  pause(): void {
    this._playing = false;
  }

  toggle(): void {
    this._playing = !this._playing;
  }

  /** Scrub to absolute normalized time. */
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

  subscribe(fn: ClockListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this._t);
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

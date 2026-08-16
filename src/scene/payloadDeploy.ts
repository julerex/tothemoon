/**
 * Flight 13 Pez / Starlink V3 payload deploy (pure).
 *
 * Theater-grade only: hatch open + ~20 sat silhouettes peeling on a delayed
 * trail along the ship path — no extra integrator. Scrub-deterministic from
 * mission `t` and the public T+ window in {@link F13}.
 *
 * @see payloadFx.ts — THREE meshes / sprites
 * @see docs/VISUAL_REALISM.md — V16
 */

import { F13 } from "../physics/flight13Mission";

/** Public deploy window start (s). */
export const PAYLOAD_START_S = F13.PAYLOAD_START;
/** Public deploy window end (s). */
export const PAYLOAD_END_S = F13.PAYLOAD_END;
/** Starlink V3 count on Flight 13. */
export const PAYLOAD_SAT_COUNT = 20;

/** Seconds for the Pez door to swing open after PAYLOAD_START. */
const HATCH_OPEN_S = 35;
/** Seconds for the door to close after PAYLOAD_END. */
const HATCH_CLOSE_S = 45;
/** Each sat peels over this duration after its release epoch. */
const SAT_PEEL_S = 70;
/** Fade-out after the public deploy window ends. */
const SAT_FADE_S = 150;

export type PayloadSatPose = Readonly<{
  visible: boolean;
  opacity: number;
  /** Craft-local offset from the bay (mesh units). */
  x: number;
  y: number;
  z: number;
  scale: number;
}>;

/**
 * Overall deploy activity in [0, 1]: hatch / sats visible when > ~0.02.
 * Outside the public window (plus brief close fade) returns 0.
 */
export function payloadDeployStrength(t: number): number {
  if (!Number.isFinite(t)) return 0;
  if (t < PAYLOAD_START_S) return 0;
  if (t <= PAYLOAD_END_S) return 1;
  const close = (t - PAYLOAD_END_S) / HATCH_CLOSE_S;
  if (close >= 1) return 0;
  return Math.max(0, 1 - close);
}

/**
 * Pez door open fraction in [0, 1].
 * Opens after PAYLOAD_START; stays open through the window; closes after END.
 */
export function payloadHatchOpen(t: number): number {
  if (!Number.isFinite(t) || t < PAYLOAD_START_S) return 0;
  if (t < PAYLOAD_START_S + HATCH_OPEN_S) {
    const u = (t - PAYLOAD_START_S) / HATCH_OPEN_S;
    return u * u;
  }
  if (t <= PAYLOAD_END_S) return 1;
  const close = (t - PAYLOAD_END_S) / HATCH_CLOSE_S;
  if (close >= 1) return 0;
  return Math.max(0, 1 - close);
}

/** Release epoch for sat index `i` in [0, PAYLOAD_SAT_COUNT). */
export function payloadSatReleaseT(i: number): number {
  const n = Math.max(1, PAYLOAD_SAT_COUNT);
  const u = (i + 0.5) / n;
  return PAYLOAD_START_S + HATCH_OPEN_S * 0.6 + u * (PAYLOAD_END_S - PAYLOAD_START_S - HATCH_OPEN_S);
}

/**
 * One sat silhouette pose in craft mesh units.
 * Peels aft/outboard from the bay, holds through the window, fades after END.
 */
export function payloadSatPose(i: number, t: number): PayloadSatPose {
  const hidden: PayloadSatPose = Object.freeze({
    visible: false, opacity: 0, x: 0, y: 0, z: 0, scale: 0,
  });
  if (!Number.isFinite(t) || i < 0 || i >= PAYLOAD_SAT_COUNT) return hidden;
  const release = payloadSatReleaseT(i);
  if (t < release) return hidden;
  const age = t - release;
  const peel = Math.min(1, age / SAT_PEEL_S);
  const fade =
    t <= PAYLOAD_END_S
      ? 1
      : Math.max(0, 1 - (t - PAYLOAD_END_S) / SAT_FADE_S);
  if (fade <= 0.02) return hidden;
  // Stagger direction so sats fan out instead of stacking.
  const ang = (i / PAYLOAD_SAT_COUNT) * Math.PI * 1.4 - 0.35;
  const out = 0.08 + peel * (0.55 + 0.12 * (i % 5));
  const aft = peel * (0.35 + 0.08 * ((i * 3) % 7));
  return Object.freeze({
    visible: true,
    opacity: 0.85 * fade,
    x: Math.sin(ang) * out,
    y: -0.14 - Math.cos(ang) * out * 0.35 - peel * 0.08,
    z: 0.55 - aft,
    scale: 0.035 * (0.85 + 0.15 * fade),
  });
}

/**
 * Flight 13 ship attitude modes (theater).
 *
 * Pure helpers for entry belly-flop, landing flip, and engine step-down.
 * Mesh convention (see craft.ts): local +Z = nose, −Z = engines, +Y ≈ windward tiles.
 */

import type { PhaseId } from "./missionTypes";

/** Official approximate T+ anchors used for attitude / engine cadence. */
export const F13_ATT = {
  MAX_Q: 58,
  ENTRY: 2850,
  TRANSONIC: 3743,
  SUBSONIC: 3781,
  LAND_BURN: 3901,
  LAND_FLIP: 3903,
  LAND_3TO2: 3912,
  LAND_2TO1: 3919,
  SPLASH: 3921,
} as const;

/**
 * Visual / narrative attitude for the free-flying ship.
 * - prograde: nose along air-relative velocity (ascent / coast)
 * - belly: heat-shield (+Y) into wind — entry / terminal belly-flop
 * - engines_first: engines into wind (nose anti-velocity) — landing burn
 * - radial_up: stack upright (pad / touchdown settle)
 */
export type ShipAttitudeMode =
  | "prograde"
  | "belly"
  | "engines_first"
  | "radial_up";

/**
 * Pick attitude mode from mission time, phase, and altitude.
 *
 * Entry interface → belly-flop; landing burn → engines-first after a short flip;
 * final meters → radial up for a readable splash settle.
 */
function landingAttitude(t: number): ShipAttitudeMode | null {
  if (t < F13_ATT.LAND_BURN || t >= F13_ATT.SPLASH) return null;
  return t < F13_ATT.LAND_FLIP ? "belly" : "engines_first";
}

export function shipAttitudeMode(
  t: number, phase: PhaseId, altKm: number, burning: boolean,
): ShipAttitudeMode {
  if (phase === "splashdown" || (phase === "descent" && altKm < 0.15)) return "radial_up";
  const land = landingAttitude(t);
  if (land) return land;
  if (phase === "descent") return burning ? "engines_first" : "belly";
  if (phase === "entry") return altKm < 120 || t >= F13_ATT.ENTRY ? "belly" : "prograde";
  if (phase === "coast" && t >= F13_ATT.ENTRY - 120 && altKm < 160) return "belly";
  return "prograde";
}

/**
 * Blend weight from belly → engines-first during the landing flip.
 * 0 = pure belly, 1 = pure engines-first. Outside the flip window returns 0 or 1.
 */
export function landingFlipBlend(t: number): number {
  const t0 = F13_ATT.LAND_FLIP;
  const t1 = F13_ATT.LAND_FLIP + 2.5;
  if (t < F13_ATT.LAND_BURN) return 0;
  if (t < t0) return 0;
  if (t >= t1) return 1;
  const u = (t - t0) / (t1 - t0);
  return u * u * (3 - 2 * u);
}

/**
 * Theater Raptor count during the ship landing burn (3 → 2 → 1).
 * 0 when not in the landing-burn window.
 */
export function landingEngineCount(t: number): number {
  if (t < F13_ATT.LAND_BURN || t >= F13_ATT.SPLASH) return 0;
  if (t < F13_ATT.LAND_3TO2) return 3;
  if (t < F13_ATT.LAND_2TO1) return 2;
  return 1;
}

/**
 * Entry plasma strength in [0, 1] — hypersonic heat pulse.
 * Peaks mid-entry; fades through transonic. Scrub-deterministic.
 */
function plasmaAltU(altKm: number): number {
  if (altKm >= 25 && altKm <= 95) {
    const d = (altKm - 55) / 28;
    return Math.exp(-0.5 * d * d);
  }
  if (altKm > 95 && altKm < 110) return (110 - altKm) / 15;
  if (altKm > 12 && altKm < 25) return (altKm - 12) / 13;
  return 0;
}

function plasmaLate(t: number): number {
  return t > F13_ATT.TRANSONIC ? Math.max(0, 1 - (t - F13_ATT.TRANSONIC) / 40) : 1;
}

export function entryPlasmaStrength(
  t: number, phase: PhaseId, altKm: number, speedKmS: number,
): number {
  if (phase !== "entry" && phase !== "descent" && phase !== "coast") return 0;
  if (speedKmS < 1.5 || altKm > 110 || altKm < 5 || t < F13_ATT.ENTRY - 60) return 0;
  const speedU = Math.max(0, Math.min(1, (speedKmS - 1.8) / 3.5));
  return Math.max(0, Math.min(1, speedU * plasmaAltU(altKm) * plasmaLate(t) * 1.15));
}

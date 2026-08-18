/**
 * Flight 13 ship attitude modes (theater).
 *
 * Pure helpers for entry belly-flop, landing flip, and engine step-down.
 * Mesh convention (see craft.ts): local +Z = nose, −Z = engines, +Y ≈ windward tiles.
 */

import { EARTH_SURFACE_ALT_KM } from "./constants";
import { FLIGHT13_SPLASH_LAT } from "./flight13Corridor";
import type { PhaseId } from "./missionTypes";
import { geocentricRadiusAt } from "./wgs84";

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
 * - afloat: hull in the water, nose horizontal, belly down
 */
export type ShipAttitudeMode =
  | "prograde"
  | "belly"
  | "engines_first"
  | "radial_up"
  | "afloat";

/**
 * Pick attitude mode from mission time, phase, and altitude.
 *
 * Entry interface → belly-flop; landing burn → engines-first after a short flip;
 * splash → lie horizontal in the water.
 */
function landingAttitude(t: number): ShipAttitudeMode | null {
  if (t < F13_ATT.LAND_BURN || t >= F13_ATT.SPLASH) return null;
  return t < F13_ATT.LAND_FLIP ? "belly" : "engines_first";
}

/** Starship barrel radius (km). Engine origin sits this far from the belly. */
export const SHIP_BARREL_RADIUS_KM = 4.5 / 1000;

/** Visual waterline above the shared 50 m surface shell (km). */
export const SPLASH_WATERLINE_ALT_KM = 0.001;

/** Seconds after splash to finish the tip-over onto the belly. */
export const SPLASH_LIE_S = 2.5;

/**
 * 0 at splash contact (still engines-down), 1 once the hull is lying in the water.
 */
export function splashLieBlend(t: number): number {
  if (t < F13_ATT.SPLASH) return 0;
  const u = (t - F13_ATT.SPLASH) / SPLASH_LIE_S;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}

/**
 * Geocentric radius (km) of the engine origin while floating on the WGS84
 * splash site. Upright: engines at the waterline. Lying: belly slightly in the water.
 */
export function splashFloatRadiusKm(t: number): number {
  const water = geocentricRadiusAt(
    FLIGHT13_SPLASH_LAT,
    EARTH_SURFACE_ALT_KM + SPLASH_WATERLINE_ALT_KM,
  );
  return water + SHIP_BARREL_RADIUS_KM * 0.28 * splashLieBlend(t);
}

/**
 * Gentle swell rock while the ship floats (theater, not a wave model).
 * Scrub-deterministic function of mission time.
 *
 * @param t - Mission time (s)
 */
export function splashFloatBob(t: number): { pitchRad: number; rollRad: number } {
  return {
    pitchRad: 0.04 * Math.sin(t * 0.74),
    rollRad: 0.022 * Math.sin(t * 1.1 + 1.1),
  };
}

export function shipAttitudeMode(
  t: number, phase: PhaseId, altKm: number, burning: boolean,
): ShipAttitudeMode {
  if (phase === "splashdown") return "afloat";
  if (phase === "descent" && altKm < 0.15) return "engines_first";
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

/** Rest forward-flap pitch (rad) — slightly trailing at cruise. */
export const FWD_FLAP_REST_RAD = 0.08;
/** Peak belly-flop forward-flap extra pitch (rad). */
export const FWD_FLAP_BELLY_RAD = 0.48;
/** Peak belly-flop aft-elevon pitch (rad). */
export const AFT_ELEVON_BELLY_RAD = 0.40;

export type FlapDeflection = Readonly<{
  /** Forward flap pitch about local +X (rad). */
  fwd: number;
  /** Aft elevon pitch about local +X (rad). */
  aft: number;
}>;

/**
 * Whether Flight 13 entry flap motion is in the live window.
 * Lunar missions use the same craft mesh but much larger `t`, so they stay at rest.
 */
export function entryFlapsActive(t: number, phase: PhaseId | string): boolean {
  if (phase !== "entry" && phase !== "descent" && phase !== "splashdown" && phase !== "coast") {
    return false;
  }
  return t >= F13_ATT.ENTRY - 180 && t <= F13_ATT.SPLASH + 30;
}

/**
 * Theater flap / elevon deflection from attitude mode (not CFD AoA).
 * Full throw in `belly`, taper through transonic, fold toward rest at `engines_first`.
 *
 * @param t - Mission time (s)
 * @param phase - Timeline phase
 * @param altKm - Earth altitude (km)
 * @param mode - {@link shipAttitudeMode} result
 */
export function entryFlapDeflectionRad(
  t: number,
  phase: PhaseId | string,
  altKm: number,
  mode: ShipAttitudeMode,
): FlapDeflection {
  if (
    !entryFlapsActive(t, phase) ||
    mode === "prograde" ||
    mode === "radial_up" ||
    mode === "afloat"
  ) {
    return { fwd: FWD_FLAP_REST_RAD, aft: 0 };
  }
  let u = mode === "engines_first" ? 1 - landingFlipBlend(t) : 1;
  if (t >= F13_ATT.TRANSONIC) {
    u *= Math.max(0, 1 - (t - F13_ATT.TRANSONIC) / 50);
  }
  if (altKm < 10) u *= Math.max(0, (altKm - 0.2) / 9.8);
  u = Math.max(0, Math.min(1, u));
  return {
    fwd: FWD_FLAP_REST_RAD + FWD_FLAP_BELLY_RAD * u,
    aft: AFT_ELEVON_BELLY_RAD * u,
  };
}

type Xyz = Readonly<{ x: number; y: number; z: number }>;

/**
 * Signed visual bank in [−1, 1]: craft local +X (starboard) dotted with
 * `localUp × airVel` (starboard relative to the wind). Theater cue only.
 */
export function entryVisualBank(side: Xyz, airVel: Xyz, localUp: Xyz): number {
  const aLen = Math.hypot(airVel.x, airVel.y, airVel.z);
  if (!(aLen > 1e-6)) return 0;
  const ax = airVel.x / aLen;
  const ay = airVel.y / aLen;
  const az = airVel.z / aLen;
  const lx = localUp.y * az - localUp.z * ay;
  const ly = localUp.z * ax - localUp.x * az;
  const lz = localUp.x * ay - localUp.y * ax;
  const lLen = Math.hypot(lx, ly, lz);
  if (!(lLen > 1e-6)) return 0;
  const bank = (side.x * lx + side.y * ly + side.z * lz) / lLen;
  if (!Number.isFinite(bank)) return 0;
  return Math.max(-1, Math.min(1, bank));
}

/** Plasma sprite X offset / opacity skew from {@link entryVisualBank}. */
export type PlasmaBankOffset = Readonly<{
  trailX: number;
  sheathX: number;
  trailOpMul: number;
  sheathOpMul: number;
}>;

/**
 * Asymmetric plasma-corridor pose from a signed bank in [−1, 1].
 * Offsets are craft-local km (mesh units before CRAFT_MESH_SCALE).
 */
export function plasmaBankOffset(bank: number): PlasmaBankOffset {
  const b = Number.isFinite(bank) ? Math.max(-1, Math.min(1, bank)) : 0;
  return {
    trailX: b * 0.14,
    sheathX: b * 0.06,
    trailOpMul: 1 + 0.3 * b,
    sheathOpMul: 1 + 0.12 * b,
  };
}
